// BeautIzzy — when does business access change by time alone? — pure
//
// `resolveBusinessAccess` answers for ONE instant. An application that stays
// open must ask again when the answer can have changed, and this module says
// when, with the same vocabulary as the resolver, so no provider compares an
// expiration date on its own:
//
//   isVerificationCurrent      how long a store answer stands. A confirmed
//                              expiration or absence stands until the store
//                              says otherwise. An entitlement stands until its
//                              end: "active until 14:00" says nothing about
//                              14:00 itself — maybe renewed, maybe not — and
//                              from then on only the proof (the evidence)
//                              speaks, with its offline policy. A lapsed answer
//                              is read as `unavailable`, never as a fresh one.
//
//   nextBusinessAccessDeadline the earliest instant strictly after `now` at
//                              which the resolver may answer differently for
//                              the same input: the end of the entitlement in
//                              force, then the end of the offline grace that
//                              follows it — or, while the clock is found set
//                              back, the instant it catches up with the
//                              observed mark. Undefined when nothing is
//                              pending: enforcement disabled, a confirmed end,
//                              an indefinite complimentary access, an
//                              unreliable proof, a cancelled subscription past
//                              its end, a grace already elapsed.
//
// Every deadline is a property of the proof, never of the clock or of an
// attempt: asking again, failing to verify, or restarting the timer cannot
// move it. The proof is judged at the resolver's effective instant (the later
// of the clock and the observed high-water mark), so a clock set back does
// not move a deadline either.

import {
  CLOCK_ROLLBACK_TOLERANCE_MS,
  OFFLINE_ACCESS_GRACE_PERIOD_MS,
  assessClock,
  isReliableEntitlementEvidence,
} from './resolve-business-access';
import type { BusinessAccessInput, SubscriptionVerification } from './types';

function isValidInstant(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Whether a verification obtained earlier still stands at `now`. Only an
 * entitlement with an end lapses, at that end (inclusive).
 */
export function isVerificationCurrent(verification: SubscriptionVerification, now: Date): boolean {
  if (!isValidInstant(now)) {
    throw new RangeError('isVerificationCurrent: invalid current instant');
  }
  if (verification.kind === 'unavailable') return true;
  const { status } = verification;
  if (status.kind === 'expired' || status.kind === 'never') return true;
  if (status.expiresAt === undefined) return true;
  return isValidInstant(status.expiresAt) && now.getTime() < status.expiresAt.getTime();
}

/**
 * The next instant at which `resolveBusinessAccess(input)` may change for the
 * same input, or undefined when time alone cannot change it. Always strictly
 * after `input.now`.
 */
export function nextBusinessAccessDeadline(input: BusinessAccessInput): Date | undefined {
  if (!isValidInstant(input.now)) {
    throw new RangeError('nextBusinessAccessDeadline: invalid current instant');
  }
  if (input.enforcement === 'disabled') return undefined;
  const now = input.now.getTime();

  if (input.verification.kind === 'verified') {
    const { status } = input.verification;
    if (status.kind === 'expired' || status.kind === 'never') return undefined;
    // The entitlement in force ends at `expiresAt`; what follows is decided by
    // the proof, which the end itself will have lapsed this answer into.
    const { expiresAt } = status;
    if (!isValidInstant(expiresAt) || expiresAt.getTime() <= now) return undefined;
    return new Date(expiresAt.getTime());
  }

  const evidence = input.lastVerifiedEntitlement;
  if (evidence === undefined || !isReliableEntitlementEvidence(evidence, input.now)) return undefined;
  // What the proof grants is judged at the effective instant (the resolver's
  // rule): a deadline is a property of the proof, and a clock set back does
  // not move it.
  const { effectiveNow, rolledBack } = assessClock(input.now, input.observedUntil);
  const { entitlement } = evidence;
  if (entitlement.expiresAt === undefined) return undefined;
  const expiresAt = entitlement.expiresAt.getTime();
  const effective = effectiveNow.getTime();
  if (effective < expiresAt) return new Date(expiresAt);
  if (entitlement.kind === 'cancelled-active') return undefined;
  if (rolledBack) {
    // Refused grace: the answer changes once the clock has caught up with the
    // mark (progressing normally from here), strictly after `now`.
    return new Date(effective - CLOCK_ROLLBACK_TOLERANCE_MS);
  }
  const graceEndsAt = expiresAt + OFFLINE_ACCESS_GRACE_PERIOD_MS;
  return effective < graceEndsAt ? new Date(graceEndsAt) : undefined;
}
