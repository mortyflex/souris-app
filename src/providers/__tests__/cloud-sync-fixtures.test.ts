// The two-device fixtures date a record "earlier today". The screens they feed
// read « aujourd'hui » as the device's local calendar day, so the fixture must
// stay inside that day whatever the hour of the run — a run a few minutes
// after midnight included. Fixed reference instants; no real clock.

import { startOfLocalDay } from '@/features/cash-register/presentation';

import { createRemoteSale, earlierTodayAt } from '../testing/cloud-sync-fixtures';

const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second);

describe('earlierTodayAt', () => {
  it('is exactly `minutesAgo` before now when the day allows it', () => {
    expect(earlierTodayAt(30, local(2026, 11, 15, 14, 0))).toEqual(local(2026, 11, 15, 13, 30));
    expect(earlierTodayAt(30, local(2026, 11, 15, 0, 30))).toEqual(local(2026, 11, 15, 0, 0));
  });

  it.each([
    ['a second after midnight', local(2026, 11, 15, 0, 0, 1)],
    ['ten minutes after midnight', local(2026, 11, 15, 0, 10)],
    ['twenty-nine minutes after midnight', local(2026, 11, 15, 0, 29)],
    ['midnight itself', local(2026, 11, 15)],
    ['the first minutes of a month', local(2026, 12, 1, 0, 5)],
    ['the first minutes of a year', local(2027, 1, 1, 0, 5)],
    ['the first minutes of the spring daylight-saving day (Europe/Paris)', local(2026, 3, 29, 0, 5)],
    ['the first minutes of the autumn daylight-saving day (Europe/Paris)', local(2026, 10, 25, 0, 5)],
  ])('never leaves the local day: %s', (_label, now) => {
    const at = earlierTodayAt(30, now);

    expect(startOfLocalDay(at)).toEqual(startOfLocalDay(now));
    expect(at.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(at.getTime()).toBeGreaterThanOrEqual(startOfLocalDay(now).getTime());
  });

  it('stays in the day across the hours daylight saving moves (Europe/Paris)', () => {
    // 29 March 2026: 02:00 → 03:00. 25 October 2026: 03:00 → 02:00.
    for (const now of [local(2026, 3, 29, 3, 10), local(2026, 10, 25, 2, 10), local(2026, 10, 25, 3, 10)]) {
      const at = earlierTodayAt(30, now);
      expect(startOfLocalDay(at)).toEqual(startOfLocalDay(now));
      expect(now.getTime() - at.getTime()).toBe(30 * 60_000);
    }
  });
});

describe('createRemoteSale', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['ten minutes after midnight', local(2026, 11, 15, 0, 10)],
    ['in the afternoon', local(2026, 11, 15, 15, 45)],
  ])('is sold and paid today, at one instant, never in the future: %s', (_label, now) => {
    jest.useFakeTimers({ now });

    const sale = createRemoteSale(30);

    expect(startOfLocalDay(sale.completedAt)).toEqual(startOfLocalDay(now));
    expect(sale.completedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(sale.payment?.paidAt).toEqual(sale.completedAt);
  });
});
