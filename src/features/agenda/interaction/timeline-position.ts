export interface TimelinePositionOptions {
  readonly dayStartHour: number;
  readonly dayEndHour: number;
  readonly hourHeight: number;
  readonly snapMinutes?: number;
}

/**
 * Converts a vertical position in the day grid into a local appointment start.
 * The returned time is always inside the displayed day and snapped to the
 * nearest quarter hour by default.
 */
export function startAtFromTimelinePosition(
  day: Date,
  positionY: number,
  options: TimelinePositionOptions,
): Date {
  const snapMinutes = options.snapMinutes ?? 15;
  const dayStartMinutes = options.dayStartHour * 60;
  const dayEndMinutes = options.dayEndHour * 60;
  const rawMinutes = dayStartMinutes + (positionY / options.hourHeight) * 60;
  const boundedMinutes = Math.min(
    dayEndMinutes,
    Math.max(dayStartMinutes, Number.isFinite(rawMinutes) ? rawMinutes : dayStartMinutes),
  );
  const snappedMinutes = Math.min(
    dayEndMinutes,
    Math.max(
      dayStartMinutes,
      dayStartMinutes + Math.round((boundedMinutes - dayStartMinutes) / snapMinutes) * snapMinutes,
    ),
  );
  const result = new Date(day);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(snappedMinutes);
  return result;
}
