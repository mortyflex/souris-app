import type { AppointmentStatus } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

const NON_OCCUPYING_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'CANCELLED',
  'NO_SHOW',
]);

/**
 * The Agenda projects operational occupancy, not the complete Appointment
 * history. Cancellation and no-show records remain in the session for
 * Details and Client history, but they do not reserve visual calendar space.
 */
export function getOperationalAgendaEntries(
  entries: readonly AppointmentSessionEntry[],
): readonly AppointmentSessionEntry[] {
  return entries.filter(
    ({ appointment }) => !NON_OCCUPYING_STATUSES.has(appointment.status),
  );
}
