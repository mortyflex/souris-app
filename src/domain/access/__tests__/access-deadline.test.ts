// BeautIzzy — when business access changes by time alone (BeautIzzy Plus)
//
// Every deadline announced here is checked against the resolver itself: the
// answer is the same one instant before the deadline and different from the
// deadline on — and nothing changes between now and the deadline. Explicit
// instants only: no clock, no timer.

import {
  OFFLINE_ACCESS_GRACE_PERIOD_HOURS,
  OFFLINE_ACCESS_GRACE_PERIOD_MS,
  isVerificationCurrent,
  nextBusinessAccessDeadline,
  resolveBusinessAccess,
  type BusinessAccessInput,
  type EntitlementEvidence,
  type SubscriptionEntitlement,
  type SubscriptionStatus,
  type SubscriptionVerification,
} from '..';

const HOUR_MS = 60 * 60 * 1000;

const NOW = new Date('2026-10-15T09:00:00.000Z');
const PAST = new Date('2026-10-01T09:00:00.000Z');
const VERIFIED_AT = new Date('2026-09-20T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');

const hoursAfter = (instant: Date, hours: number) => new Date(instant.getTime() + hours * HOUR_MS);
const msBefore = (instant: Date) => new Date(instant.getTime() - 1);

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

const RENEWABLE: readonly SubscriptionEntitlement[] = [
  { kind: 'active', plan: 'monthly', expiresAt: FUTURE },
  { kind: 'active', plan: 'annual', expiresAt: FUTURE },
  { kind: 'trial', plan: 'monthly', expiresAt: FUTURE },
  { kind: 'complimentary', expiresAt: FUTURE },
];
const CANCELLED: SubscriptionEntitlement = { kind: 'cancelled-active', plan: 'annual', expiresAt: FUTURE };
const INDEFINITE: SubscriptionEntitlement = { kind: 'complimentary' };

function evidence(overrides: Partial<EntitlementEvidence> = {}): EntitlementEvidence {
  return {
    verifiedAt: VERIFIED_AT,
    entitlement: { kind: 'active', plan: 'monthly', expiresAt: FUTURE },
    ...overrides,
  };
}

function input(overrides: Partial<BusinessAccessInput> = {}): BusinessAccessInput {
  return { now: NOW, enforcement: 'enabled', verification: UNAVAILABLE, ...overrides };
}

/** The resolver's answer is constant on [now, deadline) and different at the deadline. */
function expectDeadlineToBeTheNextChange(base: BusinessAccessInput, deadline: Date) {
  const before = resolveBusinessAccess(base);
  // A lapsed verification is what the application feeds back: `unavailable` + the proof.
  const at = (now: Date): BusinessAccessInput =>
    isVerificationCurrent(base.verification, now) ? { ...base, now } : { ...base, now, verification: UNAVAILABLE };
  expect(resolveBusinessAccess(at(msBefore(deadline)))).toEqual(before);
  expect(resolveBusinessAccess(at(deadline))).not.toEqual(before);
}

