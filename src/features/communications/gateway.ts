// Souris — communications gateway boundary (Lot B)
//
// The narrow app surface of appointment email reminders. The server is
// authoritative for everything here: the app reads and edits ONE owner-scoped
// preference and reads ONE per-appointment status projection. It never
// touches the queue, never enqueues, and never learns queue internals
// (payloads, recipients, provider ids, errors).

export interface CommunicationPreferences {
  readonly emailRemindersEnabled: boolean;
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
  /** Read-only reminder projection of one appointment. */
  readAppointmentReminderStatus(
    businessId: string,
    appointmentId: string,
  ): Promise<AppointmentReminderStatus>;
}
