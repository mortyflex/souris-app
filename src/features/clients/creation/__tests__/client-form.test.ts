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
