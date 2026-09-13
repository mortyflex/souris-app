import type {
  Appointment,
  AppointmentPaymentAmounts,
  AppointmentReferences,
  Service,
} from '@/domain/appointments';

/**
 * The temporary in-memory representation used by the appointment surfaces.
 * Client identity lives in the Client source and is resolved through
 * appointment.clientId — no duplicated display names here.
 */
export interface AppointmentSessionEntry {
  readonly appointment: Appointment;
}

/** Result of the database-backed pre-check run when the professional taps permanent deletion. */
export interface AppointmentDeletionEligibility {
  readonly deletable: boolean;
  readonly references: AppointmentReferences;
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
  /**
   * Explicit checkout (« Encaisser »): ONE transaction writes COMPLETED and
   * the recorded card/cash cents together; state changes only after the
   * commit. Throws when the Appointment is not eligible or the write fails.
   */
  readonly checkoutAppointment: (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
  ) => void;
  /** Corrects the card/cash split of a recorded payment; status and paidAt are preserved. */
  readonly updateAppointmentPayment: (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
  ) => void;
  /** Reads the stored references so the UI never offers a confirmation that cannot succeed. */
  readonly getAppointmentDeletionEligibility: (
    appointmentId: string,
  ) => AppointmentDeletionEligibility;
  /** Throws `AppointmentDeleteConflictError` when history references the Appointment; nothing changes then. */
  readonly deleteAppointment: (appointmentId: string) => void;
}
