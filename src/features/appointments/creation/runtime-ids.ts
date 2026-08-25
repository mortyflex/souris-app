let appointmentSequence = 0;

/** Runtime-only identifiers for the current in-memory creation flow. */
export function createAppointmentId(now = new Date()): string {
  appointmentSequence += 1;
  return `appointment-${now.getTime()}-${appointmentSequence}`;
}

export function createAppointmentItemId(appointmentId: string, order: number): string {
  return `${appointmentId}-item-${order}`;
}
