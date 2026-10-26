// BeautIzzy — observed time against the offline policy (Phase 6.5C step 7):
// the high-water mark only advances, the policy is judged at the later of the
// clock and the mark, a small correction changes nothing, a significant
// rollback refuses the conditional grace and nothing else, a confirmed end
// and a verification are untouched, and every deadline stays a property of
// the proof. Explicit instants only: no clock, no network.

import {
  CLOCK_ROLLBACK_TOLERANCE_MS,
  OFFLINE_ACCESS_GRACE_PERIOD_MS,
  advanceObservedTime,
  assessClock,
  nextBusinessAccessDeadline,
  resolveBusinessAccess,
  type BusinessAccessInput,
  type EntitlementEvidence,
  type SubscriptionEntitlement,
} from '..';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const VERIFIED_AT = new Date('2026-10-01T09:00:00.000Z');
const EXPIRES_AT = new Date('2026-10-31T09:00:00.000Z');
const GRACE_END = new Date(EXPIRES_AT.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS);

const at = (base: Date, offsetMs: number) => new Date(base.getTime() + offsetMs);

const proof = (entitlement: SubscriptionEntitlement = { kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }): EntitlementEvidence => ({
  verifiedAt: VERIFIED_AT,
  entitlement,
});

function offline(now: Date, observedUntil: Date | undefined, entitlement?: SubscriptionEntitlement, overrides: Partial<BusinessAccessInput> = {}) {
  const input: BusinessAccessInput = {
    now,
    enforcement: 'enabled',
    verification: { kind: 'unavailable' },
    lastVerifiedEntitlement: proof(entitlement),
    observedUntil,
    ...overrides,
  };
  return { access: resolveBusinessAccess(input), deadline: nextBusinessAccessDeadline(input) };
}

describe('assessClock / advanceObservedTime', () => {
  it('without a mark, or with a mark behind the clock, the clock stands and nothing is rolled back', () => {
    const now = at(VERIFIED_AT, DAY_MS);
    expect(assessClock(now, undefined)).toEqual({ effectiveNow: now, rolledBack: false });
    expect(assessClock(now, at(now, -HOUR_MS))).toEqual({ effectiveNow: now, rolledBack: false });
    expect(assessClock(now, now)).toEqual({ effectiveNow: now, rolledBack: false });
    expect(assessClock(now, new Date(NaN))).toEqual({ effectiveNow: now, rolledBack: false });
    expect(assessClock(now, undefined).effectiveNow).not.toBe(now);
  });

  it('a mark ahead of the clock becomes the effective instant; beyond the tolerance it is a rollback', () => {
    const now = at(VERIFIED_AT, DAY_MS);
    expect(CLOCK_ROLLBACK_TOLERANCE_MS).toBe(5 * MINUTE_MS);
    const small = at(now, CLOCK_ROLLBACK_TOLERANCE_MS);
    expect(assessClock(now, small)).toEqual({ effectiveNow: small, rolledBack: false });
    const significant = at(now, CLOCK_ROLLBACK_TOLERANCE_MS + 1);
    expect(assessClock(now, significant)).toEqual({ effectiveNow: significant, rolledBack: true });
    expect(assessClock(now, at(now, 30 * DAY_MS))).toMatchObject({ rolledBack: true });
  });

  it('the mark only advances, starts at the first observation, and ignores an invalid one', () => {
    const now = at(VERIFIED_AT, DAY_MS);
    expect(advanceObservedTime(undefined, now)).toEqual(now);
    expect(advanceObservedTime(at(now, -HOUR_MS), now)).toEqual(now);
    expect(advanceObservedTime(at(now, HOUR_MS), now)).toEqual(at(now, HOUR_MS));
    expect(advanceObservedTime(new Date(NaN), now)).toEqual(now);
    expect(advanceObservedTime(now, now)).not.toBe(now);
  });

  it('reject an invalid current instant', () => {
    expect(() => assessClock(new Date(NaN), VERIFIED_AT)).toThrow(RangeError);
    expect(() => advanceObservedTime(VERIFIED_AT, new Date(NaN))).toThrow(RangeError);
  });
});

