// Souris — communications gateway boundary (Lot B)
//
// The narrow app surface of appointment email reminders. The server is
// authoritative for everything here: the app reads and edits ONE owner-scoped
// preference and reads ONE per-appointment status projection. It never
// touches the queue, never enqueues, and never learns queue internals
// (payloads, recipients, provider ids, errors).

export interface CommunicationPreferences {
  readonly emailRemindersEnabled: boolean;
  /**
   * DEPRECATED dormant field (SMS pivot Phase 1): the retired
   * appointment-SMS preference the deployed server still returns
   * additively. Parsed tolerantly for compatibility; no screen reads it
   * and it controls nothing.
   */
  readonly smsRemindersEnabled?: boolean;
  /** The professional's configured Reply-To, when one was ever saved. */
  readonly replyToEmail?: string;
}

export type UpdateCommunicationPreferencesResult =
  | { readonly status: 'UPDATED'; readonly preferences: CommunicationPreferences }
  /** The server refused the Reply-To (enabling requires a valid address). */
  | { readonly status: 'INVALID_REPLY_TO' };

export type AppointmentReminderStatusKind =
  | 'SCHEDULED'
  | 'SENT'
  | 'FAILED'
  | 'DISABLED'
  | 'MISSING_EMAIL'
  | 'TOO_LATE'
  | 'NONE';

export interface AppointmentReminderStatus {
  readonly status: AppointmentReminderStatusKind;
  /** Present when SCHEDULED. */
  readonly scheduledFor?: Date;
  /** Present when SENT (provider acceptance, never a delivery/read claim). */
  readonly sentAt?: Date;
}

/**
 * The Business lifecycle SMS automations (SMS pivot Phase 2): the birthday
 * offer and the inactive-client win-back. Server-authoritative, both OFF by
 * default; the numeric knobs are the stored values (the server's V1
 * defaults when never configured). This is deliberately NOT the deprecated
 * appointment-SMS preference.
 */
export interface LifecycleSmsPreferences {
  readonly birthdaySmsEnabled: boolean;
  readonly birthdayDiscountPercent: number;
  readonly birthdayValidityDays: number;
  readonly winbackSmsEnabled: boolean;
  readonly winbackAfterDays: number;
  readonly winbackDiscountPercent: number;
  readonly winbackValidityDays: number;
}

/**
 * One lifecycle update: both switches are always sent (the RPC requires
 * them); each numeric knob is OPTIONAL — an omitted knob keeps its stored
 * value server-side.
 */
export interface LifecycleSmsPreferencesUpdate {
  readonly birthdaySmsEnabled: boolean;
  readonly winbackSmsEnabled: boolean;
  readonly birthdayDiscountPercent?: number;
  readonly birthdayValidityDays?: number;
  readonly winbackAfterDays?: number;
  readonly winbackDiscountPercent?: number;
  readonly winbackValidityDays?: number;
}

export type UpdateLifecycleSmsPreferencesResult =
  | { readonly status: 'UPDATED'; readonly preferences: LifecycleSmsPreferences }
  /** The server refused an out-of-range value. */
  | { readonly status: 'INVALID_VALUE' };

export type CommunicationsGatewayFailureCode = 'NETWORK' | 'FORBIDDEN' | 'UNKNOWN';

export class CommunicationsGatewayError extends Error {
  readonly code: CommunicationsGatewayFailureCode;

  constructor(code: CommunicationsGatewayFailureCode, detail?: string) {
    super(`Communications gateway failure: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'CommunicationsGatewayError';
    this.code = code;
  }
}

export interface CommunicationsGateway {
  /** The server preference; disabled with no Reply-To when never configured. */
  readPreferences(businessId: string): Promise<CommunicationPreferences>;
  /** Persists the preference; the SERVER reconciles the queue afterwards. */
  updatePreferences(
    businessId: string,
    preferences: { readonly emailRemindersEnabled: boolean; readonly replyToEmail?: string },
  ): Promise<UpdateCommunicationPreferencesResult>;
  /** Read-only reminder projection of one appointment (EMAIL only). */
  readAppointmentReminderStatus(
    businessId: string,
    appointmentId: string,
  ): Promise<AppointmentReminderStatus>;
  /** The lifecycle SMS automations; the V1 defaults (both OFF) when never configured. */
  readLifecycleSmsPreferences(businessId: string): Promise<LifecycleSmsPreferences>;
  /**
   * Persists the two automation switches and any supplied numeric knob; the
   * SERVER cancels the disabled automation's pending offers, and the daily
   * server reconciliation is the only thing that ever schedules one. Already
   * queued offers keep their snapshotted discount and validity.
   */
  updateLifecycleSmsPreferences(
    businessId: string,
    preferences: LifecycleSmsPreferencesUpdate,
  ): Promise<UpdateLifecycleSmsPreferencesResult>;
}
