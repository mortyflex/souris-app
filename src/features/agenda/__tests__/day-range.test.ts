import {
  AGENDA_END_PADDING_MINUTES,
  calculateDayTimelineRange,
  formatTimelineClockLabel,
  minutesFromDayMidnight,
} from '../layout/day-range';

const day = new Date(2026, 7, 24, 12, 0);
const options = { defaultStartHour: 8, defaultEndHour: 20 };

function at(hour: number, minute = 0, dayOffset = 0): Date {
  return new Date(2026, 7, 24 + dayOffset, hour, minute);
}

describe('calculateDayTimelineRange', () => {
  it('keeps the normal 08:00 → 20:00 range for an empty or ordinary day', () => {
    expect(calculateDayTimelineRange(day, [], options)).toEqual({ startMinutes: 480, endMinutes: 1200 });
    expect(
      calculateDayTimelineRange(day, [{ endAt: at(17, 30) }, { endAt: at(19, 0) }], options),
    ).toEqual({ startMinutes: 480, endMinutes: 1200 });
  });

  it('does not extend when the latest end plus padding still fits the normal boundary', () => {
    expect(calculateDayTimelineRange(day, [{ endAt: at(19, 30) }], options).endMinutes).toBe(1200);
  });

  it('extends past 20:00 for a 19:00 appointment lasting three hours', () => {
    const range = calculateDayTimelineRange(day, [{ endAt: at(22, 0) }], options);

    expect(range.endMinutes).toBeGreaterThanOrEqual(22 * 60 + AGENDA_END_PADDING_MINUTES);
    expect(range.endMinutes).toBe(23 * 60);
  });

  it('extends for an appointment starting at 20:00 and ending at 23:00', () => {
    const range = calculateDayTimelineRange(day, [{ endAt: at(23, 0) }], options);

    expect(range.startMinutes).toBe(480);
    expect(range.endMinutes).toBe(24 * 60);
  });

  it('crosses midnight without truncating: 22:00 + 3 h ends at 1500 minutes', () => {
    const end = at(1, 0, 1);
    expect(minutesFromDayMidnight(day, end)).toBe(1500);

    const range = calculateDayTimelineRange(day, [{ endAt: end }], options);
    expect(range.endMinutes).toBe(26 * 60);
  });

  it('uses the latest end among several blocks', () => {
    const range = calculateDayTimelineRange(
      day,
      [{ endAt: at(21, 0) }, { endAt: at(22, 45) }, { endAt: at(9, 0) }],
      options,
    );
    expect(range.endMinutes).toBe(24 * 60);
  });
});

describe('minutesFromDayMidnight', () => {
  it('measures same-day instants with wall-clock time', () => {
    expect(minutesFromDayMidnight(day, at(8, 0))).toBe(480);
    expect(minutesFromDayMidnight(day, at(19, 45))).toBe(1185);
  });

  it('places an earlier day before the canvas and later days beyond 1440', () => {
    expect(minutesFromDayMidnight(day, at(23, 0, -1))).toBe(-60);
    expect(minutesFromDayMidnight(day, at(0, 30, 1))).toBe(1470);
  });
});

describe('formatTimelineClockLabel', () => {
  it('renders normal clock time and wraps after midnight', () => {
    expect(formatTimelineClockLabel(480)).toBe('08:00');
    expect(formatTimelineClockLabel(1185)).toBe('19:45');
    expect(formatTimelineClockLabel(1440)).toBe('00:00');
    expect(formatTimelineClockLabel(1500)).toBe('01:00');
    expect(formatTimelineClockLabel(1515)).toBe('01:15');
  });
});
