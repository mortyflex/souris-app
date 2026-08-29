import {
  formatCivilDate,
  formatClientBirthDate,
  isValidCivilDate,
  parseCivilDate,
} from '../birthDate';

describe('isValidCivilDate', () => {
  it('accepts a real YYYY-MM-DD civil date', () => {
    expect(isValidCivilDate('1994-10-12')).toBe(true);
    expect(isValidCivilDate('2000-02-29')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidCivilDate('')).toBe(false);
    expect(isValidCivilDate('12/10/1994')).toBe(false);
    expect(isValidCivilDate('1994-13-01')).toBe(false);
    expect(isValidCivilDate('1994-00-10')).toBe(false);
    expect(isValidCivilDate('1994-02-30')).toBe(false);
    expect(isValidCivilDate('1999-02-29')).toBe(false);
    expect(isValidCivilDate('1994-10-12T00:00:00')).toBe(false);
  });
});

describe('parseCivilDate / formatCivilDate round trip', () => {
  it('keeps the exact civil date across parse and format (no timezone shift)', () => {
    const parsed = parseCivilDate('1994-10-12');
    expect(parsed).toBeDefined();
    expect(formatCivilDate(parsed as Date)).toBe('1994-10-12');
  });

  it('reads local components regardless of wall-clock position', () => {
    // A Date picked at any time of day still maps to its LOCAL calendar day.
    expect(formatCivilDate(new Date(1994, 9, 12, 15, 42, 7))).toBe('1994-10-12');
  });

  it('formats a date constructed with local components only', () => {
    expect(formatCivilDate(new Date(2000, 1, 29))).toBe('2000-02-29');
  });

  it('returns undefined for invalid input', () => {
    expect(parseCivilDate('not-a-date')).toBeUndefined();
    expect(parseCivilDate('1994-02-30')).toBeUndefined();
  });
});

describe('formatClientBirthDate', () => {
  it('renders a friendly French date', () => {
    expect(formatClientBirthDate('1994-10-12')).toBe('12 octobre 1994');
  });

  it('renders single-digit days naturally', () => {
    expect(formatClientBirthDate('1994-01-03')).toBe('3 janvier 1994');
  });

  it('returns invalid input unchanged instead of inventing a date', () => {
    expect(formatClientBirthDate('inconnu')).toBe('inconnu');
  });
});
