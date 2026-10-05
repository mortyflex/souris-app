import { isValidClientEmail } from '@/domain/clients';
import {
  buildClientFromForm,
  EMPTY_CLIENT_FORM,
  isAcceptableBirthday,
  isAcceptableEmail,
  isValidClientForm,
  toClientFormValues,
} from '../client-form';

describe('Client form', () => {
  it('requires a non-blank firstName', () => {
    expect(isValidClientForm({ ...EMPTY_CLIENT_FORM })).toBe(false);
    expect(isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: '   ' })).toBe(false);
    expect(isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: ' Léa ' })).toBe(true);
  });

  it('trims firstName in the built client', () => {
    const result = buildClientFromForm('c1', { ...EMPTY_CLIENT_FORM, firstName: '  Léa  ' });

    expect(result.firstName).toBe('Léa');
  });

  it('converts empty optional fields to undefined', () => {
    const result = buildClientFromForm('c1', {
      firstName: 'Léa',
      lastName: '   ',
      phone: '',
      email: ' ',
      birthday: undefined,
      notes: '  \n ',
      smsMarketingConsent: undefined,
    });

    expect(result).toEqual({ id: 'c1', firstName: 'Léa' });
  });

  it('keeps non-empty optional fields trimmed', () => {
    const result = buildClientFromForm('c1', {
      firstName: 'Léa',
      lastName: ' Martin ',
      phone: ' 06 12 34 56 78 ',
      email: ' lea@example.com ',
      birthday: { month: 10, day: 12 },
      notes: '',
      smsMarketingConsent: undefined,
    });

    expect(result).toEqual({
      id: 'c1',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthday: { month: 10, day: 12 },
    });
  });

  it('creates a client without a birthday', () => {
    const result = buildClientFromForm('c1', {
      ...EMPTY_CLIENT_FORM,
      firstName: 'Léa',
      birthday: undefined,
    });

    expect('birthday' in result).toBe(false);
  });

  it('hydrates an existing client into form values', () => {
    const values = toClientFormValues({
      id: 'c1',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthday: { month: 10, day: 12 },
    });

    expect(values).toEqual({
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthday: { month: 10, day: 12 },
      notes: '',
    });
  });

  it('hydrates missing optional fields as empty strings', () => {
    const values = toClientFormValues({ id: 'c1', firstName: 'Léa' });

    expect(values).toEqual({
      firstName: 'Léa',
      lastName: '',
      phone: '',
      email: '',
      birthday: undefined,
      notes: '',
    });
  });

  describe('notes', () => {
    const NOTE = 'Allergie au PPD.\n\nPréfère le matin';

    it('keeps a multiline note, trimmed at the edges only', () => {
      const result = buildClientFromForm('c1', {
        ...EMPTY_CLIENT_FORM,
        firstName: 'Léa',
        notes: `  ${NOTE}\n `,
      });

      expect(result.notes).toBe(NOTE);
    });

    it('builds a client without the key when the note is blank (clearing)', () => {
      const result = buildClientFromForm('c1', { ...EMPTY_CLIENT_FORM, firstName: 'Léa', notes: ' \n ' });

      expect('notes' in result).toBe(false);
    });

    it('never makes the form invalid: notes are optional and unbounded by validation', () => {
      expect(isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: 'Léa' })).toBe(true);
      expect(isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: 'Léa', notes: NOTE })).toBe(true);
    });

    it('hydrates an existing note unchanged, line breaks included', () => {
      expect(toClientFormValues({ id: 'c1', firstName: 'Léa', notes: NOTE }).notes).toBe(NOTE);
    });
  });

  describe('birthday', () => {
    it('accepts no birthday', () => {
      expect(isAcceptableBirthday(undefined)).toBe(true);
    });

    it('accepts a real day + month, including 29 février', () => {
      expect(isAcceptableBirthday({ month: 10, day: 12 })).toBe(true);
      expect(isAcceptableBirthday({ month: 2, day: 29 })).toBe(true);
    });

    it('rejects impossible pairs', () => {
      expect(isAcceptableBirthday({ month: 2, day: 30 })).toBe(false);
      expect(isAcceptableBirthday({ month: 4, day: 31 })).toBe(false);
      expect(isAcceptableBirthday({ month: 13, day: 1 })).toBe(false);
    });

    it('blocks form submission when the birthday is impossible', () => {
      expect(
        isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: 'Léa', birthday: { month: 2, day: 30 } }),
      ).toBe(false);
    });
  });

  describe('email', () => {
    it('accepts empty email', () => {
      expect(isAcceptableEmail('')).toBe(true);
      expect(isAcceptableEmail('   ')).toBe(true);
    });

    it('accepts ordinary email addresses', () => {
      expect(isAcceptableEmail('lea@example.com')).toBe(true);
      expect(isAcceptableEmail('lea.martin@salon.example.fr')).toBe(true);
    });

    it('rejects obviously malformed emails without RFC complexity', () => {
      expect(isAcceptableEmail('lea')).toBe(false);
      expect(isAcceptableEmail('lea@')).toBe(false);
      expect(isAcceptableEmail('lea@example')).toBe(false);
      expect(isAcceptableEmail('@example.com')).toBe(false);
      expect(isAcceptableEmail('lea @example.com')).toBe(false);
    });
  });
});

