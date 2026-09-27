// Souris — CommunicationsGateway bound to the Lot B owner RPCs
//
// Three narrow SECURITY DEFINER functions
// (supabase/migrations/20260927120000_add_appointment_email_reminders.sql):
// read/update the Business reminder preference, and the read-only reminder
// status projection of one appointment. The queue itself has no client
// surface at all. Uses the ONE publishable-key client with the signed-in
// owner's session; errors are reduced to stable codes here.

import type { PostgrestError } from '@supabase/supabase-js';

import {
  CommunicationsGatewayError,
  type AppointmentReminderStatus,
  type AppointmentReminderStatusKind,
  type CommunicationPreferences,
  type CommunicationsGateway,
  type UpdateCommunicationPreferencesResult,
} from '@/features/communications/gateway';

import type { SourisSupabaseClient } from './client';

export type SupabaseCommunicationsApi = Pick<SourisSupabaseClient, 'rpc'>;

/** Exported for tests: PostgREST / Postgres error → stable failure code. */
export function mapCommunicationsPostgrestError(
  error: Pick<PostgrestError, 'code' | 'message'>,
): CommunicationsGatewayError {
  const code = error.code ?? '';
  if (code === '' || /network request failed|failed to fetch|fetch failed/i.test(error.message)) {
    return new CommunicationsGatewayError('NETWORK');
  }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
    return new CommunicationsGatewayError('FORBIDDEN', code);
  }
  return new CommunicationsGatewayError('UNKNOWN', /^[0-9A-Z]{5,8}$/.test(code) ? code : undefined);
}

function asObject(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new CommunicationsGatewayError('UNKNOWN', 'BADRESULT');
  }
  return data as Record<string, unknown>;
}

function toPreferences(data: unknown): CommunicationPreferences {
  const row = asObject(data);
  if (typeof row.email_reminders_enabled !== 'boolean') {
    throw new CommunicationsGatewayError('UNKNOWN', 'BADRESULT');
  }
  const replyTo = row.reply_to_email;
  return {
    emailRemindersEnabled: row.email_reminders_enabled,
    // Deprecated dormant field the deployed server still returns additively;
    // parsed tolerantly (absent = false), controls nothing.
    smsRemindersEnabled: row.sms_reminders_enabled === true,
    ...(typeof replyTo === 'string' && replyTo.length > 0 ? { replyToEmail: replyTo } : {}),
  };
}

function toOptionalInstant(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const STATUS_KINDS: readonly AppointmentReminderStatusKind[] = [
  'SCHEDULED',
  'SENT',
  'FAILED',
  'DISABLED',
  'MISSING_EMAIL',
  'TOO_LATE',
  'NONE',
];

/** Exported for tests: jsonb projection → validated reminder status. */
export function toAppointmentReminderStatus(data: unknown): AppointmentReminderStatus {
  const row = asObject(data);
  const status = row.status;
  if (typeof status !== 'string' || !STATUS_KINDS.includes(status as AppointmentReminderStatusKind)) {
    throw new CommunicationsGatewayError('UNKNOWN', 'BADRESULT');
  }
  const scheduledFor = toOptionalInstant(row.scheduled_for);
  const sentAt = toOptionalInstant(row.sent_at);
  return {
    status: status as AppointmentReminderStatusKind,
    ...(scheduledFor !== undefined ? { scheduledFor } : {}),
    ...(sentAt !== undefined ? { sentAt } : {}),
  };
}

export function createSupabaseCommunicationsGateway(
  client: SupabaseCommunicationsApi,
): CommunicationsGateway {
  return {
    async readPreferences(businessId: string): Promise<CommunicationPreferences> {
      const { data, error } = await client.rpc('communications_read_preferences', {
        p_business_id: businessId,
      });
      if (error) throw mapCommunicationsPostgrestError(error);
      return toPreferences(data);
    },

    async updatePreferences(
      businessId,
      preferences,
    ): Promise<UpdateCommunicationPreferencesResult> {
      const { data, error } = await client.rpc('communications_update_preferences', {
        p_business_id: businessId,
        p_email_reminders_enabled: preferences.emailRemindersEnabled,
        p_reply_to_email: preferences.replyToEmail ?? null,
      });
      if (error) throw mapCommunicationsPostgrestError(error);
      const row = asObject(data);
      if (row.status === 'INVALID_REPLY_TO') return { status: 'INVALID_REPLY_TO' };
      if (row.status !== 'UPDATED') throw new CommunicationsGatewayError('UNKNOWN', 'BADRESULT');
      return { status: 'UPDATED', preferences: toPreferences(data) };
    },

    async readAppointmentReminderStatus(
      businessId,
      appointmentId,
    ): Promise<AppointmentReminderStatus> {
      const { data, error } = await client.rpc('communications_appointment_reminder_status', {
        p_business_id: businessId,
        p_appointment_id: appointmentId,
      });
      if (error) throw mapCommunicationsPostgrestError(error);
      return toAppointmentReminderStatus(data);
    },
  };
}
