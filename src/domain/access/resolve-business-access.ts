// BeautIzzy — Business access resolution (BeautIzzy Plus) — pure
//
// THE rule deciding whether the professional may change her business data.
// Screens, sessions and providers ask it; none of them compares an expiration
// date on its own.
//
//   enforcement disabled                      → full   (the state until the paywall phase)
//   verified: expired / never                 → read-only, whatever was proven before
//   verified: entitlement, now < expiresAt    → full
//   verified: entitlement, no expiresAt       → full   (complimentary pilot access)
//   verified: entitlement, expiresAt <= now   → read-only (contradictory, see below)
//   unavailable, no evidence                  → read-only (fresh install, no proof)
//   unavailable, evidence, now < expiresAt    → full   (the proof still holds offline)
//   unavailable, cancelled-active, expired    → read-only (it was never going to renew)
//   expiresAt <= now < expiresAt + 72 h       → full   (offline grace, renewal unverified)
//   now >= expiresAt + 72 h                   → read-only until a verification succeeds
//
// The offline grace exists for ONE situation: a proven entitlement that may
// have renewed, whose renewal cannot be verified. It is never the answer of a
// successful verification — the store just spoke — and never granted to a
// cancelled subscription, whose end was known when it was verified.
//
// The grace runs from the EXPIRATION of the proven entitlement, never from a
// launch or a failed check: the deadline is a property of the proof, so
// retrying or restarting cannot move it. Only a successful verification
// produces a new proof (`updateEntitlementEvidence`), and a confirmed
// expiration erases the previous one, so a stale proof can never resurrect
// access once the store has spoken.
//
// An invalid or contradictory timestamp (NaN, an entitlement that expired
// before — or at the instant — it was verified, a proof dated in the future)
// is not a proof: it reads as read-only, never as access. A freshly verified
// entitlement is judged by the same rule, with `now` as its verification
// instant: a store answer "active, expired an hour ago" is contradictory
// here. The future store adapter must therefore report an entitlement the
// store still honours (a billing retry, a store-side grace) as `active` with
// the expiration the store extends it to, and never with an expiration
// already behind `now`. This module models no store-side grace of its own.

import type {
  BusinessAccess,
  BusinessAccessInput,
  EntitlementEvidence,
  SubscriptionEntitlement,
  SubscriptionVerification,
} from './types';

export const OFFLINE_ACCESS_GRACE_PERIOD_HOURS = 72;

export const OFFLINE_ACCESS_GRACE_PERIOD_MS = OFFLINE_ACCESS_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

const ENTITLED: BusinessAccess = { mode: 'full', reason: 'entitled' };

function isValidInstant(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * A proof is trusted only when its timestamps make sense: real instants, an
 * entitlement that expires strictly after it was verified, a verification
 * that is not in the future.
 */
export function isReliableEntitlementEvidence(evidence: EntitlementEvidence, now: Date): boolean {
  if (!isValidInstant(evidence.verifiedAt)) return false;
  if (evidence.verifiedAt.getTime() > now.getTime()) return false;
  const expiresAt = evidence.entitlement.expiresAt;
  if (expiresAt === undefined) return true;
  if (!isValidInstant(expiresAt)) return false;
  return expiresAt.getTime() > evidence.verifiedAt.getTime();
}

/**
 * What a RELIABLE proof grants when the renewal cannot be verified: full
 * until its expiration; then the 72-hour grace, unless the entitlement was
 * known not to renew; then read-only.
 */
function resolveUnverifiedEntitlementAccess(
  entitlement: SubscriptionEntitlement,
  now: Date,
): BusinessAccess {
  const { expiresAt } = entitlement;
  if (expiresAt === undefined) return ENTITLED;
  if (now.getTime() < expiresAt.getTime()) return ENTITLED;
  if (entitlement.kind === 'cancelled-active') {
    return { mode: 'read-only', reason: 'subscription-expired' };
  }
  const graceEndsAt = new Date(expiresAt.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS);
  if (now.getTime() < graceEndsAt.getTime()) {
    return { mode: 'full', reason: 'offline-grace', graceEndsAt };
  }
  return { mode: 'read-only', reason: 'grace-elapsed' };
}

export function resolveBusinessAccess(input: BusinessAccessInput): BusinessAccess {
  if (!isValidInstant(input.now)) {
    throw new RangeError('resolveBusinessAccess: invalid current instant');
  }
  if (input.enforcement === 'disabled') return { mode: 'full', reason: 'enforcement-disabled' };

  if (input.verification.kind === 'verified') {
    const { status } = input.verification;
    if (status.kind === 'expired') return { mode: 'read-only', reason: 'subscription-expired' };
    if (status.kind === 'never') return { mode: 'read-only', reason: 'never-subscribed' };
    // The store just answered: the entitlement is a proof dated now, and it
    // holds only if it expires after now. No grace can follow a verification.
    const proof: EntitlementEvidence = { verifiedAt: input.now, entitlement: status };
    if (!isReliableEntitlementEvidence(proof, input.now)) {
      return { mode: 'read-only', reason: 'unreliable-evidence' };
    }
    return ENTITLED;
  }

  const evidence = input.lastVerifiedEntitlement;
  if (evidence === undefined) return { mode: 'read-only', reason: 'no-entitlement-evidence' };
  if (!isReliableEntitlementEvidence(evidence, input.now)) {
    return { mode: 'read-only', reason: 'unreliable-evidence' };
  }
  return resolveUnverifiedEntitlementAccess(evidence.entitlement, input.now);
}

/** Business mutations require full access; reading never needs it. */
export function canMutateBusinessData(access: Pick<BusinessAccess, 'mode'>): boolean {
  return access.mode === 'full';
}

/**
 * THE rule keeping the proof honest. A successful verification of an
 * entitlement becomes the new proof, dated `now`; a confirmed expiration or
 * absence erases it; a failed verification keeps the previous proof EXACTLY
 * as it is, so its grace deadline never moves.
 */
export function updateEntitlementEvidence(
  previous: EntitlementEvidence | undefined,
  verification: SubscriptionVerification,
  now: Date,
): EntitlementEvidence | undefined {
  if (verification.kind === 'unavailable') return previous;
  const { status } = verification;
  if (status.kind === 'expired' || status.kind === 'never') return undefined;
  if (!isValidInstant(now)) {
    throw new RangeError('updateEntitlementEvidence: invalid current instant');
  }
  return { verifiedAt: new Date(now.getTime()), entitlement: status };
}
