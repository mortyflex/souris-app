// Souris — in-memory CommunicationsGateway (tests only)
//
// The server contract of the three Lot B owner RPCs, deterministic and
// offline: a per-Business preference row (disabled by default, like the
// server), the INVALID_REPLY_TO refusal, scriptable failures, and scriptable
// appointment reminder statuses.

import { isUsableCommunicationEmail } from '@/domain/communications';

import {
  CommunicationsGatewayError,
  type AppointmentChannelReminderStatus,
  type AppointmentReminderStatus,
  type CommunicationPreferences,
  type CommunicationsGateway,
  type CommunicationsGatewayFailureCode,
} from '../gateway';

export interface FakeCommunicationsGateway extends CommunicationsGateway {
  readonly calls: { read: number; update: number; status: number };
  /** Arguments of every accepted update, in order. */
  readonly updates: { businessId: string; preferences: CommunicationPreferences }[];
  /** Makes the NEXT call fail with the given code. */
  failNext(code: CommunicationsGatewayFailureCode): void;
  /** Scripts the projection answer of one appointment. */
  setReminderStatus(appointmentId: string, status: AppointmentReminderStatus): void;
  /** Scripts the PER-CHANNEL projection answer of one appointment. */
  setReminderChannelStatuses(
    appointmentId: string,
    statuses: readonly AppointmentChannelReminderStatus[],
  ): void;
  /** Seeds the stored preference of a Business. */
  seedPreferences(businessId: string, preferences: CommunicationPreferences): void;
}

export function createFakeCommunicationsGateway(): FakeCommunicationsGateway {
  const preferencesByBusiness = new Map<string, CommunicationPreferences>();
  const statusByAppointment = new Map<string, AppointmentReminderStatus>();
  const channelStatusesByAppointment = new Map<
    string,
    readonly AppointmentChannelReminderStatus[]
  >();
  const calls = { read: 0, update: 0, status: 0 };
  const updates: { businessId: string; preferences: CommunicationPreferences }[] = [];
  let nextFailure: CommunicationsGatewayFailureCode | undefined;

  const takeFailure = () => {
    if (nextFailure === undefined) return;
    const code = nextFailure;
    nextFailure = undefined;
    throw new CommunicationsGatewayError(code);
  };

  return {
    calls,
    updates,
    failNext(code) {
      nextFailure = code;
    },
    setReminderStatus(appointmentId, status) {
      statusByAppointment.set(appointmentId, status);
    },
    setReminderChannelStatuses(appointmentId, statuses) {
      channelStatusesByAppointment.set(appointmentId, statuses);
    },
    seedPreferences(businessId, preferences) {
      preferencesByBusiness.set(businessId, preferences);
    },
    async readPreferences(businessId) {
      calls.read += 1;
      takeFailure();
      return preferencesByBusiness.get(businessId) ?? { emailRemindersEnabled: false };
    },
    async updatePreferences(businessId, next) {
      calls.update += 1;
      takeFailure();
      const replyTo = next.replyToEmail?.trim();
      if (replyTo !== undefined && !isUsableCommunicationEmail(replyTo)) {
        return { status: 'INVALID_REPLY_TO' };
      }
      if (next.emailRemindersEnabled && replyTo === undefined) {
        return { status: 'INVALID_REPLY_TO' };
      }
      // Like the server: the email update never touches the SMS switch.
      const preferences: CommunicationPreferences = {
        emailRemindersEnabled: next.emailRemindersEnabled,
        smsRemindersEnabled:
          preferencesByBusiness.get(businessId)?.smsRemindersEnabled === true,
        ...(replyTo !== undefined ? { replyToEmail: replyTo } : {}),
      };
      preferencesByBusiness.set(businessId, preferences);
      updates.push({ businessId, preferences });
      return { status: 'UPDATED', preferences };
    },
    async readAppointmentReminderStatus(_businessId, appointmentId) {
      calls.status += 1;
      takeFailure();
      return statusByAppointment.get(appointmentId) ?? { status: 'NONE' };
    },
    async readAppointmentReminderStatuses(_businessId, appointmentId) {
      calls.status += 1;
      takeFailure();
      return (
        channelStatusesByAppointment.get(appointmentId) ?? [
          { channel: 'EMAIL', status: 'NONE' },
          { channel: 'SMS', status: 'NONE' },
        ]
      );
    },
  };
}
