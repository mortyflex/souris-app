import { getCashRegisterDayKey } from '@/domain/cash-register';

import {
  decorateRevenueMonth,
  formatRevenueAccessibilityDetail,
  getMonthRevenueIntensities,
  getRevenueIntensity,
} from '../revenue-calendar';

const SEPTEMBER = new Date(2026, 8, 1);
const totals = (byDay: Record<string, number>): ReadonlyMap<string, number> => new Map(Object.entries(byDay));

describe('Caisse revenue intensity', () => {
  it('reads zero as no level, then low / medium / high against the best day', () => {
    expect(getRevenueIntensity(0, 30000)).toBeUndefined();
    expect(getRevenueIntensity(1, 30000)).toBe('low');
    expect(getRevenueIntensity(10000, 30000)).toBe('low'); // exactly a third
    expect(getRevenueIntensity(10001, 30000)).toBe('medium');
    expect(getRevenueIntensity(20000, 30000)).toBe('medium'); // exactly two thirds
    expect(getRevenueIntensity(20001, 30000)).toBe('high');
    expect(getRevenueIntensity(30000, 30000)).toBe('high');
  });

  it('levels every paying day of the month and leaves the zero days out', () => {
    const intensities = getMonthRevenueIntensities(
      totals({ '2026-09-02': 1500, '2026-09-10': 12000, '2026-09-23': 24500, '2026-09-24': 0 }),
      SEPTEMBER,
    );

    expect(Object.fromEntries(intensities)).toEqual({
      '2026-09-02': 'low',
      '2026-09-10': 'medium',
      '2026-09-23': 'high',
    });
  });

  it('makes the only paying day of a month its strongest day, however small', () => {
    expect(Object.fromEntries(getMonthRevenueIntensities(totals({ '2026-09-14': 1 }), SEPTEMBER))).toEqual({
      '2026-09-14': 'high',
    });
  });

  it('gives equal best days the same strongest level', () => {
    const intensities = getMonthRevenueIntensities(
      totals({ '2026-09-05': 9000, '2026-09-19': 9000, '2026-09-20': 2000 }),
      SEPTEMBER,
    );

    expect(intensities.get('2026-09-05')).toBe('high');
    expect(intensities.get('2026-09-19')).toBe('high');
    expect(intensities.get('2026-09-20')).toBe('low');
  });

  it('shows nothing for a month without revenue', () => {
    expect(getMonthRevenueIntensities(totals({}), SEPTEMBER).size).toBe(0);
    expect(getMonthRevenueIntensities(totals({ '2026-08-31': 5000 }), SEPTEMBER).size).toBe(0);
  });

  it('rescales for each month: the same amount is high in a quiet month, low in a busy one', () => {
    const daily = totals({ '2026-08-12': 3000, '2026-09-08': 3000, '2026-09-09': 30000 });

    expect(getMonthRevenueIntensities(daily, new Date(2026, 7, 1)).get('2026-08-12')).toBe('high');
    expect(getMonthRevenueIntensities(daily, SEPTEMBER).get('2026-09-08')).toBe('low');
  });

  it('decorates the displayed month with a halo and the amount, adjacent days with the amount only', () => {
    const decorate = decorateRevenueMonth(totals({ '2026-08-31': 90000, '2026-09-23': 24550 }), SEPTEMBER);

    expect(decorate(new Date(2026, 8, 23))).toEqual({
      intensity: 'high',
      accessibilityDetail: '245,50 euros encaissés',
    });
    // 31 August leads the September grid: far above September's best, yet no halo.
    expect(decorate(new Date(2026, 7, 31))).toEqual({
      intensity: undefined,
      accessibilityDetail: '900 euros encaissés',
    });
    expect(decorate(new Date(2026, 8, 24))).toBeUndefined();
  });

  it('keys days by the local civil date, like the Caisse day summary', () => {
    const decorate = decorateRevenueMonth(
      totals({ [getCashRegisterDayKey(new Date(2026, 8, 30, 23, 59))]: 4000 }),
      SEPTEMBER,
    );

    expect(decorate(new Date(2026, 8, 30))?.intensity).toBe('high');
    expect(decorate(new Date(2026, 9, 1))).toBeUndefined();
  });

  it('speaks the exact amount, cents only when there are some', () => {
    expect(formatRevenueAccessibilityDetail(24500)).toBe('245 euros encaissés');
    expect(formatRevenueAccessibilityDetail(24505)).toBe('245,05 euros encaissés');
    expect(formatRevenueAccessibilityDetail(100)).toBe('1 euro encaissé');
    expect(formatRevenueAccessibilityDetail(150)).toBe('1,50 euro encaissé');
    expect(formatRevenueAccessibilityDetail(45)).toBe('0,45 euro encaissé');
    expect(formatRevenueAccessibilityDetail(200)).toBe('2 euros encaissés');
  });
});
