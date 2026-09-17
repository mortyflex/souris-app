// Souris — Creation draft start time
//
// The Agenda tap proposes the initial appointment time. During creation the
// professional may choose another time of day on the start-time wheels
// (hours + 5-minute minutes) while the sheet is open. The calendar date never
// changes; local time stays within the operational Agenda day bounds.

export interface StartTimeBounds {
  /** Earliest allowed local time in minutes since midnight. */
  readonly minMinutes: number;
  /** Latest allowed local time in minutes since midnight. */
  readonly maxMinutes: number;
}

/** A wall-clock time of day, as chosen on the start-time wheels. */
export interface StartTimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/** Minute granularity offered when choosing an Appointment start time. */
export const START_TIME_MINUTE_STEP = 5;

/**
 * Sets the local time of day of a start, keeping the local calendar date
 * unchanged and clamping to the operational day bounds. Seconds are dropped.
 */
export function setStartTimeOfDay(
  startAt: Date,
  time: StartTimeOfDay,
  bounds: StartTimeBounds,
): Date {
  const minutes = Math.min(
    bounds.maxMinutes,
    Math.max(bounds.minMinutes, time.hour * 60 + time.minute),
  );

  return new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), 0, minutes);
}

/** Hours the wheels offer for these bounds (both inclusive). */
export function getStartHourRange(bounds: StartTimeBounds): {
  readonly minHour: number;
  readonly maxHour: number;
} {
  return {
    minHour: Math.ceil(bounds.minMinutes / 60),
    maxHour: Math.floor(bounds.maxMinutes / 60),
  };
}

/**
 * Steps a local start time by `deltaMinutes`, keeping the local calendar
 * date unchanged and clamping to the operational day bounds.
 *
 * Uses local Date construction, so hour boundaries (14:55 → 15:00) and
 * negative deltas behave like wall-clock time without date drift.
 */
export function stepStartAt(
  startAt: Date,
  deltaMinutes: number,
  bounds: StartTimeBounds,
): Date {
  const currentMinutes = startAt.getHours() * 60 + startAt.getMinutes();
  const nextMinutes = Math.min(
    bounds.maxMinutes,
    Math.max(bounds.minMinutes, currentMinutes + deltaMinutes),
  );

  return new Date(
    startAt.getFullYear(),
    startAt.getMonth(),
    startAt.getDate(),
    0,
    nextMinutes,
  );
}
