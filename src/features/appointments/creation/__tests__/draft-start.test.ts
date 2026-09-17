import {
  getStartHourRange,
  setStartTimeOfDay,
  START_TIME_MINUTE_STEP,
  stepStartAt,
  type StartTimeBounds,
} from '../draft-start';

// 08:00 → 23:55: valid starts begin at the operational Agenda day start and
// stay on the same local date, with ±5-minute granularity. The 20:00 Agenda
// boundary is a display default and never limits scheduling.
const bounds: StartTimeBounds = { minMinutes: 8 * 60, maxMinutes: 24 * 60 - 5 };

describe('stepStartAt', () => {
  it('advances the local time by the requested step', () => {
    const start = new Date(2026, 7, 25, 14, 15);
    expect(stepStartAt(start, 5, bounds)).toEqual(new Date(2026, 7, 25, 14, 20));
  });

  it('moves the time back by the requested step', () => {
    const start = new Date(2026, 7, 25, 14, 15);
    expect(stepStartAt(start, -5, bounds)).toEqual(new Date(2026, 7, 25, 14, 10));
  });

  it('keeps the local calendar date unchanged', () => {
    const start = new Date(2026, 7, 25, 14, 15);
    const next = stepStartAt(start, 5, bounds);

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(25);
  });

  it('crosses a normal hour boundary', () => {
    const start = new Date(2026, 7, 25, 14, 55);
    expect(stepStartAt(start, 5, bounds)).toEqual(new Date(2026, 7, 25, 15, 0));
    expect(stepStartAt(new Date(2026, 7, 25, 15, 0), -5, bounds)).toEqual(
      new Date(2026, 7, 25, 14, 55),
    );
  });

  it('clamps to the operational Agenda day start', () => {
    const start = new Date(2026, 7, 25, 8, 0);
    expect(stepStartAt(start, -5, bounds)).toEqual(new Date(2026, 7, 25, 8, 0));
    expect(stepStartAt(new Date(2026, 7, 25, 8, 3), -5, bounds)).toEqual(
      new Date(2026, 7, 25, 8, 0),
    );
  });

  it('steps freely through the former 20:00 Agenda boundary', () => {
    const start = new Date(2026, 7, 25, 19, 55);
    expect(stepStartAt(start, 5, bounds)).toEqual(new Date(2026, 7, 25, 20, 0));
    expect(stepStartAt(new Date(2026, 7, 25, 20, 0), 5, bounds)).toEqual(
      new Date(2026, 7, 25, 20, 5),
    );
  });

  it('accepts 23:55 as the latest start of the local date', () => {
    const start = new Date(2026, 7, 25, 23, 55);
    expect(stepStartAt(start, 0, bounds)).toEqual(new Date(2026, 7, 25, 23, 55));
    expect(stepStartAt(start, -5, bounds)).toEqual(new Date(2026, 7, 25, 23, 50));
  });

  it('never rolls into the next local date', () => {
    const start = new Date(2026, 7, 25, 23, 55);
    expect(stepStartAt(start, 5, bounds)).toEqual(new Date(2026, 7, 25, 23, 55));
    expect(stepStartAt(new Date(2026, 7, 25, 23, 57), 5, bounds)).toEqual(
      new Date(2026, 7, 25, 23, 55),
    );
  });
});

describe('setStartTimeOfDay', () => {
  const start = new Date(2026, 7, 25, 10, 15, 42);

  it('sets the chosen wall-clock time on the same local date, dropping seconds', () => {
    expect(setStartTimeOfDay(start, { hour: 19, minute: 0 }, bounds)).toEqual(
      new Date(2026, 7, 25, 19, 0),
    );
  });

  it('accepts the latest start of the day, 23:55', () => {
    expect(setStartTimeOfDay(start, { hour: 23, minute: 55 }, bounds)).toEqual(
      new Date(2026, 7, 25, 23, 55),
    );
  });

  it('clamps to the operational day bounds without changing the date', () => {
    expect(setStartTimeOfDay(start, { hour: 3, minute: 30 }, bounds)).toEqual(
      new Date(2026, 7, 25, 8, 0),
    );
    expect(setStartTimeOfDay(start, { hour: 23, minute: 59 }, bounds)).toEqual(
      new Date(2026, 7, 25, 23, 55),
    );
  });

  it('keeps the date across a daylight-saving change day', () => {
    // Last Sunday of March 2026 in Europe: local date arithmetic must not drift.
    const dstDay = new Date(2026, 2, 29, 9, 0);
    const next = setStartTimeOfDay(dstDay, { hour: 18, minute: 30 }, bounds);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 2, 29]);
    expect([next.getHours(), next.getMinutes()]).toEqual([18, 30]);
  });
});

describe('getStartHourRange', () => {
  it('offers every hour of the operational day', () => {
    expect(getStartHourRange(bounds)).toEqual({ minHour: 8, maxHour: 23 });
  });

  it('never offers an hour that lies wholly outside the bounds', () => {
    expect(getStartHourRange({ minMinutes: 8 * 60 + 30, maxMinutes: 19 * 60 + 45 })).toEqual({
      minHour: 9,
      maxHour: 19,
    });
  });

  it('uses 5-minute granularity', () => {
    expect(START_TIME_MINUTE_STEP).toBe(5);
  });
});
