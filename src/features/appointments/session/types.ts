import type { Appointment } from '@/domain/appointments';

/**
 * The temporary in-memory representation used by the appointment surfaces.
 * Client display data stays outside the Appointment domain object.
 */
export interface AppointmentSessionEntry {
  readonly appointment: Appointment;
  readonly clientDisplayName: string;
}

export interface AppointmentSessionValue {
  readonly appointments: readonly AppointmentSessionEntry[];
  readonly getAppointmentById: (
    appointmentId: string | undefined,
  ) => AppointmentSessionEntry | undefined;
  readonly addAppointment: (entry: AppointmentSessionEntry) => void;
  readonly updateAppointment: (entry: AppointmentSessionEntry) => void;
}
