// Souris — Communication Core (Lot B): the fixed French appointment templates

import {
  escapeHtml,
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
