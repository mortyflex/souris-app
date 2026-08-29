// Souris — Client profile presentation
//
// Souris-generated Appointment history and derived activity ONLY. Nothing
// here is stored on the Client: every value is derived from Appointment
// state through appointment.clientId. Summaries and totals come
// exclusively from AppointmentItem snapshots (never the current catalog).

import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { getAppointmentSnapshotTotal } from '@/features/appointments/presentation';

const STATUSES_EXCLUDED_FROM_UPCOMING = new Set([
  'CANCELLED',
  'NO_SHOW',
  'COMPLETED',
]);

export interface ClientActivitySummary {
  readonly appointmentCount: number;
  readonly completedAppointmentCount: number;
  readonly cancelledAppointmentCount: number;
  readonly noShowAppointmentCount: number;
  /** Sum of AppointmentItem snapshot prices for COMPLETED appointments only. */
  readonly totalSpent: number;
  readonly upcomingAppointments: readonly AppointmentSessionEntry[];
  readonly historicalAppointments: readonly AppointmentSessionEntry[];
  readonly nextAppointment: AppointmentSessionEntry | undefined;
}

/** All appointments of one client, newest first. Never mutates the source. */
export function getClientAppointments(
  appointments: readonly AppointmentSessionEntry[],
  clientId: string,
): readonly AppointmentSessionEntry[] {
  return appointments
    .filter(({ appointment }) => appointment.clientId === clientId)
    .sort(
      (a, b) =>
        b.appointment.startAt.getTime() - a.appointment.startAt.getTime() ||
        b.appointment.id.localeCompare(a.appointment.id),
    );
}

/**
 * Upcoming operational appointments: not CANCELLED / NO_SHOW / COMPLETED and
 * starting at or after `now`. Sorted nearest first.
 */
export function getUpcomingClientAppointments(
  appointments: readonly AppointmentSessionEntry[],
  clientId: string,
  now: Date = new Date(),
): readonly AppointmentSessionEntry[] {
  return appointments
    .filter(
      ({ appointment }) =>
        appointment.clientId === clientId &&
        !STATUSES_EXCLUDED_FROM_UPCOMING.has(appointment.status) &&
        appointment.startAt.getTime() >= now.getTime(),
    )
    .sort(
      (a, b) =>
        a.appointment.startAt.getTime() - b.appointment.startAt.getTime() ||
        a.appointment.id.localeCompare(b.appointment.id),
    );
}

/**
 * Historical appointments: everything not upcoming (past active statuses,
 * COMPLETED, CANCELLED, NO_SHOW). Newest first.
 */
export function getHistoricalClientAppointments(
  appointments: readonly AppointmentSessionEntry[],
  clientId: string,
  now: Date = new Date(),
): readonly AppointmentSessionEntry[] {
  const upcomingIds = new Set(
    getUpcomingClientAppointments(appointments, clientId, now).map(
      ({ appointment }) => appointment.id,
    ),
  );

  return getClientAppointments(appointments, clientId).filter(
    ({ appointment }) => !upcomingIds.has(appointment.id),
  );
}

/**
 * The complete derived activity of one client.
 *
 * Count rules are explicit and status-based — never date-based:
 *   Rendez-vous réalisés  → COMPLETED only
 *   Annulations           → CANCELLED only
 *   Absences              → NO_SHOW only
 *   Total dépensé         → snapshot prices of COMPLETED only
 */
export function getClientActivitySummary(
  appointments: readonly AppointmentSessionEntry[],
  clientId: string,
  now: Date = new Date(),
): ClientActivitySummary {
  const clientAppointments = getClientAppointments(appointments, clientId);
  const upcomingAppointments = getUpcomingClientAppointments(appointments, clientId, now);
  const historicalAppointments = getHistoricalClientAppointments(appointments, clientId, now);

  let completedAppointmentCount = 0;
  let cancelledAppointmentCount = 0;
  let noShowAppointmentCount = 0;
  let totalSpent = 0;

  for (const { appointment } of clientAppointments) {
    if (appointment.status === 'COMPLETED') {
      completedAppointmentCount += 1;
      totalSpent += getAppointmentSnapshotTotal(appointment);
    } else if (appointment.status === 'CANCELLED') {
      cancelledAppointmentCount += 1;
    } else if (appointment.status === 'NO_SHOW') {
      noShowAppointmentCount += 1;
    }
  }

  return {
    appointmentCount: clientAppointments.length,
    completedAppointmentCount,
    cancelledAppointmentCount,
    noShowAppointmentCount,
    totalSpent,
    upcomingAppointments,
    historicalAppointments,
    nextAppointment: upcomingAppointments[0],
  };
}
