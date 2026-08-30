import type { Appointment } from '@/domain/appointments';

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
  readonly addAppointment: (entry: AppointmentSessionEntry) => void;
  readonly updateAppointment: (entry: AppointmentSessionEntry) => void;
  readonly deleteAppointment: (appointmentId: string) => void;
}
