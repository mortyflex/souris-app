// Souris — Communication Core (Lot B): the fixed French appointment templates

import {
  escapeHtml,
  FOOTER_TEXT_SIZE_PX,
  FOOTER_WORDMARK_HEIGHT,
  FOOTER_WORDMARK_WIDTH,
  normalizeEmailLogoUrl,
  formatAppointmentEmailDate,
  formatAppointmentEmailTime,
  isAppointmentEmailKind,
  parseAppointmentEmailPayload,
  renderAppointmentEmail,
  type AppointmentEmailPayload,
} from '../email-content';

// Friday 2027-03-26 14:30 in Paris (14:30 UTC, winter → +01… March 26 2027 is
// after the DST switch: Europe/Paris is UTC+2, so 13:30 UTC).
const START = new Date('2027-03-26T13:30:00.000Z');

const payload: AppointmentEmailPayload = {
  businessName: 'Salon Amélie',
  clientFirstName: 'Léa',
  appointmentStartAt: START,
  services: ['Coloration', 'Coupe'],
  replyTo: 'amelie@salon.test',
};

const wirePayload = {
  business_name: 'Salon Amélie',
  client_first_name: 'Léa',
  appointment_start_at: START.toISOString(),
  services: ['Coloration', 'Coupe'],
  reply_to: 'amelie@salon.test',
};

describe('payload parsing', () => {
  it('accepts the reconciliation payload and reads the instant', () => {
    const parsed = parseAppointmentEmailPayload(wirePayload);
    expect(parsed).toBeDefined();
    expect(parsed?.businessName).toBe('Salon Amélie');
    expect(parsed?.clientFirstName).toBe('Léa');
    expect(parsed?.appointmentStartAt.toISOString()).toBe(START.toISOString());
    expect(parsed?.services).toEqual(['Coloration', 'Coupe']);
    expect(parsed?.replyTo).toBe('amelie@salon.test');
  });

  it('refuses a payload missing its essentials', () => {
    expect(parseAppointmentEmailPayload({})).toBeUndefined();
    expect(parseAppointmentEmailPayload({ ...wirePayload, business_name: ' ' })).toBeUndefined();
    expect(parseAppointmentEmailPayload({ ...wirePayload, appointment_start_at: 'not a date' })).toBeUndefined();
    expect(parseAppointmentEmailPayload({ ...wirePayload, services: 'Coupe' })).toBeUndefined();
  });

  it('drops an unusable Reply-To instead of failing', () => {
    expect(parseAppointmentEmailPayload({ ...wirePayload, reply_to: 'nope' })?.replyTo).toBeUndefined();
    expect(parseAppointmentEmailPayload({ ...wirePayload, reply_to: null })?.replyTo).toBeUndefined();
  });

  it('knows exactly the three appointment kinds', () => {
    expect(isAppointmentEmailKind('APPOINTMENT_REMINDER')).toBe(true);
    expect(isAppointmentEmailKind('APPOINTMENT_RESCHEDULED')).toBe(true);
    expect(isAppointmentEmailKind('APPOINTMENT_CANCELLED')).toBe(true);
    expect(isAppointmentEmailKind('INACTIVE_CLIENT_FOLLOWUP')).toBe(false);
  });
});

describe('French date and time in the agenda timezone', () => {
  it('formats the Paris local date and time from the UTC instant', () => {
    expect(formatAppointmentEmailDate(START)).toBe('Vendredi 26 mars 2027');
    expect(formatAppointmentEmailTime(START)).toBe('14:30');
  });
});

