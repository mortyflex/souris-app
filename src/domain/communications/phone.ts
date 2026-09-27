// Souris — communication phone rules
//
// THE phone-usability rules of client SMS communications, mirroring the
// server (`communications_client_phone_e164` and
// `communications_is_sms_eligible_phone`). The server remains
// authoritative: it derives the canonical destination at reconciliation
// time and never trusts the device. This mirror exists ONLY so screens can
// tell apart a missing, an invalid and a usable number — it never decides
// whether a communication is enqueued. Appointment SMS is retired (SMS
// pivot Phase 1); these rules are kept for the future client-lifecycle SMS
// automations.
//
// `clients.phone` itself stays exactly what the professional typed; nothing
// canonical is ever stored. The bare-national fallback assumes France, the
// V1 single-market constant (like the server).
//
// Plain TypeScript: no React, no persistence, no provider SDK.

const SEPARATORS = /[ .()-]/g;
const E164_SHAPE = /^\+[1-9][0-9]{6,14}$/;
const INTERNATIONAL_PREFIX_SHAPE = /^00([1-9][0-9]{6,14})$/;
const FRENCH_NATIONAL_SHAPE = /^0[1-9][0-9]{8}$/;
const FRENCH_MOBILE_E164 = /^\+33[67][0-9]{8}$/;

/**
 * The canonical E.164-like destination a phone value maps to, or undefined
 * when the value is unusable. Same rule as the server.
 */
export function normalizeCommunicationPhoneE164(phone: string | undefined): string | undefined {
  if (phone === undefined) return undefined;
  const compact = phone.trim().replace(SEPARATORS, '');
  if (E164_SHAPE.test(compact)) return compact;
  const international = INTERNATIONAL_PREFIX_SHAPE.exec(compact);
  if (international) return `+${international[1]}`;
  if (FRENCH_NATIONAL_SHAPE.test(compact)) return `+33${compact.slice(1)}`;
  return undefined;
}

/**
 * Whether a phone value is an SMS destination: canonical AND, for French
 * numbers, mobile (+336/+337 — a landline is canonical but never texted).
 * Non-French valid E.164 numbers pass; provider-level destination
 * validation is Lot C2.
 */
export function isUsableCommunicationSmsPhone(phone: string | undefined): boolean {
  const e164 = normalizeCommunicationPhoneE164(phone);
  if (e164 === undefined) return false;
  if (e164.startsWith('+33')) return FRENCH_MOBILE_E164.test(e164);
  return true;
}

export type CommunicationSmsPhoneIssue = 'missing' | 'invalid';

/**
 * Why a client cannot receive SMS, or undefined when the number is usable:
 * 'missing' (no number at all) vs 'invalid' (a number SMS cannot reach) —
 * the same distinction as the server projection's MISSING_PHONE /
 * INVALID_PHONE. Never a failure: it only drives an inline notice.
 */
export function communicationSmsPhoneIssue(
  phone: string | undefined,
): CommunicationSmsPhoneIssue | undefined {
  if (phone === undefined || phone.trim().length === 0) return 'missing';
  return isUsableCommunicationSmsPhone(phone) ? undefined : 'invalid';
}
