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
//
// Observed time (Phase 6.5C step 7). `now` is the device clock, which a user
// can set back. The caller may hand over the high-water mark of the instants
// this device has observed so far (`observedUntil`, persisted beside the
// proof); the OFFLINE policy is then judged at the later of `now` and that
// mark (`assessClock`), so setting the clock back wins back nothing: an
// entitlement that had ended stays ended, an elapsed grace stays elapsed. A
// `now` behind the mark by more than `CLOCK_ROLLBACK_TOLERANCE_MS` is a clock
// ROLLBACK — a manual change, never an automatic correction, which moves the
// clock by seconds — and time progression is unreliable: a proven
// entitlement still in force at the mark keeps full access until its trusted
// end (the store's instant, not the clock's), but the conditional 72-hour
// grace, which rests on time having progressed normally, is refused
// (`unreliable-evidence`) until a verification succeeds or the clock catches
// up with the mark. A clock behind the proof's OWN verification instant is
// judged as before: the proof reads as unreliable, whatever the mark says. A successful verification is unaffected: the store just
// spoke, and the adapter accepts its answer only within minutes of the
// store's own request instant (customer-info.ts), so `now` is then anchored.
//
// What this protects, and what it cannot: a device-only mark is not trusted
// time. It is written by this application from the clock it observed, so a
// clock set back BEFORE the application observed the later instant (while it
// was closed, or on a device that never ran through the grace) is not
// detected, a tampered database can hold any mark, and nothing here is
// cryptographic. It raises the cost of the one cheap manipulation — setting
// the clock back on an unmodified device — to exactly what the server-side
// mirror ignores anyway: every write reaching the server is decided there
// (`docs/architecture/SUBSCRIPTIONS.md`), and local-only access is all a
// manipulated clock can ever buy.

import type {
  BusinessAccess,
  BusinessAccessInput,
  EntitlementEvidence,
  SubscriptionEntitlement,
  SubscriptionVerification,
} from './types';

export const OFFLINE_ACCESS_GRACE_PERIOD_HOURS = 72;

export const OFFLINE_ACCESS_GRACE_PERIOD_MS = OFFLINE_ACCESS_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

/**
 * How far behind the observed high-water mark `now` may be before it is a
 * clock rollback: five minutes — the window within which a store answer is
 * accepted as fresh. Automatic corrections move a clock by seconds; a manual
 * change moves it by more.
 */
export const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;

const ENTITLED: BusinessAccess = { mode: 'full', reason: 'entitled' };

function isValidInstant(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** The instant the offline policy is judged at, and whether the clock was found set back. */
export interface ClockAssessment {
  /** The later of `now` and the observed high-water mark (a fresh Date). */
  readonly effectiveNow: Date;
  /** `now` is behind the mark by more than `CLOCK_ROLLBACK_TOLERANCE_MS`. */
  readonly rolledBack: boolean;
}

/**
 * Judges `now` against the high-water mark of observed time. An absent or
 * invalid mark means nothing was observed: `now` stands, nothing is rolled
 * back. Never reads a clock.
 */
export function assessClock(now: Date, observedUntil: Date | undefined): ClockAssessment {
  if (!isValidInstant(now)) {
    throw new RangeError('assessClock: invalid current instant');
  }
  if (!isValidInstant(observedUntil) || observedUntil.getTime() <= now.getTime()) {
    return { effectiveNow: new Date(now.getTime()), rolledBack: false };
  }
  return {
    effectiveNow: new Date(observedUntil.getTime()),
    rolledBack: observedUntil.getTime() - now.getTime() > CLOCK_ROLLBACK_TOLERANCE_MS,
  };
}

/**
 * The high-water mark after observing `now`: the later of the two. An absent
 * or invalid mark starts at `now`. The mark only ever advances.
 */
export function advanceObservedTime(observedUntil: Date | undefined, now: Date): Date {
  if (!isValidInstant(now)) {
    throw new RangeError('advanceObservedTime: invalid current instant');
  }
  if (!isValidInstant(observedUntil) || observedUntil.getTime() < now.getTime()) {
    return new Date(now.getTime());
  }
  return new Date(observedUntil.getTime());
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
 * What a RELIABLE proof grants when the renewal cannot be verified, judged at
 * the effective instant: full until its expiration; then the 72-hour grace,
 * unless the entitlement was known not to renew, and unless the clock was
 * found set back (the grace needs time to have progressed normally); then
 * read-only.
 */
function resolveUnverifiedEntitlementAccess(
  entitlement: SubscriptionEntitlement,
  { effectiveNow, rolledBack }: ClockAssessment,
): BusinessAccess {
  const { expiresAt } = entitlement;
  if (expiresAt === undefined) return ENTITLED;
  if (effectiveNow.getTime() < expiresAt.getTime()) return ENTITLED;
  if (entitlement.kind === 'cancelled-active') {
    return { mode: 'read-only', reason: 'subscription-expired' };
  }
  if (rolledBack) return { mode: 'read-only', reason: 'unreliable-evidence' };
  const graceEndsAt = new Date(expiresAt.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS);
  if (effectiveNow.getTime() < graceEndsAt.getTime()) {
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
  // A proof dated after the clock reads is not a proof, whatever was
  // observed since: the clock stands behind the proof's own instant.
  if (!isReliableEntitlementEvidence(evidence, input.now)) {
    return { mode: 'read-only', reason: 'unreliable-evidence' };
  }
  // What it grants is judged at the later of the clock and what this device
  // has already observed: a clock set back cannot un-end anything.
  return resolveUnverifiedEntitlementAccess(evidence.entitlement, assessClock(input.now, input.observedUntil));
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
