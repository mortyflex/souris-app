import { parseSaleHistoryDate, resolveSaleHistoryInitialState, toSaleHistoryRouteParams } from '../route-params';

const now = new Date(2026, 9, 30, 15, 0);

describe('Sale history route parameters', () => {
  it('round-trips the period the Caisse shows through the day key', () => {
    expect(toSaleHistoryRouteParams('day', new Date(2026, 9, 12))).toEqual({ period: 'day', date: '2026-10-12' });
    expect(toSaleHistoryRouteParams('month', new Date(2026, 8, 1))).toEqual({ period: 'month', date: '2026-09-01' });
    expect(resolveSaleHistoryInitialState({ period: 'month', date: '2026-09-01' }, now)).toEqual({
      period: 'month',
      date: new Date(2026, 8, 1),
    });
  });

  it('reads a civil key as a local midnight and refuses what is not a real date', () => {
    expect(parseSaleHistoryDate('2026-10-12')).toEqual(new Date(2026, 9, 12));
    expect(parseSaleHistoryDate('2026-02-31')).toBeUndefined();
    expect(parseSaleHistoryDate('2026-10-12T00:00:00Z')).toBeUndefined();
    expect(parseSaleHistoryDate('hier')).toBeUndefined();
    expect(parseSaleHistoryDate(undefined)).toBeUndefined();
  });

  it('falls back to today in Day mode for missing or unreadable parameters', () => {
    expect(resolveSaleHistoryInitialState({}, now)).toEqual({ period: 'day', date: new Date(2026, 9, 30) });
    expect(resolveSaleHistoryInitialState({ period: 'week', date: 'nope' }, now)).toEqual({
      period: 'day',
      date: new Date(2026, 9, 30),
    });
  });
});
