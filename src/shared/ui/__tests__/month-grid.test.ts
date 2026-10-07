// BeautIzzy — the shared month grid: six Monday-first weeks of real local days.

import {
  addLocalMonths,
  getMonthGridDays,
  isSameLocalDate,
  isSameLocalMonth,
  MONTH_GRID_DAY_COUNT,
  startOfLocalMonth,
} from '../month-grid';

const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
const dayKey = (date: Date) => ymd(date).join('-');


describe('month grid', () => {
  it('lays out six Monday-first weeks around the month, with real adjacent days', () => {
    // 1 September 2026 is a Tuesday.
    const days = getMonthGridDays(new Date(2026, 8, 23));

    expect(days).toHaveLength(MONTH_GRID_DAY_COUNT);
    expect(ymd(days[0]!)).toEqual([2026, 8, 31]);
    expect(days[0]!.getDay()).toBe(1);
    expect(ymd(days[1]!)).toEqual([2026, 9, 1]);
    expect(ymd(days[30]!)).toEqual([2026, 9, 30]);
    expect(ymd(days[41]!)).toEqual([2026, 10, 11]);
    expect(days[41]!.getDay()).toBe(0);
    // Every cell is a distinct local midnight.
    expect(new Set(days.map(dayKey)).size).toBe(MONTH_GRID_DAY_COUNT);
    expect(days.every((day) => day.getHours() === 0 && day.getMinutes() === 0)).toBe(true);
  });

  it('starts on the 1st when the month begins on a Monday', () => {
    // 1 June 2026 is a Monday.
    const days = getMonthGridDays(new Date(2026, 5, 15));
    expect(ymd(days[0]!)).toEqual([2026, 6, 1]);
  });

  it('browses months across a year boundary without drifting on short months', () => {
    expect(ymd(addLocalMonths(new Date(2026, 11, 1), 1))).toEqual([2027, 1, 1]);
    expect(ymd(addLocalMonths(new Date(2026, 0, 1), -1))).toEqual([2025, 12, 1]);
    // From a 31st the month still moves by exactly one.
    expect(ymd(addLocalMonths(startOfLocalMonth(new Date(2026, 0, 31)), 1))).toEqual([2026, 2, 1]);
    expect(isSameLocalMonth(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59))).toBe(true);
    expect(isSameLocalMonth(new Date(2026, 8, 30), new Date(2026, 9, 1))).toBe(false);
  });

  it('compares local civil dates whatever the time of day', () => {
    expect(isSameLocalDate(new Date(2026, 8, 23, 0, 0), new Date(2026, 8, 23, 23, 59))).toBe(true);
    expect(isSameLocalDate(new Date(2026, 8, 23), new Date(2026, 9, 23))).toBe(false);
  });
});