describe('the reminder template', () => {
  const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload);

  it('carries the subject, the greeting, the schedule, the services and the identity', () => {
    expect(email.subject).toBe('Rappel de votre rendez-vous chez Salon Amélie');
    for (const part of [
      'Bonjour Léa,',
      'Petit rappel pour votre rendez-vous chez Salon Amélie.',
      'Vendredi 26 mars 2027',
      '14:30',
      'Coloration',
      'Coupe',
      'À bientôt,',
    ]) {
      expect(email.html).toContain(part);
      expect(email.text).toContain(part);
    }
    expect(email.text).toContain('• Coloration');
    expect(email.text).toContain('Souris');
    expect(email.html).toContain('Souris');
  });

  it('never contains financial, status or internal data', () => {
    const everything = email.subject + email.html + email.text;
    for (const forbidden of [
      /€|EUR|price|cents|prix/i,
      /acompte|deposit|paiement|payment|encaiss/i,
      /SCHEDULED|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW/,
      /devis|estimation|CA\b/,
      /note interne|notes/i,
    ]) {
      expect(everything).not.toMatch(forbidden);
    }
  });

  it('renders a plain-text version with the same facts', () => {
    expect(email.text.startsWith('Bonjour Léa,')).toBe(true);
    expect(email.text).toContain('Prestations');
  });
});

describe('the rescheduled template', () => {
  const email = renderAppointmentEmail('APPOINTMENT_RESCHEDULED', payload);

  it('announces the modification and shows the NEW schedule and services', () => {
    expect(email.subject).toBe('Votre rendez-vous chez Salon Amélie a été modifié');
    expect(email.text).toContain('a été modifié');
    expect(email.text).toContain('Vendredi 26 mars 2027');
    expect(email.text).toContain('14:30');
    expect(email.text).toContain('Coloration');
    expect(email.html).not.toMatch(/€|price|cents/i);
  });
});

describe('the cancelled template', () => {
  const email = renderAppointmentEmail('APPOINTMENT_CANCELLED', payload);

  it('is short, keeps the date for context and lists no services or prices', () => {
    expect(email.subject).toBe('Votre rendez-vous chez Salon Amélie a été annulé');
    expect(email.text).toContain('a été annulé');
    expect(email.text).toContain('Vendredi 26 mars 2027');
    expect(email.text).not.toContain('Prestations');
    expect(email.html).not.toContain('Prestations');
    expect(email.html).not.toMatch(/€|price|cents/i);
  });
});

