import { stepStartAt, type StartTimeBounds } from '../draft-start';

// 08:00 → 19:55: valid starts stay strictly before the 20:00 end boundary
// of the operational Agenda day, with ±5-minute granularity.
const bounds: StartTimeBounds = { minMinutes: 8 * 60, maxMinutes: 19 * 60 + 55 };

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

  it('accepts 19:55 as a valid latest start', () => {
    const start = new Date(2026, 7, 25, 19, 55);
    expect(stepStartAt(start, 0, bounds)).toEqual(new Date(2026, 7, 25, 19, 55));
    expect(stepStartAt(start, -5, bounds)).toEqual(new Date(2026, 7, 25, 19, 50));
  });

  it('keeps the start strictly before the 20:00 day end', () => {
    const start = new Date(2026, 7, 25, 19, 55);
    expect(stepStartAt(start, 5, bounds)).toEqual(new Date(2026, 7, 25, 19, 55));
    expect(stepStartAt(new Date(2026, 7, 25, 19, 57), 5, bounds)).toEqual(
      new Date(2026, 7, 25, 19, 55),
    );
  });

  it('clamps a 20:00 input down to 19:55', () => {
    expect(stepStartAt(new Date(2026, 7, 25, 20, 0), 0, bounds)).toEqual(
      new Date(2026, 7, 25, 19, 55),
    );
    expect(stepStartAt(new Date(2026, 7, 25, 20, 0), -5, bounds)).toEqual(
      new Date(2026, 7, 25, 19, 55),
    );
  });
});