describe('isVerificationCurrent', () => {
  it('keeps a confirmed end, an absence and an unavailable answer standing forever', () => {
    for (const verification of [verified({ kind: 'expired' }), verified({ kind: 'never' }), UNAVAILABLE]) {
      expect(isVerificationCurrent(verification, NOW)).toBe(true);
      expect(isVerificationCurrent(verification, new Date('2099-01-01T00:00:00.000Z'))).toBe(true);
    }
  });

  it('keeps an entitlement standing strictly before its end, and lapses it from the end on', () => {
    for (const entitlement of [...RENEWABLE, CANCELLED]) {
      expect(isVerificationCurrent(verified(entitlement), msBefore(FUTURE))).toBe(true);
      expect(isVerificationCurrent(verified(entitlement), FUTURE)).toBe(false);
      expect(isVerificationCurrent(verified(entitlement), hoursAfter(FUTURE, 1))).toBe(false);
    }
  });

  it('never lapses an indefinite complimentary access', () => {
    expect(isVerificationCurrent(verified(INDEFINITE), new Date('2099-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('lapses an entitlement whose end is not an instant', () => {
    expect(
      isVerificationCurrent(verified({ kind: 'active', plan: 'monthly', expiresAt: new Date(NaN) }), NOW),
    ).toBe(false);
  });

  it('rejects an invalid current instant', () => {
    expect(() => isVerificationCurrent(UNAVAILABLE, new Date(NaN))).toThrow(RangeError);
  });
});

describe('nextBusinessAccessDeadline — nothing pending', () => {
  it('announces nothing while enforcement is disabled, whatever the input', () => {
    for (const verification of [...RENEWABLE.map(verified), verified(CANCELLED), verified({ kind: 'expired' }), UNAVAILABLE]) {
      expect(
        nextBusinessAccessDeadline(input({ enforcement: 'disabled', verification, lastVerifiedEntitlement: evidence() })),
      ).toBeUndefined();
    }
  });

  it('announces nothing after a confirmed end or absence', () => {
    expect(nextBusinessAccessDeadline(input({ verification: verified({ kind: 'expired' }) }))).toBeUndefined();
    expect(nextBusinessAccessDeadline(input({ verification: verified({ kind: 'never' }) }))).toBeUndefined();
  });

  it('announces nothing for an indefinite complimentary access, verified or proven', () => {
    expect(nextBusinessAccessDeadline(input({ verification: verified(INDEFINITE) }))).toBeUndefined();
    expect(
      nextBusinessAccessDeadline(input({ lastVerifiedEntitlement: evidence({ entitlement: INDEFINITE }) })),
    ).toBeUndefined();
  });

  it('announces nothing without a proof, or with an unreliable one', () => {
    expect(nextBusinessAccessDeadline(input())).toBeUndefined();
    expect(
      nextBusinessAccessDeadline(input({ lastVerifiedEntitlement: evidence({ verifiedAt: hoursAfter(NOW, 1) }) })),
    ).toBeUndefined();
    expect(
      nextBusinessAccessDeadline(
        input({ lastVerifiedEntitlement: evidence({ entitlement: { kind: 'active', plan: 'monthly', expiresAt: new Date(NaN) } }) }),
      ),
    ).toBeUndefined();
  });

  it('announces nothing for a freshly verified entitlement already past its end', () => {
    expect(
      nextBusinessAccessDeadline(input({ verification: verified({ kind: 'active', plan: 'monthly', expiresAt: PAST }) })),
    ).toBeUndefined();
    expect(
      nextBusinessAccessDeadline(input({ verification: verified({ kind: 'active', plan: 'monthly', expiresAt: NOW }) })),
    ).toBeUndefined();
  });

  it('announces nothing for a cancelled subscription past its end: no grace will follow', () => {
    const cancelled = evidence({ entitlement: { kind: 'cancelled-active', plan: 'monthly', expiresAt: PAST } });
    expect(nextBusinessAccessDeadline(input({ lastVerifiedEntitlement: cancelled }))).toBeUndefined();
    expect(nextBusinessAccessDeadline(input({ now: PAST, lastVerifiedEntitlement: cancelled }))).toBeUndefined();
  });

  it('announces nothing once the grace elapsed', () => {
    const proof = evidence({ entitlement: { kind: 'active', plan: 'monthly', expiresAt: PAST } });
    const graceEnd = hoursAfter(PAST, OFFLINE_ACCESS_GRACE_PERIOD_HOURS);
    expect(nextBusinessAccessDeadline(input({ now: graceEnd, lastVerifiedEntitlement: proof }))).toBeUndefined();
    expect(nextBusinessAccessDeadline(input({ now: hoursAfter(graceEnd, 1), lastVerifiedEntitlement: proof }))).toBeUndefined();
  });

  it('rejects an invalid current instant', () => {
    expect(() => nextBusinessAccessDeadline(input({ now: new Date(NaN) }))).toThrow(RangeError);
  });
});

describe('nextBusinessAccessDeadline — the entitlement in force ends', () => {
  it('announces the end of every freshly verified entitlement, and the resolver changes there', () => {
    for (const entitlement of [...RENEWABLE, CANCELLED]) {
      const base = input({ verification: verified(entitlement), lastVerifiedEntitlement: { verifiedAt: NOW, entitlement } });
      const deadline = nextBusinessAccessDeadline(base);
      expect(deadline).toEqual(FUTURE);
      expectDeadlineToBeTheNextChange(base, deadline as Date);
    }
  });

  it('announces the end of a proven entitlement while verification is unavailable', () => {
    for (const entitlement of [...RENEWABLE, CANCELLED]) {
      const base = input({ lastVerifiedEntitlement: evidence({ entitlement }) });
      const deadline = nextBusinessAccessDeadline(base);
      expect(deadline).toEqual(FUTURE);
      expectDeadlineToBeTheNextChange(base, deadline as Date);
    }
  });

  it('returns a fresh Date, never the proof’s own instance', () => {
    const base = input({ lastVerifiedEntitlement: evidence() });
    expect(nextBusinessAccessDeadline(base)).not.toBe(FUTURE);
  });
});

describe('nextBusinessAccessDeadline — the offline grace ends', () => {
  it('announces the 72-hour grace end after the end of a renewable proof, and the resolver changes there', () => {
    for (const entitlement of RENEWABLE) {
      const ended = { ...entitlement, expiresAt: PAST };
      const base = input({ now: hoursAfter(PAST, 1), lastVerifiedEntitlement: evidence({ entitlement: ended }) });
      const deadline = nextBusinessAccessDeadline(base);
      expect(deadline).toEqual(new Date(PAST.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS));
      expectDeadlineToBeTheNextChange(base, deadline as Date);
    }
  });

  it('announces the same grace end from any instant inside the grace: asking again never moves it', () => {
    const proof = evidence({ entitlement: { kind: 'trial', plan: 'monthly', expiresAt: PAST } });
    const graceEnd = hoursAfter(PAST, OFFLINE_ACCESS_GRACE_PERIOD_HOURS);
    for (const hours of [0, 1, 24, 71]) {
      expect(nextBusinessAccessDeadline(input({ now: hoursAfter(PAST, hours), lastVerifiedEntitlement: proof }))).toEqual(
        graceEnd,
      );
    }
  });

  it('chains: the end of the entitlement, then the end of the grace, then nothing', () => {
    const proof = evidence();
    const first = nextBusinessAccessDeadline(input({ lastVerifiedEntitlement: proof })) as Date;
    expect(first).toEqual(FUTURE);
    const second = nextBusinessAccessDeadline(input({ now: first, lastVerifiedEntitlement: proof })) as Date;
    expect(second).toEqual(hoursAfter(FUTURE, OFFLINE_ACCESS_GRACE_PERIOD_HOURS));
    expect(nextBusinessAccessDeadline(input({ now: second, lastVerifiedEntitlement: proof }))).toBeUndefined();
  });
});