describe('the footer logo', () => {
  const LOGO = 'https://example.supabase.co/storage/v1/object/public/brand/logo-mark.png';
  // The EXACT public production asset, byte for byte.
  const PRODUCTION_LOGO =
    'https://oxfqcgbtihczubisjyek.supabase.co/storage/v1/object/public/brand/logo-mark.png';

  it('accepts the exact production URL verbatim and renders the exact wordmark markup', () => {
    expect(normalizeEmailLogoUrl(PRODUCTION_LOGO)).toBe(PRODUCTION_LOGO);
    const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, {
      logoUrl: PRODUCTION_LOGO,
    });
    expect(email.html).toContain(
      `<img src="${PRODUCTION_LOGO}" width="${FOOTER_WORDMARK_WIDTH}" height="${FOOTER_WORDMARK_HEIGHT}" alt="Souris" style="display:block;border:0;outline:none;text-decoration:none;" />`,
    );
  });

  it('reads « Envoyé avec [wordmark] » — one centered row, the wordmark carrying the brand', () => {
    const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, {
      logoUrl: PRODUCTION_LOGO,
    });
    const footer = email.html.slice(email.html.lastIndexOf('<table'));
    // One presentation table row: the discreet wording, THEN the wordmark.
    expect(footer).toContain('role="presentation"');
    expect(footer).toContain('align="center"');
    expect((footer.match(/<tr>/g) ?? []).length).toBe(1);
    expect(footer).toContain('Envoyé avec');
    expect(footer.indexOf('Envoyé avec')).toBeLessThan(footer.indexOf('<img'));
    expect((footer.match(/vertical-align:middle/g) ?? []).length).toBe(2);
    expect(footer).toContain('padding-right:8px');
    // The brand name is the IMAGE: « Souris » never doubles as plain text
    // next to the wordmark — it survives only as the alt attribute.
    expect(footer).not.toContain('Envoyé avec Souris');
    expect(footer.replace('alt="Souris"', '')).not.toContain('Souris');
    // Balance lock: 120×40 wordmark (the exact 3:1 intrinsic ratio of
    // assets/brand/logo-wordmark.png) over discreet, non-bold 12px wording.
    expect(FOOTER_WORDMARK_WIDTH).toBe(120);
    expect(FOOTER_WORDMARK_HEIGHT).toBe(40);
    expect(FOOTER_WORDMARK_WIDTH / FOOTER_WORDMARK_HEIGHT).toBeCloseTo(2172 / 724);
    expect(footer).toContain(`font-size:${FOOTER_TEXT_SIZE_PX}px`);
    expect(FOOTER_WORDMARK_HEIGHT).toBeGreaterThan(2 * FOOTER_TEXT_SIZE_PX);
    expect(footer).not.toContain('font-weight');
  });

  it('canonicalizes the Dashboard paste artifacts: whitespace, newlines, surrounding quotes', () => {
    for (const pasted of [
      `  ${PRODUCTION_LOGO}  `,
      `${PRODUCTION_LOGO}\n`,
      `"${PRODUCTION_LOGO}"`,
      `'${PRODUCTION_LOGO}'`,
      ` "${PRODUCTION_LOGO}" \n`,
    ]) {
      expect(normalizeEmailLogoUrl(pasted)).toBe(PRODUCTION_LOGO);
      const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, { logoUrl: pasted });
      expect(email.html).toContain(`<img src="${PRODUCTION_LOGO}"`);
    }
  });

  it('still refuses internal whitespace and non-HTTPS schemes after normalization', () => {
    for (const bad of [
      'https://bad url/logo.png',
      '"http://insecure.example/logo.png"',
      '""',
      '"',
      undefined,
    ]) {
      expect(normalizeEmailLogoUrl(bad)).toBeUndefined();
    }
  });

  it('renders the wordmark after « Envoyé avec », email-safe and sized', () => {
    const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, { logoUrl: LOGO });
    expect(email.html).toContain(
      `<img src="${LOGO}" width="${FOOTER_WORDMARK_WIDTH}" height="${FOOTER_WORDMARK_HEIGHT}" alt="Souris"`,
    );
    // Layout, colors and content are otherwise unchanged; the plain-text
    // version keeps its own textual footer.
    expect(email.html).toContain('Bonjour Léa,');
    expect(email.text).toContain('Envoyé avec Souris');
    expect(email.text).not.toContain('<img');
  });

  it('every appointment kind shares the same wordmark footer', () => {
    for (const kind of ['APPOINTMENT_REMINDER', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED'] as const) {
      const email = renderAppointmentEmail(kind, payload, { logoUrl: LOGO });
      expect(email.html).toContain(`<img src="${LOGO}" width="${FOOTER_WORDMARK_WIDTH}"`);
      const footer = email.html.slice(email.html.lastIndexOf('<table'));
      expect(footer).not.toContain('Envoyé avec Souris');
    }
  });

  it('keeps the clean « Envoyé avec Souris » text fallback without a configured image', () => {
    const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload);
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('Envoyé avec Souris');
  });

  it('ignores anything that is not a plain HTTPS URL', () => {
    for (const bad of [
      'http://insecure.example/logo.png',
      'data:image/png;base64,AAAA',
      'file:///assets/brand/logo-mark.png',
      '   ',
      'https://bad url/logo.png',
    ]) {
      const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, { logoUrl: bad });
      expect(email.html).not.toContain('<img');
      expect(email.html).toContain('Envoyé avec Souris');
    }
  });

  it('escapes a hostile URL so it cannot break out of the attribute', () => {
    const email = renderAppointmentEmail('APPOINTMENT_REMINDER', payload, {
      logoUrl: 'https://x.test/a.png"onerror="alert(1)',
    });
    expect(email.html).not.toContain('"onerror="');
    expect(email.html).toContain('&quot;onerror=&quot;');
  });
});

describe('escaping', () => {
  it('escapes hostile business, client and service names in the HTML', () => {
    const hostile = renderAppointmentEmail('APPOINTMENT_REMINDER', {
      ...payload,
      businessName: '<script>alert("x")</script> & "Salon"',
      clientFirstName: "Léa <img src=x onerror='y'>",
      services: ['<b>Coloration</b>'],
    });
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).not.toContain('<img');
    expect(hostile.html).not.toContain('<b>Coloration</b>');
    expect(hostile.html).toContain('&lt;script&gt;');
    expect(hostile.html).toContain('&amp; &quot;Salon&quot;');
  });

  it('escapeHtml covers the five metacharacters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
