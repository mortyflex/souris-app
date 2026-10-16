// BeautIzzy — which lifecycle SMS updates need business write access
//
// A read-only professional (BeautIzzy Plus) must still be able to STOP an
// automation. An update that only switches automations OFF — nothing turned
// on, no discount, delay or validity changed — is a consent withdrawal and is
// never refused. Turning an automation on, or changing one of its knobs, is a
// business mutation and goes through the write guard. The server's own
// entitlement check on what it sends is a separate requirement.

import type { LifecycleSmsPreferences, LifecycleSmsPreferencesUpdate } from '../gateway';

const KNOBS = [
  'birthdayDiscountPercent',
  'birthdayValidityDays',
  'winbackAfterDays',
  'winbackDiscountPercent',
  'winbackValidityDays',
] as const;

/** True when `next` turns nothing on and changes no knob: only switches OFF (or nothing). */
export function isLifecycleSmsOptOut(
  current: Pick<LifecycleSmsPreferences, 'birthdaySmsEnabled' | 'winbackSmsEnabled'>,
  next: LifecycleSmsPreferencesUpdate,
): boolean {
  if (next.birthdaySmsEnabled && !current.birthdaySmsEnabled) return false;
  if (next.winbackSmsEnabled && !current.winbackSmsEnabled) return false;
  return KNOBS.every((knob) => next[knob] === undefined);
}
