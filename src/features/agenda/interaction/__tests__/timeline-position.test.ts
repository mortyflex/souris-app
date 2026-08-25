import { startAtFromTimelinePosition } from '../timeline-position';

const options = {
  dayStartHour: 8,
  dayEndHour: 20,
  hourHeight: 68,
};

describe('startAtFromTimelinePosition', () => {
  const day = new Date(2026, 7, 24, 18, 30);

  it('maps the top of the grid to the start hour', () => {
    expect(startAtFromTimelinePosition(day, 0, options)).toEqual(new Date(2026, 7, 24, 8));
  });

  it('snaps positions to the nearest fifteen minutes', () => {
    expect(startAtFromTimelinePosition(day, 34, options)).toEqual(new Date(2026, 7, 24, 8, 30));
    expect(startAtFromTimelinePosition(day, 51, options)).toEqual(new Date(2026, 7, 24, 8, 45));
  });

  it('clamps positions above and below the displayed day', () => {
    expect(startAtFromTimelinePosition(day, -40, options)).toEqual(new Date(2026, 7, 24, 8));
    expect(startAtFromTimelinePosition(day, 1000, options)).toEqual(new Date(2026, 7, 24, 20));
  });

  it('preserves the selected local calendar day', () => {
    const result = startAtFromTimelinePosition(day, 136, options);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(24);
    expect(result.getHours()).toBe(10);
  });
});
