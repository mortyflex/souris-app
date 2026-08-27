let appointmentSequence = 0;
let appointmentItemSequence = 0;

/** Runtime-only identifiers for the current in-memory creation flow. */
export function createAppointmentId(now = new Date()): string {
  appointmentSequence += 1;
  return `appointment-${now.getTime()}-${appointmentSequence}`;
}

export function createAppointmentItemId(appointmentId: string, order: number): string {
  return `${appointmentId}-item-${order}`;
}

/** Runtime-only identity for a service added to an existing appointment. */
export function createNewAppointmentItemId(appointmentId: string, now = new Date()): string {
  appointmentItemSequence += 1;
  return `${appointmentId}-item-new-${now.getTime()}-${appointmentItemSequence}`;
}
