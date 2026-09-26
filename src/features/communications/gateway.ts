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
   * Transactional appointment SMS (Lot C1). Absent (older cache/server
   * answers) reads as false — the fail-safe default. No app UI can change
   * it before Lot C3: the server RPC exists for controlled testing only.
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

export type CommunicationChannel = 'EMAIL' | 'SMS';

/** The per-channel vocabulary adds the SMS recipient states (Lot C1). */
export type AppointmentChannelReminderStatusKind =
  | AppointmentReminderStatusKind
  | 'MISSING_PHONE'
  | 'INVALID_PHONE';

export interface AppointmentChannelReminderStatus {
  readonly channel: CommunicationChannel;
  readonly status: AppointmentChannelReminderStatusKind;
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
  /** Read-only reminder projection of one appointment (legacy, EMAIL only). */
  readAppointmentReminderStatus(
    businessId: string,
    appointmentId: string,
  ): Promise<AppointmentReminderStatus>;
  /** Read-only PER-CHANNEL reminder projection of one appointment (Lot C1). */
  readAppointmentReminderStatuses(
    businessId: string,
    appointmentId: string,
  ): Promise<readonly AppointmentChannelReminderStatus[]>;
}
