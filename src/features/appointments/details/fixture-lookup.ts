import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

/** Pure lookup used by tests and non-React presentation boundaries. */
export function getAppointmentSessionEntryById(
  appointments: readonly AppointmentSessionEntry[],
  appointmentId: string | undefined,
): AppointmentSessionEntry | undefined {
  if (!appointmentId) return undefined;

  return appointments.find(
    ({ appointment }) => appointment.id === appointmentId,
  );
}
