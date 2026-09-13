import type {
  Appointment,
  AppointmentPaymentAmounts,
  AppointmentPhaseDurationUpdate,
  AppointmentReferences,
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
   * Persists a NEW Appointment (row + item + phase snapshots) in one
   * transaction. Snapshot only: the Service catalog is never written. On
   * failure nothing is persisted and state does not change.
   */
  readonly addAppointment: (entry: AppointmentSessionEntry) => void;
  readonly updateAppointment: (entry: AppointmentSessionEntry) => void;
  /**
   * Appointment-specific timing edit from Appointment Details: the phase
   * durations of ONE AppointmentItem snapshot change in ONE transaction and
   * state reflects them only after the commit. Never writes the Service
   * catalog. Throws when the Appointment is not editable or the write fails.
   */
  readonly updateAppointmentItemTiming: (
    appointmentId: string,
    appointmentItemId: string,
    updates: readonly AppointmentPhaseDurationUpdate[],
  ) => void;
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
