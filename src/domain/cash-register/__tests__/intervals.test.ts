import { getCashRegisterDayInterval, getCashRegisterMonthInterval } from '..';

describe('Cash Register civil intervals', () => {
  it('bounds a local day by its midnights, end exclusive', () => {
    expect(getCashRegisterDayInterval(new Date(2026, 9, 12, 14, 35))).toEqual({
      start: new Date(2026, 9, 12),
      end: new Date(2026, 9, 13),
    });
  });

  it('bounds a calendar month by the 1st and the next 1st, across a year end', () => {
    expect(getCashRegisterMonthInterval(new Date(2026, 9, 20, 9, 0))).toEqual({
      start: new Date(2026, 9, 1),
      end: new Date(2026, 10, 1),
    });
    expect(getCashRegisterMonthInterval(new Date(2026, 11, 31, 23, 59))).toEqual({
      start: new Date(2026, 11, 1),
      end: new Date(2027, 0, 1),
    });
  });
});
