// BeautIzzy — which lifecycle SMS updates are a consent withdrawal (never
// refused) and which are business mutations (write guard).

import { DEFAULT_LIFECYCLE_SMS_PREFERENCES } from '@/features/communications/testing/fake-communications-gateway';

import { isLifecycleSmsOptOut } from '../lifecycle-sms-write-access';

const bothOn = { ...DEFAULT_LIFECYCLE_SMS_PREFERENCES, birthdaySmsEnabled: true, winbackSmsEnabled: true };
const bothOff = DEFAULT_LIFECYCLE_SMS_PREFERENCES;

describe('isLifecycleSmsOptOut', () => {
  it('switching an automation OFF, or keeping everything as it is, is an opt-out', () => {
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: false, winbackSmsEnabled: true })).toBe(true);
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: true, winbackSmsEnabled: false })).toBe(true);
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: false, winbackSmsEnabled: false })).toBe(true);
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: true, winbackSmsEnabled: true })).toBe(true);
    expect(isLifecycleSmsOptOut(bothOff, { birthdaySmsEnabled: false, winbackSmsEnabled: false })).toBe(true);
  });

  it('turning an automation ON is a business mutation', () => {
    expect(isLifecycleSmsOptOut(bothOff, { birthdaySmsEnabled: true, winbackSmsEnabled: false })).toBe(false);
    expect(isLifecycleSmsOptOut(bothOff, { birthdaySmsEnabled: false, winbackSmsEnabled: true })).toBe(false);
    expect(isLifecycleSmsOptOut({ ...bothOn, winbackSmsEnabled: false }, { birthdaySmsEnabled: false, winbackSmsEnabled: true })).toBe(false);
  });

  it('changing any knob is a business mutation, even while switching OFF', () => {
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: true, winbackSmsEnabled: true, birthdayDiscountPercent: 20 })).toBe(false);
    expect(isLifecycleSmsOptOut(bothOn, { birthdaySmsEnabled: false, winbackSmsEnabled: true, winbackAfterDays: 90 })).toBe(false);
    expect(isLifecycleSmsOptOut(bothOff, { birthdaySmsEnabled: false, winbackSmsEnabled: false, winbackValidityDays: 3 })).toBe(false);
  });
});
