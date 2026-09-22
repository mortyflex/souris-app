import { getInsightsPeriod, isWithinInsightsPeriod, shiftInsightsAnchor } from '..';

/** `2026-09-22` in the LOCAL calendar — never through UTC. */
function civil(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function expectLocalMidnight(date: Date) {
  expect([date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]).toEqual([0, 0, 0, 0]);
}

describe('getInsightsPeriod', () => {
  const anchor = new Date(2026, 8, 22, 15, 42); // Tuesday 22 September 2026, afternoon

  it('DAY is the anchor calendar day, from local midnight to the next local midnight', () => {
    const period = getInsightsPeriod('DAY', anchor);
    expect(period.kind).toBe('DAY');
    expect(civil(period.start)).toBe('2026-09-22');
    expect(civil(period.end)).toBe('2026-09-23');
    expectLocalMidnight(period.start);
    expectLocalMidnight(period.end);
  });

  it('WEEK runs Monday through Sunday around the anchor', () => {
    const period = getInsightsPeriod('WEEK', anchor);
    expect(civil(period.start)).toBe('2026-09-21');
    expect(period.start.getDay()).toBe(1);
    expect(civil(period.end)).toBe('2026-09-28');
  });

  it('WEEK keeps a Sunday in the week that started the Monday before, and a Monday in its own', () => {
    expect(civil(getInsightsPeriod('WEEK', new Date(2026, 8, 27, 23, 0)).start)).toBe('2026-09-21');
    expect(civil(getInsightsPeriod('WEEK', new Date(2026, 8, 28, 0, 0)).start)).toBe('2026-09-28');
  });

  it('WEEK crosses a month and a year boundary', () => {
    const period = getInsightsPeriod('WEEK', new Date(2027, 0, 1)); // Friday 1 January 2027
    expect(civil(period.start)).toBe('2026-12-28');
    expect(civil(period.end)).toBe('2027-01-04');
  });

  it('MONTH is the calendar month, whatever its length', () => {
    const september = getInsightsPeriod('MONTH', anchor);
    expect(civil(september.start)).toBe('2026-09-01');
    expect(civil(september.end)).toBe('2026-10-01');
    const december = getInsightsPeriod('MONTH', new Date(2026, 11, 31, 23, 59));
    expect(civil(december.start)).toBe('2026-12-01');
    expect(civil(december.end)).toBe('2027-01-01');
  });

  it('MONTH of a leap February ends after the 29th', () => {
    const period = getInsightsPeriod('MONTH', new Date(2028, 1, 29));
    expect(civil(period.start)).toBe('2028-02-01');
    expect(civil(period.end)).toBe('2028-03-01');
    expect(isWithinInsightsPeriod(period, new Date(2028, 1, 29, 23, 59, 59))).toBe(true);
    expect(isWithinInsightsPeriod(period, new Date(2028, 2, 1))).toBe(false);
  });

  it('YEAR is the calendar year', () => {
    const period = getInsightsPeriod('YEAR', anchor);
    expect(civil(period.start)).toBe('2026-01-01');
    expect(civil(period.end)).toBe('2027-01-01');
  });

  it('bounds are local: 23:59 of the last day is in, local midnight after it is out', () => {
    const period = getInsightsPeriod('DAY', anchor);
    expect(isWithinInsightsPeriod(period, new Date(2026, 8, 22, 0, 0))).toBe(true);
    expect(isWithinInsightsPeriod(period, new Date(2026, 8, 22, 23, 59, 59, 999))).toBe(true);
    expect(isWithinInsightsPeriod(period, new Date(2026, 8, 23, 0, 0))).toBe(false);
    expect(isWithinInsightsPeriod(period, new Date(2026, 8, 21, 23, 59, 59, 999))).toBe(false);
  });

  it('a week across a daylight-saving change still ends on a local midnight', () => {
    // Europe switches to summer time on Sunday 29 March 2026.
    const period = getInsightsPeriod('WEEK', new Date(2026, 2, 29, 12, 0));
    expect(civil(period.start)).toBe('2026-03-23');
    expect(civil(period.end)).toBe('2026-03-30');
    expectLocalMidnight(period.end);
    expect(isWithinInsightsPeriod(period, new Date(2026, 2, 29, 23, 30))).toBe(true);
  });
});

describe('shiftInsightsAnchor', () => {
  const anchor = new Date(2026, 8, 22);

  it('moves by exactly one period of the selected kind', () => {
    expect(civil(shiftInsightsAnchor('DAY', anchor, 1))).toBe('2026-09-23');
    expect(civil(shiftInsightsAnchor('DAY', anchor, -1))).toBe('2026-09-21');
    expect(civil(shiftInsightsAnchor('WEEK', anchor, 1))).toBe('2026-09-29');
    expect(civil(shiftInsightsAnchor('WEEK', anchor, -1))).toBe('2026-09-15');
    expect(civil(shiftInsightsAnchor('MONTH', anchor, 1))).toBe('2026-10-22');
    expect(civil(shiftInsightsAnchor('YEAR', anchor, -1))).toBe('2025-09-22');
  });

  it('crosses December → January and January → December', () => {
    expect(civil(shiftInsightsAnchor('MONTH', new Date(2026, 11, 15), 1))).toBe('2027-01-15');
    expect(civil(shiftInsightsAnchor('MONTH', new Date(2027, 0, 15), -1))).toBe('2026-12-15');
    expect(civil(shiftInsightsAnchor('DAY', new Date(2026, 11, 31), 1))).toBe('2027-01-01');
    expect(civil(shiftInsightsAnchor('DAY', new Date(2027, 0, 1), -1))).toBe('2026-12-31');
  });

  it('clamps a month shift to the last day instead of overflowing', () => {
    expect(civil(shiftInsightsAnchor('MONTH', new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(civil(shiftInsightsAnchor('MONTH', new Date(2028, 0, 31), 1))).toBe('2028-02-29');
    expect(civil(shiftInsightsAnchor('MONTH', new Date(2026, 2, 31), -1))).toBe('2026-02-28');
  });

  it('keeps 29 February on the 28th in a year without it', () => {
    expect(civil(shiftInsightsAnchor('YEAR', new Date(2028, 1, 29), 1))).toBe('2029-02-28');
    expect(civil(shiftInsightsAnchor('YEAR', new Date(2028, 1, 29), -4))).toBe('2024-02-29');
  });

  it('always returns a local midnight', () => {
    expectLocalMidnight(shiftInsightsAnchor('WEEK', new Date(2026, 2, 26, 18, 30), 1));
  });
});