describe('resolveBusinessAccess — normal clock progression (the mark trails the clock)', () => {
  it('is exactly the existing policy: full until the end, the 72-hour grace, read-only after', () => {
    const mark = at(VERIFIED_AT, HOUR_MS);
    expect(offline(at(EXPIRES_AT, -1), mark).access).toEqual({ mode: 'full', reason: 'entitled' });
    expect(offline(EXPIRES_AT, mark).access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    expect(offline(at(GRACE_END, -1), mark).access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    expect(offline(GRACE_END, mark).access).toEqual({ mode: 'read-only', reason: 'grace-elapsed' });
    // The grace never exceeds 72 hours from the end, whatever mark trails behind.
    expect(offline(at(GRACE_END, 1), at(GRACE_END, -DAY_MS)).access).toEqual({ mode: 'read-only', reason: 'grace-elapsed' });
  });

  it('without any mark the answers are the ones of before this step', () => {
    expect(offline(at(EXPIRES_AT, -1), undefined).access).toEqual({ mode: 'full', reason: 'entitled' });
    expect(offline(at(EXPIRES_AT, HOUR_MS), undefined).access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    expect(offline(at(EXPIRES_AT, HOUR_MS), undefined).deadline).toEqual(GRACE_END);
  });
});

describe('resolveBusinessAccess — small clock corrections within the tolerance', () => {
  it('change nothing, except that the proof is judged at the mark: a correction wins back not one second', () => {
    const correction = CLOCK_ROLLBACK_TOLERANCE_MS;
    // Inside the paid period: still entitled.
    expect(offline(at(EXPIRES_AT, -HOUR_MS - correction), at(EXPIRES_AT, -HOUR_MS)).access).toEqual({ mode: 'full', reason: 'entitled' });
    // The clock corrected back across the end: judged at the mark, the grace has begun.
    expect(offline(at(EXPIRES_AT, 1 - correction), at(EXPIRES_AT, 1)).access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    // The clock corrected back across the grace end: judged at the mark, the grace is over.
    expect(offline(at(GRACE_END, -correction), GRACE_END).access).toEqual({ mode: 'read-only', reason: 'grace-elapsed' });
  });

  it('the deadlines are the proof’s, unmoved', () => {
    const correction = CLOCK_ROLLBACK_TOLERANCE_MS;
    expect(offline(at(EXPIRES_AT, -HOUR_MS - correction), at(EXPIRES_AT, -HOUR_MS)).deadline).toEqual(EXPIRES_AT);
    expect(offline(at(EXPIRES_AT, 1 - correction), at(EXPIRES_AT, 1)).deadline).toEqual(GRACE_END);
    expect(offline(at(GRACE_END, -correction), GRACE_END).deadline).toBeUndefined();
  });
});

describe('resolveBusinessAccess — a significant rollback', () => {
  const rollback = CLOCK_ROLLBACK_TOLERANCE_MS + 1;

  it('inside the paid period at the mark: the entitlement stays usable until its trusted end', () => {
    const mark = at(EXPIRES_AT, -DAY_MS);
    const { access, deadline } = offline(at(mark, -rollback), mark);
    expect(access).toEqual({ mode: 'full', reason: 'entitled' });
    expect(deadline).toEqual(EXPIRES_AT);
    // Set back by weeks: the same, as long as the mark is inside the period.
    expect(offline(at(mark, -20 * DAY_MS), mark).access).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('the mark past the end: no grace — read-only as unreliable evidence, never full', () => {
    const inGrace = at(EXPIRES_AT, HOUR_MS);
    expect(offline(at(inGrace, -rollback), inGrace).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
    // Set back INTO the paid period while the mark is in the grace: still refused — the clock is not trusted.
    expect(offline(at(EXPIRES_AT, -DAY_MS), inGrace).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
    // Set back after the grace elapsed: refused, and nothing could have been won back anyway.
    expect(offline(at(EXPIRES_AT, -DAY_MS), at(GRACE_END, DAY_MS)).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
  });

  it('a cancelled subscription past its end stays expired — its reason is not "unreliable"', () => {
    const mark = at(EXPIRES_AT, HOUR_MS);
    expect(offline(at(mark, -rollback), mark, { kind: 'cancelled-active', plan: 'annual', expiresAt: EXPIRES_AT }).access).toEqual({ mode: 'read-only', reason: 'subscription-expired' });
    // Before its end at the mark: still entitled, like any entitlement.
    expect(offline(at(EXPIRES_AT, -2 * DAY_MS), at(EXPIRES_AT, -DAY_MS), { kind: 'cancelled-active', plan: 'annual', expiresAt: EXPIRES_AT }).access).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('an indefinite complimentary access is unaffected: no end, nothing to win back, nothing refused', () => {
    expect(offline(at(VERIFIED_AT, DAY_MS), at(VERIFIED_AT, 400 * DAY_MS), { kind: 'complimentary' }).access).toEqual({ mode: 'full', reason: 'entitled' });
    expect(offline(at(VERIFIED_AT, DAY_MS), at(VERIFIED_AT, 400 * DAY_MS), { kind: 'complimentary' }).deadline).toBeUndefined();
    // A dated grant follows the same policy as any entitlement.
    expect(offline(at(EXPIRES_AT, -DAY_MS), at(EXPIRES_AT, HOUR_MS), { kind: 'complimentary', expiresAt: EXPIRES_AT }).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
  });

  it('a clock behind the proof’s own verification is unreliable evidence, as before — whatever the mark', () => {
    expect(offline(at(VERIFIED_AT, -1), at(EXPIRES_AT, -DAY_MS)).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
    expect(offline(at(VERIFIED_AT, -1), at(EXPIRES_AT, -DAY_MS)).deadline).toBeUndefined();
    expect(offline(at(VERIFIED_AT, -1), undefined).access).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
  });

  it('no proof means no grace, mark or not', () => {
    expect(offline(at(EXPIRES_AT, HOUR_MS), at(EXPIRES_AT, DAY_MS), undefined, { lastVerifiedEntitlement: undefined }).access).toEqual({ mode: 'read-only', reason: 'no-entitlement-evidence' });
  });

  it('the refused grace announces the instant the clock catches up with the mark, then the ordinary deadlines resume', () => {
    const mark = at(EXPIRES_AT, HOUR_MS);
    const now = at(mark, -DAY_MS);
    const { deadline } = offline(now, mark);
    expect(deadline).toEqual(at(mark, -CLOCK_ROLLBACK_TOLERANCE_MS));
    expect(deadline!.getTime()).toBeGreaterThan(now.getTime());
    // Reached: no longer rolled back, judged at the mark — inside the grace, which then ends at its own instant.
    const caughtUp = offline(deadline!, mark);
    expect(caughtUp.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    expect(caughtUp.deadline).toEqual(GRACE_END);
    // Once the grace is elapsed at the mark, nothing time alone can change: no deadline.
    expect(offline(at(GRACE_END, -DAY_MS), at(GRACE_END, 1)).deadline).toEqual(at(GRACE_END, 1 - CLOCK_ROLLBACK_TOLERANCE_MS));
    expect(offline(at(GRACE_END, 1 - CLOCK_ROLLBACK_TOLERANCE_MS), at(GRACE_END, 1)).access).toEqual({ mode: 'read-only', reason: 'grace-elapsed' });
    expect(offline(at(GRACE_END, 1 - CLOCK_ROLLBACK_TOLERANCE_MS), at(GRACE_END, 1)).deadline).toBeUndefined();
  });
});

describe('resolveBusinessAccess — a verification is never judged against the mark', () => {
  it('a fresh store answer stands on its own instant: the store just agreed on the time', () => {
    const mark = at(EXPIRES_AT, 10 * DAY_MS);
    const now = at(EXPIRES_AT, -DAY_MS);
    const renewed: BusinessAccessInput = {
      now,
      enforcement: 'enabled',
      verification: { kind: 'verified', status: { kind: 'active', plan: 'monthly', expiresAt: at(EXPIRES_AT, 30 * DAY_MS) } },
      lastVerifiedEntitlement: proof(),
      observedUntil: mark,
    };
    expect(resolveBusinessAccess(renewed)).toEqual({ mode: 'full', reason: 'entitled' });
    expect(nextBusinessAccessDeadline(renewed)).toEqual(at(EXPIRES_AT, 30 * DAY_MS));
    // A confirmed end is confirmed, mark or not.
    expect(resolveBusinessAccess({ ...renewed, verification: { kind: 'verified', status: { kind: 'expired' } } })).toEqual({ mode: 'read-only', reason: 'subscription-expired' });
    // Enforcement disabled: full, whatever the clock did.
    expect(resolveBusinessAccess({ ...renewed, enforcement: 'disabled', verification: { kind: 'unavailable' } })).toEqual({ mode: 'full', reason: 'enforcement-disabled' });
    expect(nextBusinessAccessDeadline({ ...renewed, enforcement: 'disabled', verification: { kind: 'unavailable' } })).toBeUndefined();
  });
});
