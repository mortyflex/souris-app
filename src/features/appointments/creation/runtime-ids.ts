import { createUuidV4 } from '@/shared/lib/uuid';

let appointmentItemSequence = 0;

/**
 * Identity of a NEW Appointment: a globally unique UUID v4, safe for
 * creation on several devices of the same Business. Existing Appointment
 * ids are never rewritten.
 */
export function createAppointmentId(): string {
  return createUuidV4();
}

/** Item identity derived from its parent: unique inside the Appointment, like the parent is globally. */
export function createAppointmentItemId(appointmentId: string, order: number): string {
  return `${appointmentId}-item-${order}`;
}

/** Runtime-only identity for a service added to an existing appointment. */
export function createNewAppointmentItemId(appointmentId: string, now = new Date()): string {
  appointmentItemSequence += 1;
  return `${appointmentId}-item-new-${now.getTime()}-${appointmentItemSequence}`;
}
