// Souris — Agenda Day visible range
//
// The Day timeline normally spans the operational day (08:00 → 20:00). It is
// not a clipping boundary: a late or long Appointment extends the visible
// range so its whole block stays reachable by scrolling, and an Appointment
// that runs past midnight simply keeps extending the same start-day canvas.
//
// Offsets are minutes from the SELECTED day's local midnight and may exceed
// 24 h (01:00 next day = 1500). Labels stay clock time (00:00, 01:00).

import { startOfLocalDay } from '../calendar/week';

const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Breathing room kept below the latest visible block when the day extends. */
export const AGENDA_END_PADDING_MINUTES = 30;

export interface DayTimelineRange {
  /** Minutes from the selected day's local midnight where the canvas starts. */
  readonly startMinutes: number;
  /** Minutes from the selected day's local midnight where the canvas ends (may exceed 1440). */
  readonly endMinutes: number;
}

export interface DayTimelineRangeOptions {
  readonly defaultStartHour: number;
  readonly defaultEndHour: number;
  readonly paddingMinutes?: number;
}

/**
 * Minutes between the selected day's local midnight and `date`, using civil
 * calendar days plus wall-clock time so DST changes never shift the grid and
 * a next-day instant lands beyond 1440.
 */
export function minutesFromDayMidnight(day: Date, date: Date): number {
  const dayDelta = Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(day).getTime()) / DAY_MS,
  );
  return (
    dayDelta * MINUTES_PER_DAY +
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60
  );
}

/**
 * The visible range of the Day timeline:
 *
 *   endMinutes = max(default end, latest visible end + padding, rounded up to
 *                    the next full hour)
 *
 * A day whose blocks all end before the normal boundary keeps the compact
 * default range; only a later block extends it, by exactly what it needs.
 */
export function calculateDayTimelineRange(
  day: Date,
  intervals: readonly { readonly endAt: Date }[],
  options: DayTimelineRangeOptions,
): DayTimelineRange {
  const startMinutes = options.defaultStartHour * 60;
  const defaultEndMinutes = options.defaultEndHour * 60;
  const padding = options.paddingMinutes ?? AGENDA_END_PADDING_MINUTES;

  let latestEndMinutes = Number.NEGATIVE_INFINITY;
  for (const interval of intervals) {
    latestEndMinutes = Math.max(latestEndMinutes, minutesFromDayMidnight(day, interval.endAt));
  }

  const requiredEndMinutes = latestEndMinutes + padding;
  if (!Number.isFinite(requiredEndMinutes) || requiredEndMinutes <= defaultEndMinutes) {
    return { startMinutes, endMinutes: defaultEndMinutes };
  }
  return { startMinutes, endMinutes: Math.ceil(requiredEndMinutes / 60) * 60 };
}

/** Clock label for a minute offset that may exceed midnight: 1500 → « 01:00 ». */
export function formatTimelineClockLabel(minutes: number): string {
  const whole = Math.floor(minutes);
  const hour = Math.floor(whole / 60) % 24;
  const minute = whole % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}
