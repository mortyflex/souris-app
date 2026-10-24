import type {
  Appointment,
  AppointmentDeposit,
  AppointmentDiscount,
  AppointmentPaymentDate,
  AppointmentPaymentAmounts,
  AppointmentPhaseDurationUpdate,
  AppointmentReferences,
  PaymentMethod,
} from '@/domain/appointments';

/**
 * The temporary in-memory representation used by the appointment surfaces.
 * Client identity lives in the Client source and is resolved through
 * appointment.clientId — no duplicated display names here.
 */
export interface AppointmentSessionEntry {
  readonly appointment: Appointment;
}

/** The FINAL discount chosen while collecting payment; `undefined` removes it. */
export interface AppointmentCheckoutDiscount {
  readonly discount: AppointmentDiscount | undefined;
}

/** What the professional enters in « Prendre un acompte ». */
export interface AppointmentDepositInput {
  /** Generated ONCE per sheet presentation: a repeated submission is refused, never duplicated. */
  readonly id: string;
  readonly appointmentId: string;
  readonly amountCents: number;
  readonly paymentMethod: PaymentMethod;
}

/**
 * A deposit ALREADY received for an Appointment being CREATED (« Ajouter un
 * acompte reçu » on the Résumé): the Appointment id is the new entry's. The
 * id is generated once per draft deposit, so a repeated save is refused.
 */
export type AppointmentCreationDeposit = Omit<AppointmentDepositInput, 'appointmentId'>;

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
   *
   * With `deposit`, a deposit already received for it is recorded in the
   * SAME transaction (THE deposit write re-verifies it against the stored
   * Appointment just inserted): the Appointment and its deposit are saved
   * together or not at all — never one without the other, never twice for
   * the same deposit id. Throws `AppointmentDepositConflictError` when the
   * deposit is refused; nothing is persisted then.
   */
  readonly addAppointment: (
    entry: AppointmentSessionEntry,
    deposit?: AppointmentCreationDeposit,
  ) => void;
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
   * Direct reorder from Appointment Details by STABLE item ids (every item
   * exactly once): ONE transaction rewrites `order` after re-verifying
   * editability; state changes only after the commit. Never writes the
   * Service catalog. Throws when the Appointment is not editable, the ids do
   * not match, or the write fails — nothing changes then.
   */
  readonly reorderAppointmentItems: (
    appointmentId: string,
    orderedItemIds: readonly string[],
  ) => void;
  /**
   * Direct removal of ONE AppointmentItem from Appointment Details: ONE
   * transaction deletes the item and its phases and normalizes the remaining
   * order after re-verifying editability and the last-item rule; state
   * changes only after the commit. Linked Sales, stock, payment and the
   * catalog are untouched. Throws — and changes nothing — otherwise.
   */
  readonly removeAppointmentItem: (appointmentId: string, appointmentItemId: string) => void;
  /**
   * THE discount action: sets, changes or removes (`undefined`) the discount
   * of an editable Appointment in ONE transaction; state changes only after
   * the commit. Any surface proposing a discount calls this — pricing stays
   * in the domain. Throws when the Appointment is not editable, the discount
   * is invalid, or the write fails — nothing changes then.
   */
  readonly setAppointmentDiscount: (
    appointmentId: string,
    discount: AppointmentDiscount | undefined,
  ) => void;
  /**
   * Explicit checkout (« Encaisser »): ONE transaction writes COMPLETED and
   * the recorded card/cash cents together; state changes only after the
   * commit. Throws when the Appointment is not eligible or the write fails.
   *
   * `finalDiscount` is the discount chosen in the checkout sheet (its
   * `discount` may be `undefined`: removed). When it differs from the stored
   * one it is written in the SAME transaction, before the status changes —
   * never a completed Appointment without its final discount. Omitted, the
   * stored discount is kept.
   *
   * The amounts must settle EXACTLY the checkout due (re-verified by the
   * store). `paymentDate` (default `TODAY`) dates the money: `APPOINTMENT_DAY`
   * places it on the local day of an Appointment of an earlier day.
   */
  readonly checkoutAppointment: (
    appointmentId: string,
    amounts: AppointmentPaymentAmounts,
    finalDiscount?: AppointmentCheckoutDiscount,
    paymentDate?: AppointmentPaymentDate,
  ) => void;
  /**
   * « Terminer le rendez-vous » of a FULLY PREPAID Appointment: ACTIVE
   * deposits cover the whole expected total (with `finalDiscount`, as for
   * checkout), so it becomes COMPLETED WITHOUT any payment — no new money, no
   * new Cash Register movement. ONE transaction; throws and changes nothing
   * when the Appointment is not a prepaid completion.
   *
   * An Appointment already COMPLETED without payment is SETTLED by its
   * deposits instead: only the final discount is written (the store verifies
   * the deposits then cover the whole total); it stays COMPLETED, no payment.
   */
  readonly completePrepaidAppointment: (
    appointmentId: string,
    finalDiscount?: AppointmentCheckoutDiscount,
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
  /** Every Appointment deposit, ACTIVE and VOIDED, as persisted. */
  readonly deposits: readonly AppointmentDeposit[];
  /**
   * Records a NEW ACTIVE deposit (« Prendre un acompte »), received now. The
   * stored Appointment must be financially open and still have the amount
   * left to collect — re-verified in ONE transaction (the stored rows are the
   * authority). Throws `AppointmentDepositConflictError` and changes nothing
   * otherwise, including for a second submission of the same id.
   */
  readonly recordAppointmentDeposit: (input: AppointmentDepositInput) => AppointmentDeposit;
  /**
   * « Annuler l'acompte »: the ACTIVE deposit of a financially open
   * Appointment becomes VOIDED — a correction, not a refund. It stays in the
   * history and counts nowhere. Throws and changes nothing otherwise.
   */
  readonly voidAppointmentDeposit: (depositId: string) => void;
}
