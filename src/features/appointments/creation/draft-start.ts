// Souris — Creation draft start time
//
// The Agenda tap proposes the initial appointment time. During creation
// the professional may adjust it in ±5 minute steps while the sheet is
// open. The calendar date never changes; local time stays within the
// operational Agenda day bounds.

export interface StartTimeBounds {
  /** Earliest allowed local time in minutes since midnight. */
  readonly minMinutes: number;
  /** Latest allowed local time in minutes since midnight. */
  readonly maxMinutes: number;
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
