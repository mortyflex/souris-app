// BeautIzzy — client attendance history (presentation only)
//
// What the Appointment creation flow needs to know about a Client's no-shows
// BEFORE a new Appointment is confirmed, derived from the SAME Appointment
// state as the Client profile (`appointment.clientId`), never stored on the
// Client and never scored. Plain functions over domain Appointments: no
// React, no session, no persistence.

import type { Appointment } from '@/domain/appointments';

/** The known outcome of a past Appointment: the Client came, or did not. */
export type AttendanceOutcome = 'ATTENDED' | 'NO_SHOW';

export interface ClientAttendanceHistory {
  /** NO_SHOW Appointments of the Client — the profile's « Absences » rule. */
  readonly noShowCount: number;
  /**
   * The outcome of the Client's MOST RECENT past Appointment that was not
   * cancelled, when that outcome is known. `undefined` when the Client has no
   * such Appointment, or when the most recent one is still unresolved (a past
   * SCHEDULED / CONFIRMED / IN_PROGRESS Appointment nobody closed yet): the
   * history is then uncertain and nothing claims « the last one was missed ».
   */
  readonly latestOutcome: AttendanceOutcome | undefined;
}

/**
 * Same count as `getClientActivitySummary().noShowAppointmentCount`: every
 * Appointment of the Client explicitly marked NO_SHOW. Cancellations (by the
 * client or by the business) and every other status are never absences.
 */
export function countClientNoShows(
  appointments: readonly Appointment[],
  clientId: string,
): number {
  let count = 0;
  for (const appointment of appointments) {
    if (appointment.clientId === clientId && appointment.status === 'NO_SHOW') count += 1;
  }
  return count;
}

/**
 * The Client's most recent Appointment (by `startAt`, never insertion order)
 * that:
 *   - started strictly before `now` (future Appointments say nothing);
 *   - was not CANCELLED, whoever cancelled it.
 *
 * `undefined` when there is none. Ties on the same instant break on the id,
 * so the answer is deterministic.
 */
export function findLatestPastAppointment(
  appointments: readonly Appointment[],
  clientId: string,
  now: Date,
): Appointment | undefined {
  let latest: Appointment | undefined;
  for (const appointment of appointments) {
    if (appointment.clientId !== clientId) continue;
    if (appointment.status === 'CANCELLED') continue;
    if (appointment.startAt.getTime() >= now.getTime()) continue;
    if (
      latest === undefined ||
      appointment.startAt.getTime() > latest.startAt.getTime() ||
      (appointment.startAt.getTime() === latest.startAt.getTime() &&
        appointment.id.localeCompare(latest.id) > 0)
    ) {
      latest = appointment;
    }
  }
  return latest;
}

function toAttendanceOutcome(appointment: Appointment | undefined): AttendanceOutcome | undefined {
  switch (appointment?.status) {
    case 'COMPLETED':
      return 'ATTENDED';
    case 'NO_SHOW':
      return 'NO_SHOW';
    default:
      // No past Appointment, or one whose attendance was never recorded.
      return undefined;
  }
}

export function getClientAttendanceHistory(
  appointments: readonly Appointment[],
  clientId: string,
  now: Date = new Date(),
): ClientAttendanceHistory {
  return {
    noShowCount: countClientNoShows(appointments, clientId),
    latestOutcome: toAttendanceOutcome(findLatestPastAppointment(appointments, clientId, now)),
  };
}
