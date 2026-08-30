import type { AppointmentSessionEntry } from './types';

/**
 * Permanently removes one in-memory Appointment record. Unknown ids are a
 * no-op and preserve the collection reference, matching session updates.
 */
export function removeAppointmentEntryById(
  entries: readonly AppointmentSessionEntry[],
  appointmentId: string,
): readonly AppointmentSessionEntry[] {
  const index = entries.findIndex(
    ({ appointment }) => appointment.id === appointmentId,
  );
  if (index === -1) return entries;

  return [...entries.slice(0, index), ...entries.slice(index + 1)];
}
