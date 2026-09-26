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

export interface RenderAppointmentEmailOptions {
  /**
   * Public HTTPS URL of the Souris brand image shown in the footer
   * (SOURIS_EMAIL_LOGO_URL — the variable name is stable even though the
   * asset is the WORDMARK: a public PNG copy of
   * `assets/brand/logo-wordmark.png`, the visual source of truth). Email
   * clients can only load public HTTPS assets — never a bundled app asset,
   * a file path or a data URI. Absent or non-HTTPS, the footer falls back
   * to the plain « Envoyé avec Souris » text.
   */
  readonly logoUrl?: string;
}

/**
 * The Souris WORDMARK (`assets/brand/logo-wordmark.png`, intrinsic
 * 2172×724 = exactly 3:1): 120×40 keeps that ratio to the pixel and reads
 * comfortably on a phone without zooming. The wordmark IS the brand name in
 * the footer — never the small logo-mark, never a redrawn logo.
 */
export const FOOTER_WORDMARK_WIDTH = 120;
export const FOOTER_WORDMARK_HEIGHT = 40;
/** « Envoyé avec » stays discreet and light next to the wordmark. */
export const FOOTER_TEXT_SIZE_PX = 12;

/**
 * THE canonicalization of the configured logo URL, used by the production
 * registry and by the renderer alike. A Dashboard-pasted secret may carry
 * surrounding whitespace, a trailing newline or one layer of surrounding
 * quotes ("https://…"): all are stripped before validation. What remains
 * must be a plain HTTPS URL with no internal whitespace — anything else
 * (http:, data:, file:, blank) is refused and the footer stays text-only.
 */
export function normalizeEmailLogoUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let candidate = raw.trim();
  if (
    candidate.length >= 2 &&
    ((candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'")))
  ) {
    candidate = candidate.slice(1, -1).trim();
  }
  return /^https:\/\/\S+$/.test(candidate) ? candidate : undefined;
}

/**
 * The ONE shared footer of every appointment email kind:
 *
 *   image configured   « Envoyé avec [Souris wordmark] » — the wordmark IS
 *                      the brand name; « Souris » is never duplicated as
 *                      plain text next to it (it survives only as alt text
 *                      for blocked images)
 *   image unavailable  « Envoyé avec Souris » — the clean text fallback
 *
 * One centered horizontal row, built as a small presentation table so the
 * wording and the wordmark stay vertically centered in every mail client
 * (flexbox and inline-block baseline tricks are not reliable in email).
 * The discreet 12px wording sits left, the 120×40 wordmark right, a tight
 * 4px apart. Branding only: no appointment information lives in the image.
 */
function footerHtml(logoUrl: string | undefined): string {
  const canonical = normalizeEmailLogoUrl(logoUrl);
  const textStyle = `vertical-align:middle;font-size:${FOOTER_TEXT_SIZE_PX}px;color:${EMAIL_SOFT};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;`;
  if (canonical === undefined) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto 0;border-collapse:collapse;">
            <tr><td style="${textStyle}">Envoyé avec Souris</td></tr>
          </table>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto 0;border-collapse:collapse;">
            <tr><td style="${textStyle}padding-right:4px;">Envoyé avec</td><td style="vertical-align:middle;"><img src="${escapeHtml(canonical)}" width="${FOOTER_WORDMARK_WIDTH}" height="${FOOTER_WORDMARK_HEIGHT}" alt="Souris" style="display:block;border:0;outline:none;text-decoration:none;" /></td></tr>
          </table>`;
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
  options: RenderAppointmentEmailOptions = {},
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
          ${footerHtml(options.logoUrl)}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, html, text: textLines.join('\n') };
}
