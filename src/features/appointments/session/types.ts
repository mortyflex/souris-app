import type { Appointment, Service } from '@/domain/appointments';

/**
 * The temporary in-memory representation used by the appointment surfaces.
 * Client identity lives in the Client source and is resolved through
 * appointment.clientId — no duplicated display names here.
 */
export interface AppointmentSessionEntry {
  readonly appointment: Appointment;
}

export interface AppointmentSessionValue {
  readonly appointments: readonly AppointmentSessionEntry[];
  readonly getAppointmentById: (
    appointmentId: string | undefined,
  ) => AppointmentSessionEntry | undefined;
  /**
   * Persists a NEW Appointment and, in the same transaction, the Service
   * catalog default updates its creation justified. On failure nothing is
   * persisted and neither the appointment nor the catalog state changes.
   */
  readonly addAppointment: (
    entry: AppointmentSessionEntry,
    serviceDefaultUpdates?: readonly Service[],
  ) => void;
  readonly updateAppointment: (entry: AppointmentSessionEntry) => void;
  readonly deleteAppointment: (appointmentId: string) => void;
}
