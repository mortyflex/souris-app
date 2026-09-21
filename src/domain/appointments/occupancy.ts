// Souris — Appointment staff occupancy
//
// Source: docs/domain/APPOINTMENTS.md §12, docs/domain/CALENDAR_BLOCKS.md §5
//
// When IS the professional actually taken by an Appointment? Not during its
// whole nominal range: a phase with `requiresStaff = false` (processing /
// unattended time) keeps the client in the Appointment but frees the
// professional. The busy intervals are therefore the maximal runs of
// consecutive staff-required phases, exactly what the Agenda draws as cards.
//
// Overlap between client Appointments stays NON-BLOCKING (CLAUDE.md §16).
// These intervals exist for the one availability rule that does block: a
// Calendar Block (the professional declared herself unavailable).

import type { AppointmentStatus } from './types';

const MINUTE_MS = 60_000;

/**
 * The least an occupancy calculation needs. An `Appointment` satisfies it, and
 * so does a creation or editing DRAFT (ordered services with their phases)
 * that is not an Appointment yet.
 */
export interface StaffOccupancySource {
  readonly startAt: Date;
  readonly status: AppointmentStatus;
  readonly items: readonly {
    readonly order: number;
    readonly phases: readonly {
      readonly durationMinutes: number;
      readonly requiresStaff: boolean;
    }[];
  }[];
}

export interface StaffBusyInterval {
  readonly startAt: Date;
  /** Exclusive: an interval ending at 11:00 does not touch one starting at 11:00. */
  readonly endAt: Date;
}

/**
 * Whether two schedules occupy the professional during exactly the same
 * intervals. A price, a client, a discount, the length of an unattended phase
 * that is followed by nothing, a reorder of identical services: none of them
 * moves a busy interval, so none of them is a schedule change.
 */
export function areStaffBusyIntervalsEqual(
  left: readonly StaffBusyInterval[],
  right: readonly StaffBusyInterval[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (interval, index) =>
        interval.startAt.getTime() === right[index]?.startAt.getTime() &&
        interval.endAt.getTime() === right[index]?.endAt.getTime(),
    )
  );
}

/**
 * Cancellation and no-show are historical outcomes: the record stays, the
 * calendar space is released. Every other status holds its place.
 */
export function doesAppointmentOccupySchedule(status: AppointmentStatus): boolean {
  return status !== 'CANCELLED' && status !== 'NO_SHOW';
}

/**
 * The intervals during which the Appointment requires the professional, in
 * chronological order. Consecutive staff-required phases (across items too)
 * merge into one interval; an unattended phase splits them; zero-duration
 * phases occupy nothing. A cancelled or no-show Appointment occupies nothing.
 */
export function getAppointmentStaffBusyIntervals(
  appointment: StaffOccupancySource,
): readonly StaffBusyInterval[] {
  if (!doesAppointmentOccupySchedule(appointment.status)) return [];

  const intervals: StaffBusyInterval[] = [];
  let cursor = appointment.startAt.getTime();
  let runStart: number | undefined;

  const closeRun = () => {
    if (runStart !== undefined && cursor > runStart) {
      intervals.push({ startAt: new Date(runStart), endAt: new Date(cursor) });
    }
    runStart = undefined;
  };

  for (const item of [...appointment.items].sort((a, b) => a.order - b.order)) {
    for (const phase of item.phases) {
      if (phase.requiresStaff) {
        runStart ??= cursor;
      } else {
        closeRun();
      }
      cursor += phase.durationMinutes * MINUTE_MS;
    }
  }
  closeRun();

  return intervals;
}
