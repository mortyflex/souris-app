import {
  birthdayFromCivilDate,
  formatBirthdayKey,
  formatClientBirthday,
  formatClientBirthdayCompact,
  getBirthdayMonthLength,
  isClientBirthdayToday,
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

describe('formatClientBirthdayCompact', () => {
  it('renders the compact French directory form without a year', () => {
    expect(formatClientBirthdayCompact({ month: 9, day: 21 })).toBe('21 sept.');
    expect(formatClientBirthdayCompact({ month: 2, day: 29 })).toBe('29 févr.');
    expect(formatClientBirthdayCompact({ month: 5, day: 3 })).toBe('3 mai');
    expect(formatClientBirthdayCompact({ month: 1, day: 1 })).toBe('1er janv.');
  });
});

describe('isClientBirthdayToday', () => {
  const september21 = { birthday: { month: 9, day: 21 } };

  it('matches on day + month whatever the year — no birth year is needed', () => {
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 21, 9, 0))).toBe(true);
    expect(isClientBirthdayToday(september21, new Date(2031, 8, 21, 9, 0))).toBe(true);
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 22, 9, 0))).toBe(false);
    expect(isClientBirthdayToday(september21, new Date(2026, 9, 21, 9, 0))).toBe(false);
  });

  it('is false for a Client without a birthday', () => {
    expect(isClientBirthdayToday({}, new Date(2026, 8, 21))).toBe(false);
  });

  it('reads the LOCAL calendar day: the first and last minute of the day both match', () => {
    // A UTC conversion would move one of these two instants to a neighbouring
    // day in any zone that is not UTC; the local civil day must win in all of them.
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 21, 0, 0, 0))).toBe(true);
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 21, 23, 59, 59))).toBe(true);
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 20, 23, 59, 59))).toBe(false);
    expect(isClientBirthdayToday(september21, new Date(2026, 8, 22, 0, 0, 0))).toBe(false);
  });

  it('never turns the stored value into an instant: the key round trip is zone-free', () => {
    const newYearsEve = { month: 12, day: 31 };
    expect(parseBirthdayKey(formatBirthdayKey(newYearsEve))).toEqual(newYearsEve);
    expect(parseBirthdayKey(formatBirthdayKey({ month: 1, day: 1 }))).toEqual({ month: 1, day: 1 });
  });

  it('celebrates a 29 février on the 29th in a leap year and on the 28th otherwise', () => {
    const leapDay = { birthday: { month: 2, day: 29 } };
    expect(isClientBirthdayToday(leapDay, new Date(2028, 1, 29))).toBe(true);
    expect(isClientBirthdayToday(leapDay, new Date(2028, 1, 28))).toBe(false);
    expect(isClientBirthdayToday(leapDay, new Date(2027, 1, 28))).toBe(true);
    expect(isClientBirthdayToday(leapDay, new Date(2027, 2, 1))).toBe(false);
    // 2100 is not a leap year, 2000 was.
    expect(isClientBirthdayToday(leapDay, new Date(2100, 1, 28))).toBe(true);
    expect(isClientBirthdayToday(leapDay, new Date(2000, 1, 28))).toBe(false);
  });
});
