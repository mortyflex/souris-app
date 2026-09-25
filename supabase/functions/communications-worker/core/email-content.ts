// Souris — Communication Core (Lot B): the appointment email content
//
// Fixed V1 transactional templates, French only, one per appointment kind:
//
//   APPOINTMENT_REMINDER      « Rappel de votre rendez-vous chez … »
//   APPOINTMENT_RESCHEDULED   « Votre rendez-vous chez … a été modifié »
//   APPOINTMENT_CANCELLED     « Votre rendez-vous chez … a été annulé »
//
// The payload is what the server reconciliation stored on the queue record
// (business_name, client_first_name, appointment_start_at, services[],
// reply_to) — NOTHING else. No price, deposit, payment, status vocabulary or
// note can appear in an email because the template never receives one.
//
// Every interpolated value is HTML-escaped: a business or service name is
// arbitrary user text and must never become markup. The HTML itself is
// deliberately email-safe — one centered table, inline styles, system fonts,
// no script, no external asset — with a plain-text alternative. The visual
// identity is a restrained Souris: warm surface, white card, plum accent.

const EMAIL_ACCENT = '#654199'; // Souris plum (lavender lav700)
const EMAIL_FOREGROUND = '#19163F';
const EMAIL_SOFT = '#5D5A7A';
const EMAIL_SURFACE = '#FAF7F2'; // warm screen
const EMAIL_CARD = '#FFFFFF';

/**
 * V1 display timezone of the professional's agenda. Souris V1 ships for one
 * French pilot market and stores no business timezone; when one exists it
 * belongs in the payload, not here.
 */
export const APPOINTMENT_EMAIL_TIMEZONE = 'Europe/Paris';

export const APPOINTMENT_EMAIL_KINDS = [
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
] as const;

export type AppointmentEmailKind = (typeof APPOINTMENT_EMAIL_KINDS)[number];

export function isAppointmentEmailKind(kind: string): kind is AppointmentEmailKind {
  return (APPOINTMENT_EMAIL_KINDS as readonly string[]).includes(kind);
}

export interface AppointmentEmailPayload {
  readonly businessName: string;
  readonly clientFirstName: string;
  readonly appointmentStartAt: Date;
  readonly services: readonly string[];
  /** Configured Reply-To of the Business, when present. */
  readonly replyTo: string | undefined;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The same UX-level shape rule as the server and the app. */
export function isUsableEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && EMAIL_SHAPE.test(trimmed);
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Validates the queue payload the server reconciliation stored. Returns
 * undefined for anything malformed: the transport then fails PERMANENTLY —
 * a broken snapshot never becomes a retry loop or a half-empty email.
 */
export function parseAppointmentEmailPayload(
  payload: Readonly<Record<string, unknown>>,
): AppointmentEmailPayload | undefined {
  const businessName = readText(payload.business_name);
  const clientFirstName = readText(payload.client_first_name);
  const startAtText = readText(payload.appointment_start_at);
  if (!businessName || !clientFirstName || !startAtText) return undefined;
  const appointmentStartAt = new Date(startAtText);
  if (Number.isNaN(appointmentStartAt.getTime())) return undefined;
  const rawServices = payload.services;
  if (!Array.isArray(rawServices)) return undefined;
  const services = rawServices.filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0,
  );
  const replyTo = readText(payload.reply_to);
  return {
    businessName,
    clientFirstName,
    appointmentStartAt,
    services,
    replyTo: replyTo !== undefined && isUsableEmailAddress(replyTo) ? replyTo : undefined,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** « vendredi 26 septembre 2026 » in the agenda timezone, capitalized. */
export function formatAppointmentEmailDate(instant: Date): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    timeZone: APPOINTMENT_EMAIL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** « 14:30 » in the agenda timezone. */
export function formatAppointmentEmailTime(instant: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: APPOINTMENT_EMAIL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(instant)
    .replace(' ', '');
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

interface EmailCopy {
  readonly subject: string;
  readonly intro: string;
  readonly outro: string;
}

function copyFor(kind: AppointmentEmailKind, businessName: string): EmailCopy {
  switch (kind) {
    case 'APPOINTMENT_REMINDER':
      return {
        subject: `Rappel de votre rendez-vous chez ${businessName}`,
        intro: `Petit rappel pour votre rendez-vous chez ${businessName}.`,
        outro: 'À bientôt,',
      };
    case 'APPOINTMENT_RESCHEDULED':
      return {
        subject: `Votre rendez-vous chez ${businessName} a été modifié`,
        intro: `Votre rendez-vous chez ${businessName} a été modifié. Voici les nouvelles informations.`,
        outro: 'À bientôt,',
      };
    case 'APPOINTMENT_CANCELLED':
      return {
        subject: `Votre rendez-vous chez ${businessName} a été annulé`,
        intro: `Votre rendez-vous chez ${businessName} a été annulé.`,
        outro: 'À bientôt,',
      };
  }
}

/** Renders one appointment email: subject, robust HTML and plain text. */
export function renderAppointmentEmail(
  kind: AppointmentEmailKind,
  payload: AppointmentEmailPayload,
): RenderedEmail {
  const copy = copyFor(kind, payload.businessName);
  const date = formatAppointmentEmailDate(payload.appointmentStartAt);
  const time = formatAppointmentEmailTime(payload.appointmentStartAt);
  const cancelled = kind === 'APPOINTMENT_CANCELLED';
  const showServices = !cancelled && payload.services.length > 0;

  const textLines = [
    `Bonjour ${payload.clientFirstName},`,
    '',
    copy.intro,
    '',
    date,
    time,
  ];
  if (showServices) {
    textLines.push('', 'Prestations');
    for (const service of payload.services) textLines.push(`• ${service}`);
  }
  textLines.push('', copy.outro, payload.businessName, '', '—', 'Envoyé avec Souris');

  const servicesHtml = showServices
    ? `<p style="margin:24px 0 6px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${EMAIL_SOFT};">Prestations</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
         ${payload.services
           .map(
             (service) =>
               `<tr><td style="padding:2px 0;font-size:15px;color:${EMAIL_FOREGROUND};">&bull;&nbsp;&nbsp;${escapeHtml(service)}</td></tr>`,
           )
           .join('\n         ')}
       </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${EMAIL_SURFACE};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_SURFACE};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:${EMAIL_CARD};border-radius:16px;padding:32px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:left;">
            <tr>
              <td>
                <p style="margin:0 0 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_ACCENT};font-weight:600;">${escapeHtml(payload.businessName)}</p>
                <p style="margin:0 0 16px;font-size:16px;color:${EMAIL_FOREGROUND};">Bonjour ${escapeHtml(payload.clientFirstName)},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:${EMAIL_FOREGROUND};">${escapeHtml(copy.intro)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:100%;background-color:#F4EFFA;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <p style="margin:0;font-size:16px;font-weight:600;color:${EMAIL_ACCENT};">${escapeHtml(date)}</p>
                      <p style="margin:4px 0 0;font-size:15px;color:${EMAIL_FOREGROUND};">${escapeHtml(time)}</p>
                    </td>
                  </tr>
                </table>
                ${servicesHtml}
                <p style="margin:28px 0 2px;font-size:15px;color:${EMAIL_FOREGROUND};">${escapeHtml(copy.outro)}</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:${EMAIL_FOREGROUND};">${escapeHtml(payload.businessName)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${EMAIL_SOFT};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Envoyé avec Souris</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, html, text: textLines.join('\n') };
}
