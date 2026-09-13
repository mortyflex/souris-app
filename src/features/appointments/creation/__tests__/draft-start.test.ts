import { stepStartAt, type StartTimeBounds } from '../draft-start';

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
