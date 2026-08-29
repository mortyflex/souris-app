import {
  buildClientFromForm,
  EMPTY_CLIENT_FORM,
  isAcceptableBirthDate,
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
      birthDate: '',
    });

    expect(result).toEqual({ id: 'c1', firstName: 'Léa' });
  });

  it('keeps non-empty optional fields trimmed', () => {
    const result = buildClientFromForm('c1', {
      firstName: 'Léa',
      lastName: ' Martin ',
      phone: ' 06 12 34 56 78 ',
      email: ' lea@example.com ',
      birthDate: ' 1994-10-12 ',
    });

    expect(result).toEqual({
      id: 'c1',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthDate: '1994-10-12',
    });
  });

  it('creates a client without a birth date', () => {
    const result = buildClientFromForm('c1', {
      ...EMPTY_CLIENT_FORM,
      firstName: 'Léa',
      birthDate: '',
    });

    expect('birthDate' in result).toBe(false);
  });

  it('hydrates an existing client into form values', () => {
    const values = toClientFormValues({
      id: 'c1',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthDate: '1994-10-12',
    });

    expect(values).toEqual({
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
      birthDate: '1994-10-12',
    });
  });

  it('hydrates missing optional fields as empty strings', () => {
    const values = toClientFormValues({ id: 'c1', firstName: 'Léa' });

    expect(values).toEqual({
      firstName: 'Léa',
      lastName: '',
      phone: '',
      email: '',
      birthDate: '',
    });
  });

  describe('birthDate', () => {
    it('accepts an empty birth date', () => {
      expect(isAcceptableBirthDate('')).toBe(true);
      expect(isAcceptableBirthDate('   ')).toBe(true);
    });

    it('accepts a full YYYY-MM-DD civil date', () => {
      expect(isAcceptableBirthDate('1994-10-12')).toBe(true);
    });

    it('rejects partial or non-civil birth dates', () => {
      expect(isAcceptableBirthDate('12/10/1994')).toBe(false);
      expect(isAcceptableBirthDate('1994-10')).toBe(false);
      expect(isAcceptableBirthDate('12 octobre 1994')).toBe(false);
    });

    it('blocks form submission when the birth date is malformed', () => {
      expect(
        isValidClientForm({ ...EMPTY_CLIENT_FORM, firstName: 'Léa', birthDate: '1994-02-30' }),
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