describe('promotional SMS consent in the form', () => {
  const NOW = new Date('2026-09-27T10:00:00.000Z');
  const previous = {
    id: 'c1',
    firstName: 'Léa',
    smsMarketingConsent: {
      status: 'OPTED_IN',
      updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      source: 'PROFESSIONAL',
    },
  } as const;

  it('defaults to « Non renseigné »: no consent key on the built Client', () => {
    const result = buildClientFromForm('c1', { ...EMPTY_CLIENT_FORM, firstName: 'Léa' });
    expect('smsMarketingConsent' in result).toBe(false);
  });

  it('a recorded choice is a PROFESSIONAL capture at now', () => {
    const result = buildClientFromForm(
      'c1',
      { ...EMPTY_CLIENT_FORM, firstName: 'Léa', smsMarketingConsent: 'OPTED_OUT' },
      undefined,
      NOW,
    );
    expect(result.smsMarketingConsent).toEqual({
      status: 'OPTED_OUT',
      updatedAt: NOW,
      source: 'PROFESSIONAL',
    });
  });

  it('an unchanged selection keeps the stored audit record (edit mode)', () => {
    const result = buildClientFromForm(
      'c1',
      { ...EMPTY_CLIENT_FORM, firstName: 'Léa', smsMarketingConsent: 'OPTED_IN' },
      previous,
      NOW,
    );
    expect(result.smsMarketingConsent).toBe(previous.smsMarketingConsent);
  });

  it('clearing back to « Non renseigné » removes the consent entirely', () => {
    const result = buildClientFromForm(
      'c1',
      { ...EMPTY_CLIENT_FORM, firstName: 'Léa', smsMarketingConsent: undefined },
      previous,
      NOW,
    );
    expect('smsMarketingConsent' in result).toBe(false);
  });

  it('hydrates the form with the stored status only', () => {
    expect(toClientFormValues(previous).smsMarketingConsent).toBe('OPTED_IN');
    expect(toClientFormValues({ id: 'c2', firstName: 'Uma' }).smsMarketingConsent).toBeUndefined();
  });
});

describe('email rule shared with the client import', () => {
  it('follows the domain Client email rule, blank staying optional', () => {
    for (const value of ['sophie@example.com', ' sophie@example.com ', 'sophie@', 'a@b.c', 'no at.sign']) {
      expect(isAcceptableEmail(value)).toBe(isValidClientEmail(value));
    }
    expect(isAcceptableEmail('   ')).toBe(true);
  });
});
