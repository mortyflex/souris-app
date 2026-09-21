import { doesAppointmentOccupySchedule } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

/**
 * The Agenda projects operational occupancy, not the complete Appointment
 * history. Cancellation and no-show records remain in the session for
 * Details and Client history, but they do not reserve visual calendar space
 * (the domain occupancy rule — the same one schedule conflicts use).
 */
export function getOperationalAgendaEntries(
  entries: readonly AppointmentSessionEntry[],
): readonly AppointmentSessionEntry[] {
  return entries.filter(({ appointment }) => doesAppointmentOccupySchedule(appointment.status));
}
