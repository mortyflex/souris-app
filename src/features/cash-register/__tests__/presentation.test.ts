import {
  formatCashRegisterDay,
  formatCashRegisterMonth,
  formatCheckoutCount,
  isSameLocalDay,
  isSameLocalMonth,
  shiftLocalDay,
  shiftLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
} from '../presentation';

describe('Cash Register presentation', () => {
  it('formats the selected local day and month in French', () => {
    expect(formatCashRegisterDay(new Date(2026, 8, 12, 15, 30))).toBe('Samedi 12 septembre 2026');
    expect(formatCashRegisterMonth(new Date(2026, 8, 12))).toBe('Septembre 2026');
  });

  it('navigates by local civil day and calendar month across boundaries', () => {
    expect(shiftLocalDay(new Date(2026, 8, 1), -1)).toEqual(new Date(2026, 7, 31));
    expect(shiftLocalDay(new Date(2026, 11, 31), 1)).toEqual(new Date(2027, 0, 1));
    expect(shiftLocalMonth(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
    expect(shiftLocalMonth(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
    expect(startOfLocalDay(new Date(2026, 8, 12, 23, 59))).toEqual(new Date(2026, 8, 12));
    expect(startOfLocalMonth(new Date(2026, 8, 12, 23, 59))).toEqual(new Date(2026, 8, 1));
  });

  it('compares local days and months', () => {
    expect(isSameLocalDay(new Date(2026, 8, 12, 0, 1), new Date(2026, 8, 12, 23, 59))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 8, 12, 23, 59), new Date(2026, 8, 13, 0, 0))).toBe(false);
    expect(isSameLocalMonth(new Date(2026, 8, 1), new Date(2026, 8, 30))).toBe(true);
    expect(isSameLocalMonth(new Date(2026, 8, 30), new Date(2026, 9, 1))).toBe(false);
  });

  it('counts checkouts in plain words', () => {
    expect(formatCheckoutCount(0)).toBe('Aucun encaissement');
    expect(formatCheckoutCount(1)).toBe('1 encaissement');
    expect(formatCheckoutCount(3)).toBe('3 encaissements');
  });
});
