// Souris — Calendar Block schedule conflicts
//
// Source: docs/domain/CALENDAR_BLOCKS.md §5
//
// A Calendar Block means "this professional is unavailable for the whole
// interval". It is the ONE blocking availability rule of manual scheduling
// (overlap between client Appointments stays non-blocking — CLAUDE.md §16):
//
//   block vs block         same staff member, intervals intersect      → conflict
//   block vs Appointment   same staff member, the block intersects an
//                          interval where the Appointment REQUIRES her  → conflict
//
// Precision matters in both directions:
//
//   * ends are exclusive — 10:00–11:00 and 11:00–12:00 are adjacent, not
//     overlapping;
//   * an Appointment occupies the professional only during its staff-required
//     phases (`getAppointmentStaffBusyIntervals`). A pause taken while a
//     colour processes is legitimate and never a conflict;
//   * cancelled and no-show Appointments occupy nothing;
//   * another staff member's schedule is never looked at.
//
// This is NOT visual overlap handling: the Agenda column layout keeps its own
// geometry and places whatever exists. These functions answer one question —
// may this be saved? — and nothing reads them to draw.

import {
  areStaffBusyIntervalsEqual,
  getAppointmentStaffBusyIntervals,
  type Appointment,
  type StaffBusyInterval,
  type StaffOccupancySource,
} from '../appointments';

import type { CalendarBlock } from './types';

type Interval = Pick<CalendarBlock, 'startAt' | 'endAt'>;

/** Half-open interval intersection: touching boundaries do not overlap. */
export function doIntervalsOverlap(left: Interval, right: Interval): boolean {
  return (
    left.startAt.getTime() < right.endAt.getTime() &&
    right.startAt.getTime() < left.endAt.getTime()
  );
}

export type CalendarBlockConflict =
  | { readonly type: 'CALENDAR_BLOCK'; readonly block: CalendarBlock }
  | {
      readonly type: 'APPOINTMENT';
      readonly appointment: Appointment;
      /** The staff-required interval of that Appointment the block would cover. */
      readonly busyInterval: StaffBusyInterval;
    };

/**
 * The first thing that prevents saving `candidate`, or undefined when the
 * interval is free for that staff member. `candidate.id` is excluded from the
 * block comparison so an edited block never conflicts with itself. Blocks are
 * checked first, then Appointments, each in chronological order, so the
 * answer is deterministic.
 */
export function findCalendarBlockConflict(
  candidate: Pick<CalendarBlock, 'staffMemberId' | 'startAt' | 'endAt'> & { readonly id?: string },
  schedule: {
    readonly calendarBlocks: readonly CalendarBlock[];
    readonly appointments: readonly Appointment[];
  },
): CalendarBlockConflict | undefined {
  const byStart = <Value extends { readonly startAt: Date; readonly id: string }>(
    values: readonly Value[],
  ) =>
    [...values].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id),
    );

  for (const block of byStart(schedule.calendarBlocks)) {
    if (block.id === candidate.id) continue;
    if (block.staffMemberId !== candidate.staffMemberId) continue;
    if (doIntervalsOverlap(candidate, block)) return { type: 'CALENDAR_BLOCK', block };
  }

  for (const appointment of byStart(schedule.appointments)) {
    if (appointment.staffMemberId !== candidate.staffMemberId) continue;
    const busyInterval = getAppointmentStaffBusyIntervals(appointment).find((interval) =>
      doIntervalsOverlap(candidate, interval),
    );
    if (busyInterval) return { type: 'APPOINTMENT', appointment, busyInterval };
  }

  return undefined;
}

/**
 * The first Calendar Block of the Appointment's staff member that one of its
 * staff-required intervals would run into, or undefined. Used when a client
 * Appointment is created or moved — on the DRAFT, before anything is saved.
 */
export function findAppointmentCalendarBlockConflict(
  appointment: StaffOccupancySource & Pick<Appointment, 'staffMemberId'>,
  calendarBlocks: readonly CalendarBlock[],
): CalendarBlock | undefined {
  const busyIntervals = getAppointmentStaffBusyIntervals(appointment);
  if (busyIntervals.length === 0) return undefined;
  return [...calendarBlocks]
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id))
    .find(
      (block) =>
        block.staffMemberId === appointment.staffMemberId &&
        busyIntervals.some((interval) => doIntervalsOverlap(interval, block)),
    );
}

/**
 * THE rule for any CHANGE of an existing Appointment — the full editor and the
 * quick edits of Appointment Details alike (duration steppers, reorder, item
 * removal). Compute the candidate first, then:
 *
 *   occupied intervals unchanged   → undefined: nothing about the schedule
 *                                    moved, so an overlap that already existed
 *                                    (or none at all) never holds the edit back
 *   occupied intervals changed     → the candidate is validated against the
 *                                    Calendar Blocks of its staff member
 *
 * "Occupied" is the staff-required intervals, never the start/end envelope:
 * lengthening a processing phase that nothing follows changes nothing.
 * Appointment-versus-Appointment overlap is not looked at — it stays allowed.
 */
export function findAppointmentChangeCalendarBlockConflict(
  current: StaffOccupancySource & Pick<Appointment, 'staffMemberId'>,
  candidate: StaffOccupancySource & Pick<Appointment, 'staffMemberId'>,
  calendarBlocks: readonly CalendarBlock[],
): CalendarBlock | undefined {
  if (
    current.staffMemberId === candidate.staffMemberId &&
    areStaffBusyIntervalsEqual(
      getAppointmentStaffBusyIntervals(current),
      getAppointmentStaffBusyIntervals(candidate),
    )
  ) {
    return undefined;
  }
  return findAppointmentCalendarBlockConflict(candidate, calendarBlocks);
}
