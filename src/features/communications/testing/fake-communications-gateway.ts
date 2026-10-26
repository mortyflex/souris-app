// BeautIzzy — in-memory CommunicationsGateway (tests only)
//
// The server contract of the three Lot B owner RPCs, deterministic and
// offline: a per-Business preference row (disabled by default, like the
// server), the INVALID_REPLY_TO refusal, scriptable failures, and scriptable
// appointment reminder statuses; the lifecycle SMS preferences merge only
// the supplied numeric knobs, like the server RPC.

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
  /** Makes the NEXT lifecycle update answer the server's INVALID_VALUE refusal. */
  refuseNextLifecycleUpdate(): void;
  /**
   * Plays the server-side Plus enforcement (Phase 6.5C step 5): while set,
   * an update that would turn reminders or an automation ON answers
   * ENTITLEMENT_REQUIRED and stores nothing; disabling still succeeds.
   */
  setEntitlementEnforced(enforced: boolean): void;
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
  let refusingLifecycleUpdate = false;
  let entitlementEnforced = false;

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
    refuseNextLifecycleUpdate() {
      refusingLifecycleUpdate = true;
    },
    setEntitlementEnforced(enforced) {
      entitlementEnforced = enforced;
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
      // Like the step 5 RPC: turning reminders ON needs Plus; keeping them on, or OFF, never does.
      if (
        entitlementEnforced &&
        next.emailRemindersEnabled &&
        preferencesByBusiness.get(businessId)?.emailRemindersEnabled !== true
      ) {
        return { status: 'ENTITLEMENT_REQUIRED' };
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
      if (refusingLifecycleUpdate) {
        refusingLifecycleUpdate = false;
        return { status: 'INVALID_VALUE' };
      }
      // Like the server: the switches change, an omitted numeric knob stays
      // stored (NULL keeps the stored value).
      const stored = lifecycleByBusiness.get(businessId) ?? DEFAULT_LIFECYCLE_SMS_PREFERENCES;
      // Like the step 5 RPC: turning an automation ON needs Plus; OFF never does.
      if (
        entitlementEnforced &&
        ((next.birthdaySmsEnabled && !stored.birthdaySmsEnabled) || (next.winbackSmsEnabled && !stored.winbackSmsEnabled))
      ) {
        return { status: 'ENTITLEMENT_REQUIRED' };
      }
      const preferences: LifecycleSmsPreferences = {
        birthdaySmsEnabled: next.birthdaySmsEnabled,
        birthdayDiscountPercent: next.birthdayDiscountPercent ?? stored.birthdayDiscountPercent,
        birthdayValidityDays: next.birthdayValidityDays ?? stored.birthdayValidityDays,
        winbackSmsEnabled: next.winbackSmsEnabled,
        winbackAfterDays: next.winbackAfterDays ?? stored.winbackAfterDays,
        winbackDiscountPercent: next.winbackDiscountPercent ?? stored.winbackDiscountPercent,
        winbackValidityDays: next.winbackValidityDays ?? stored.winbackValidityDays,
      };
      lifecycleByBusiness.set(businessId, preferences);
      lifecycleUpdates.push({ businessId, preferences });
      return { status: 'UPDATED', preferences };
    },
  };
}
