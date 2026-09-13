import {
  birthdayFromCivilDate,
  formatBirthdayKey,
  formatClientBirthday,
  getBirthdayMonthLength,
  isValidClientBirthday,
  parseBirthdayKey,
} from '../birthday';

describe('isValidClientBirthday', () => {
  it('accepts every real day/month pair, including 29 février', () => {
    expect(isValidClientBirthday({ month: 7, day: 21 })).toBe(true);
    expect(isValidClientBirthday({ month: 2, day: 29 })).toBe(true);
    expect(isValidClientBirthday({ month: 12, day: 31 })).toBe(true);
    expect(isValidClientBirthday({ month: 1, day: 1 })).toBe(true);
  });

  it('rejects impossible pairs without any year involved', () => {
    expect(isValidClientBirthday({ month: 2, day: 30 })).toBe(false);
    expect(isValidClientBirthday({ month: 4, day: 31 })).toBe(false);
    expect(isValidClientBirthday({ month: 13, day: 1 })).toBe(false);
    expect(isValidClientBirthday({ month: 0, day: 10 })).toBe(false);
    expect(isValidClientBirthday({ month: 6, day: 0 })).toBe(false);
    expect(isValidClientBirthday({ month: 6, day: 1.5 })).toBe(false);
  });

  it('exposes month lengths with a 29-day February', () => {
    expect(getBirthdayMonthLength(2)).toBe(29);
    expect(getBirthdayMonthLength(4)).toBe(30);
    expect(getBirthdayMonthLength(7)).toBe(31);
    expect(getBirthdayMonthLength(13)).toBe(0);
  });
});

describe('birthday key round trip (MM-DD)', () => {
  it('formats with two digits and parses back the same value', () => {
    expect(formatBirthdayKey({ month: 7, day: 3 })).toBe('07-03');
    expect(parseBirthdayKey('07-03')).toEqual({ month: 7, day: 3 });
    expect(parseBirthdayKey(formatBirthdayKey({ month: 2, day: 29 }))).toEqual({ month: 2, day: 29 });
  });

  it('returns undefined for malformed or impossible keys', () => {
    expect(parseBirthdayKey('')).toBeUndefined();
    expect(parseBirthdayKey('7-3')).toBeUndefined();
    expect(parseBirthdayKey('1994-10-12')).toBeUndefined();
    expect(parseBirthdayKey('02-30')).toBeUndefined();
    expect(parseBirthdayKey('13-01')).toBeUndefined();
  });
});

describe('birthdayFromCivilDate', () => {
  it('keeps only the day and month of a historical YYYY-MM-DD date', () => {
    expect(birthdayFromCivilDate('1994-10-12')).toEqual({ month: 10, day: 12 });
    expect(birthdayFromCivilDate(' 2000-02-29 ')).toEqual({ month: 2, day: 29 });
  });

  it('preserves a 29 février whatever the recorded year was', () => {
    expect(birthdayFromCivilDate('1990-02-29')).toEqual({ month: 2, day: 29 });
  });

  it('discards non-civil or impossible input instead of inventing a birthday', () => {
    expect(birthdayFromCivilDate('12/10/1994')).toBeUndefined();
    expect(birthdayFromCivilDate('1994-13-45')).toBeUndefined();
    expect(birthdayFromCivilDate('1994-02-30')).toBeUndefined();
    expect(birthdayFromCivilDate('')).toBeUndefined();
  });
});

describe('formatClientBirthday', () => {
  it('renders a French day + month without a year', () => {
    expect(formatClientBirthday({ month: 7, day: 21 })).toBe('21 juillet');
    expect(formatClientBirthday({ month: 2, day: 3 })).toBe('3 février');
    expect(formatClientBirthday({ month: 2, day: 29 })).toBe('29 février');
  });

  it('uses the French ordinal for the first day', () => {
    expect(formatClientBirthday({ month: 1, day: 1 })).toBe('1er janvier');
  });
});
