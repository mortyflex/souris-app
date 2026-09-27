// Souris — in-memory CommunicationsGateway (tests only)
//
// The server contract of the three Lot B owner RPCs, deterministic and
// offline: a per-Business preference row (disabled by default, like the
// server), the INVALID_REPLY_TO refusal, scriptable failures, and scriptable
// appointment reminder statuses.

import { isUsableCommunicationEmail } from '@/domain/communications';

import {
  CommunicationsGatewayError,
  type AppointmentReminderStatus,
  type CommunicationPreferences,
  type CommunicationsGateway,
  type CommunicationsGatewayFailureCode,
  type LifecycleSmsPreferences,
} from '../gateway';

/** The server's V1 defaults: both automations OFF. */
export const DEFAULT_LIFECYCLE_SMS_PREFERENCES: LifecycleSmsPreferences = {
  birthdaySmsEnabled: false,
  birthdayDiscountPercent: 15,
  birthdayValidityDays: 7,
  winbackSmsEnabled: false,
  winbackAfterDays: 60,
  winbackDiscountPercent: 10,
  winbackValidityDays: 7,
};

export interface FakeCommunicationsGateway extends CommunicationsGateway {
  readonly calls: {
    read: number;
    update: number;
    status: number;
    readLifecycle: number;
    updateLifecycle: number;
  };
  /** Arguments of every accepted update, in order. */
  readonly updates: { businessId: string; preferences: CommunicationPreferences }[];
  /** Arguments of every accepted lifecycle update, in order. */
  readonly lifecycleUpdates: { businessId: string; preferences: LifecycleSmsPreferences }[];
  /** Makes the NEXT call fail with the given code. */
  failNext(code: CommunicationsGatewayFailureCode): void;
  /** Scripts the projection answer of one appointment. */
  setReminderStatus(appointmentId: string, status: AppointmentReminderStatus): void;
  /** Seeds the stored preference of a Business. */
  seedPreferences(businessId: string, preferences: CommunicationPreferences): void;
  /** Seeds the stored lifecycle SMS preferences of a Business. */
  seedLifecycleSmsPreferences(businessId: string, preferences: LifecycleSmsPreferences): void;
}

export function createFakeCommunicationsGateway(): FakeCommunicationsGateway {
  const preferencesByBusiness = new Map<string, CommunicationPreferences>();
  const lifecycleByBusiness = new Map<string, LifecycleSmsPreferences>();
  const statusByAppointment = new Map<string, AppointmentReminderStatus>();
  const calls = { read: 0, update: 0, status: 0, readLifecycle: 0, updateLifecycle: 0 };
  const updates: { businessId: string; preferences: CommunicationPreferences }[] = [];
  const lifecycleUpdates: { businessId: string; preferences: LifecycleSmsPreferences }[] = [];
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
    lifecycleUpdates,
    failNext(code) {
      nextFailure = code;
    },
    setReminderStatus(appointmentId, status) {
      statusByAppointment.set(appointmentId, status);
    },
    seedPreferences(businessId, preferences) {
      preferencesByBusiness.set(businessId, preferences);
    },
    seedLifecycleSmsPreferences(businessId, preferences) {
      lifecycleByBusiness.set(businessId, preferences);
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
    async readLifecycleSmsPreferences(businessId) {
      calls.readLifecycle += 1;
      takeFailure();
      return lifecycleByBusiness.get(businessId) ?? DEFAULT_LIFECYCLE_SMS_PREFERENCES;
    },
    async updateLifecycleSmsPreferences(businessId, next) {
      calls.updateLifecycle += 1;
      takeFailure();
      // Like the server: the switches change, the numeric knobs stay stored.
      const preferences: LifecycleSmsPreferences = {
        ...(lifecycleByBusiness.get(businessId) ?? DEFAULT_LIFECYCLE_SMS_PREFERENCES),
        birthdaySmsEnabled: next.birthdaySmsEnabled,
        winbackSmsEnabled: next.winbackSmsEnabled,
      };
      lifecycleByBusiness.set(businessId, preferences);
      lifecycleUpdates.push({ businessId, preferences });
      return { status: 'UPDATED', preferences };
    },
  };
}
