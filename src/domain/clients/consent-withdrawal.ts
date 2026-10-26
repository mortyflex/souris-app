// BeautIzzy — a Client edit that only withdraws the promotional SMS consent — pure
//
// THE rule telling a privacy-protective action apart from a paid business
// mutation (BeautIzzy Plus, Phase 6.5C step 8). A professional whose access
// is read-only must still be able to record that a client REFUSES
// promotional SMS: the server sends those SMS from its own copy of the
// consent, so a withdrawal is only effective once it reaches the server, and
// the server applies exactly this kind of write without Plus
// (`sync_withdraw_client_sms_consent`). The rule here is the SAME as the
// server's, so a withdrawal the device lets through is one the server
// accepts:
//
//   - the next consent is OPTED_OUT;
//   - every other identity field is unchanged: first name, last name, phone,
//     email, birthday, notes.
//
// Granting or restoring a consent (OPTED_IN, or clearing it back to
// « Non renseigné ») is never a withdrawal; a withdrawal bundled with any
// other change is a business edit and goes through the ordinary guard. The
// photo and the archive marker are not part of an identity edit and are not
// compared. Framework-independent.

import type { Client } from './types';

function sameOptional(a: string | undefined, b: string | undefined): boolean {
  return (a ?? undefined) === (b ?? undefined);
}

function sameBirthday(a: Client['birthday'], b: Client['birthday']): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.month === b.month && a.day === b.day;
}

/**
 * Whether replacing `current` by `next` withdraws the client's SMS consent
 * and changes nothing else of the identity. Idempotent: a client already
 * opted out, saved again with the same identity and an OPTED_OUT consent,
 * is a withdrawal too (nothing is granted).
 */
export function isClientSmsConsentWithdrawalOnly(current: Client, next: Client): boolean {
  if (next.id !== current.id) return false;
  if (next.smsMarketingConsent?.status !== 'OPTED_OUT') return false;
  return (
    next.firstName === current.firstName &&
    sameOptional(next.lastName, current.lastName) &&
    sameOptional(next.phone, current.phone) &&
    sameOptional(next.email, current.email) &&
    sameOptional(next.notes, current.notes) &&
    sameBirthday(next.birthday, current.birthday)
  );
}
