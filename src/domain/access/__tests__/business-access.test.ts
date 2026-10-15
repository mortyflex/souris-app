// BeautIzzy — Business access resolution (BeautIzzy Plus)
//
// Every confirmed subscription state, the offline policy (a proof holds until
// its expiration, then 72 hours of grace from THAT instant, then read-only),
// the enforcement-disabled safety, the cancelled subscription that gets no
// grace, and the evidence rule that keeps the grace deadline from ever
// moving. Explicit instants only: no clock, no network.

import {
  OFFLINE_ACCESS_GRACE_PERIOD_HOURS,
  OFFLINE_ACCESS_GRACE_PERIOD_MS,
  canMutateBusinessData,
  isReliableEntitlementEvidence,
  resolveBusinessAccess,
  updateEntitlementEvidence,
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

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

const ENTITLEMENTS: readonly SubscriptionEntitlement[] = [
  { kind: 'active', plan: 'monthly', expiresAt: FUTURE },
  { kind: 'active', plan: 'annual', expiresAt: FUTURE },
  { kind: 'trial', plan: 'monthly', expiresAt: FUTURE },
  { kind: 'cancelled-active', plan: 'annual', expiresAt: FUTURE },
  { kind: 'complimentary', expiresAt: FUTURE },
  { kind: 'complimentary' },
];

const EVERY_STATUS: readonly SubscriptionStatus[] = [
  ...ENTITLEMENTS,
  { kind: 'expired' },
  { kind: 'never' },
];

function evidence(overrides: Partial<EntitlementEvidence> = {}): EntitlementEvidence {
  return {
    verifiedAt: VERIFIED_AT,
    entitlement: { kind: 'active', plan: 'monthly', expiresAt: FUTURE },
    ...overrides,
  };
}

function resolve(overrides: Partial<BusinessAccessInput> = {}) {
  return resolveBusinessAccess({
    now: NOW,
    enforcement: 'enabled',
    verification: UNAVAILABLE,
    ...overrides,
  });
}

describe('Business access — confirmed subscription status', () => {
  it('grants full access to an active monthly subscription', () => {
    expect(
      resolve({ verification: verified({ kind: 'active', plan: 'monthly', expiresAt: FUTURE }) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('grants full access to an active annual subscription', () => {
    expect(
      resolve({ verification: verified({ kind: 'active', plan: 'annual', expiresAt: FUTURE }) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('grants full access during the free trial', () => {
    expect(
      resolve({ verification: verified({ kind: 'trial', plan: 'annual', expiresAt: FUTURE }) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('keeps a cancelled subscription fully usable until it actually expires', () => {
    const status: SubscriptionStatus = { kind: 'cancelled-active', plan: 'monthly', expiresAt: FUTURE };
    expect(resolve({ verification: verified(status) })).toEqual({ mode: 'full', reason: 'entitled' });
    expect(
      resolve({ verification: verified(status), now: new Date(FUTURE.getTime() - 1) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('grants full access to a complimentary pilot entitlement, with or without an end date', () => {
    expect(resolve({ verification: verified({ kind: 'complimentary' }) })).toEqual({
      mode: 'full',
      reason: 'entitled',
    });
    expect(
      resolve({ verification: verified({ kind: 'complimentary', expiresAt: FUTURE }) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('makes a confirmed expired subscription read-only', () => {
    expect(resolve({ verification: verified({ kind: 'expired' }) })).toEqual({
      mode: 'read-only',
      reason: 'subscription-expired',
    });
  });

  it('makes a professional who never subscribed read-only', () => {
    expect(resolve({ verification: verified({ kind: 'never' }) })).toEqual({
      mode: 'read-only',
      reason: 'never-subscribed',
    });
  });

  it('lets a confirmed expiration override any previous active evidence', () => {
    expect(
      resolve({
        verification: verified({ kind: 'expired' }),
        lastVerifiedEntitlement: evidence({ verifiedAt: hoursAfter(NOW, -1) }),
      }),
    ).toEqual({ mode: 'read-only', reason: 'subscription-expired' });
    expect(
      resolve({
        verification: verified({ kind: 'never' }),
        lastVerifiedEntitlement: evidence(),
      }),
    ).toEqual({ mode: 'read-only', reason: 'never-subscribed' });
  });

  it('restores full access at once when a verification confirms an entitlement', () => {
    const elapsed = evidence({
      verifiedAt: hoursAfter(PAST, -24 * 30),
      entitlement: { kind: 'active', plan: 'monthly', expiresAt: PAST },
    });
    expect(resolve({ lastVerifiedEntitlement: elapsed })).toEqual({
      mode: 'read-only',
      reason: 'grace-elapsed',
    });
    expect(
      resolve({
        verification: verified({ kind: 'active', plan: 'monthly', expiresAt: FUTURE }),
        lastVerifiedEntitlement: elapsed,
      }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('never grants a confirmed entitlement with an invalid expiration', () => {
    expect(
      resolve({
        verification: verified({ kind: 'active', plan: 'monthly', expiresAt: new Date(NaN) }),
      }),
    ).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
  });

  it('reads a freshly verified entitlement already expired as contradictory, never as grace', () => {
    for (const kind of ['active', 'trial', 'cancelled-active'] as const) {
      for (const expiresAt of [NOW, hoursAfter(NOW, -1), hoursAfter(NOW, -24 * 30)]) {
        expect(resolve({ verification: verified({ kind, plan: 'monthly', expiresAt }) })).toEqual({
          mode: 'read-only',
          reason: 'unreliable-evidence',
        });
      }
    }
    expect(
      resolve({ verification: verified({ kind: 'complimentary', expiresAt: hoursAfter(NOW, -1) }) }),
    ).toEqual({ mode: 'read-only', reason: 'unreliable-evidence' });
    expect(
      resolve({
        verification: verified({
          kind: 'active',
          plan: 'monthly',
          expiresAt: new Date(NOW.getTime() + 1),
        }),
      }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('never answers a successful verification with the offline grace', () => {
    const instants = [FUTURE, NOW, hoursAfter(NOW, -1), hoursAfter(NOW, -71), hoursAfter(NOW, -73)];
    for (const status of EVERY_STATUS) {
      const variants: SubscriptionStatus[] =
        'expiresAt' in status && status.expiresAt !== undefined
          ? instants.map((expiresAt) => ({ ...status, expiresAt }))
          : [status];
      for (const variant of variants) {
        for (const lastVerifiedEntitlement of [undefined, evidence()]) {
          const access = resolve({ verification: verified(variant), lastVerifiedEntitlement });
          expect(access.reason).not.toBe('offline-grace');
          expect(access.reason).not.toBe('grace-elapsed');
        }
      }
    }
  });
});

describe('Business access — cancelled subscription offline', () => {
  const expiresAt = PAST;
  const cancelled = evidence({
    entitlement: { kind: 'cancelled-active', plan: 'annual', expiresAt },
  });

  it('keeps full access until the known expiration', () => {
    expect(resolve({ lastVerifiedEntitlement: cancelled, now: hoursAfter(expiresAt, -24) })).toEqual({
      mode: 'full',
      reason: 'entitled',
    });
    expect(
      resolve({ lastVerifiedEntitlement: cancelled, now: new Date(expiresAt.getTime() - 1) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('becomes read-only at the exact expiration, with no offline grace', () => {
    for (const hours of [0, 1, 24, 71, 72, 73, 24 * 30]) {
      expect(resolve({ lastVerifiedEntitlement: cancelled, now: hoursAfter(expiresAt, hours) })).toEqual(
        { mode: 'read-only', reason: 'subscription-expired' },
      );
    }
  });

  it('leaves the grace of a renewable entitlement untouched', () => {
    for (const kind of ['active', 'trial'] as const) {
      const renewable = evidence({ entitlement: { kind, plan: 'annual', expiresAt } });
      expect(resolve({ lastVerifiedEntitlement: renewable, now: hoursAfter(expiresAt, 1) })).toEqual({
        mode: 'full',
        reason: 'offline-grace',
        graceEndsAt: hoursAfter(expiresAt, 72),
      });
    }
    const pilot = evidence({ entitlement: { kind: 'complimentary', expiresAt } });
    expect(resolve({ lastVerifiedEntitlement: pilot, now: hoursAfter(expiresAt, 1) })).toEqual({
      mode: 'full',
      reason: 'offline-grace',
      graceEndsAt: hoursAfter(expiresAt, 72),
    });
  });

  it('is restored to full access by a newly verified active entitlement', () => {
    const now = hoursAfter(expiresAt, 1);
    expect(
      resolve({
        verification: verified({ kind: 'active', plan: 'annual', expiresAt: FUTURE }),
        lastVerifiedEntitlement: cancelled,
        now,
      }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
    const renewed = updateEntitlementEvidence(
      cancelled,
      verified({ kind: 'active', plan: 'annual', expiresAt: FUTURE }),
      now,
    );
    expect(resolve({ lastVerifiedEntitlement: renewed, now: hoursAfter(now, 1) })).toEqual({
      mode: 'full',
      reason: 'entitled',
    });
  });
});

describe('Business access — verification unavailable', () => {
  it('defaults to read-only without any previous proof', () => {
    expect(resolve()).toEqual({ mode: 'read-only', reason: 'no-entitlement-evidence' });
    expect(resolve({ lastVerifiedEntitlement: undefined })).toEqual({
      mode: 'read-only',
      reason: 'no-entitlement-evidence',
    });
  });

  it('keeps full access while the proven entitlement is still within its valid period', () => {
    expect(resolve({ lastVerifiedEntitlement: evidence() })).toEqual({
      mode: 'full',
      reason: 'entitled',
    });
    expect(
      resolve({ lastVerifiedEntitlement: evidence(), now: new Date(FUTURE.getTime() - 1) }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });

  it('keeps full access for every proven entitlement kind', () => {
    for (const entitlement of ENTITLEMENTS) {
      expect(resolve({ lastVerifiedEntitlement: evidence({ entitlement }) })).toEqual({
        mode: 'full',
        reason: 'entitled',
      });
    }
  });

  it('opens the offline grace the instant the proven entitlement expires', () => {
    const expiresAt = NOW;
    expect(
      resolve({
        lastVerifiedEntitlement: evidence({
          entitlement: { kind: 'active', plan: 'monthly', expiresAt },
        }),
      }),
    ).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: hoursAfter(expiresAt, 72) });
  });

  it('keeps full access within the 72-hour grace period', () => {
    const expiresAt = PAST;
    const proof = evidence({ entitlement: { kind: 'trial', plan: 'annual', expiresAt } });
    for (const hours of [1, 24, 48, 71]) {
      expect(resolve({ lastVerifiedEntitlement: proof, now: hoursAfter(expiresAt, hours) })).toEqual({
        mode: 'full',
        reason: 'offline-grace',
        graceEndsAt: hoursAfter(expiresAt, 72),
      });
    }
  });

  it('ends the grace at exactly 72 hours after the expiration (end exclusive)', () => {
    const expiresAt = PAST;
    const proof = evidence({ entitlement: { kind: 'active', plan: 'annual', expiresAt } });
    const graceEndsAt = hoursAfter(expiresAt, OFFLINE_ACCESS_GRACE_PERIOD_HOURS);
    expect(
      resolve({ lastVerifiedEntitlement: proof, now: new Date(graceEndsAt.getTime() - 1) }),
    ).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt });
    expect(resolve({ lastVerifiedEntitlement: proof, now: graceEndsAt })).toEqual({
      mode: 'read-only',
      reason: 'grace-elapsed',
    });
  });

  it('becomes read-only after the grace period', () => {
    const expiresAt = PAST;
    const proof = evidence({ entitlement: { kind: 'active', plan: 'monthly', expiresAt } });
    for (const hours of [73, 24 * 7, 24 * 365]) {
      expect(resolve({ lastVerifiedEntitlement: proof, now: hoursAfter(expiresAt, hours) })).toEqual({
        mode: 'read-only',
        reason: 'grace-elapsed',
      });
    }
  });

  it('measures the grace from the expiration, never from the verification', () => {
    const expiresAt = PAST;
    const recentlyVerified = evidence({
      verifiedAt: hoursAfter(expiresAt, -1),
      entitlement: { kind: 'active', plan: 'monthly', expiresAt },
    });
    const longVerified = evidence({
      verifiedAt: hoursAfter(expiresAt, -24 * 300),
      entitlement: { kind: 'active', plan: 'monthly', expiresAt },
    });
    const now = hoursAfter(expiresAt, 72);
    expect(resolve({ lastVerifiedEntitlement: recentlyVerified, now })).toEqual({
      mode: 'read-only',
      reason: 'grace-elapsed',
    });
    expect(resolve({ lastVerifiedEntitlement: longVerified, now })).toEqual({
      mode: 'read-only',
      reason: 'grace-elapsed',
    });
  });

  it('never extends the grace through repeated failed checks', () => {
    const expiresAt = PAST;
    let proof: EntitlementEvidence | undefined = evidence({
      entitlement: { kind: 'active', plan: 'monthly', expiresAt },
    });
    const graceEndsAt = hoursAfter(expiresAt, 72);
    for (const hours of [1, 12, 36, 60, 71]) {
      const now = hoursAfter(expiresAt, hours);
      proof = updateEntitlementEvidence(proof, UNAVAILABLE, now);
      expect(resolve({ lastVerifiedEntitlement: proof, now })).toEqual({
        mode: 'full',
        reason: 'offline-grace',
        graceEndsAt,
      });
    }
    expect(resolve({ lastVerifiedEntitlement: proof, now: graceEndsAt })).toEqual({
      mode: 'read-only',
      reason: 'grace-elapsed',
    });
  });

  it('keeps a complimentary proof without an end date valid offline', () => {
    expect(
      resolve({
        lastVerifiedEntitlement: evidence({ entitlement: { kind: 'complimentary' } }),
        now: hoursAfter(NOW, 24 * 400),
      }),
    ).toEqual({ mode: 'full', reason: 'entitled' });
  });
});

describe('Business access — unreliable evidence', () => {
  it('refuses a proof with an invalid verification instant', () => {
    const proof = evidence({ verifiedAt: new Date(NaN) });
    expect(isReliableEntitlementEvidence(proof, NOW)).toBe(false);
    expect(resolve({ lastVerifiedEntitlement: proof })).toEqual({
      mode: 'read-only',
      reason: 'unreliable-evidence',
    });
  });

  it('refuses a proof with an invalid expiration', () => {
    const proof = evidence({
      entitlement: { kind: 'active', plan: 'monthly', expiresAt: new Date(NaN) },
    });
    expect(isReliableEntitlementEvidence(proof, NOW)).toBe(false);
    expect(resolve({ lastVerifiedEntitlement: proof })).toEqual({
      mode: 'read-only',
      reason: 'unreliable-evidence',
    });
  });

  it('refuses a proof whose entitlement expired before it was verified', () => {
    const contradictory = evidence({
      verifiedAt: NOW,
      entitlement: { kind: 'active', plan: 'monthly', expiresAt: PAST },
    });
    expect(isReliableEntitlementEvidence(contradictory, NOW)).toBe(false);
    expect(resolve({ lastVerifiedEntitlement: contradictory })).toEqual({
      mode: 'read-only',
      reason: 'unreliable-evidence',
    });
    const sameInstant = evidence({
      verifiedAt: PAST,
      entitlement: { kind: 'active', plan: 'monthly', expiresAt: PAST },
    });
    expect(isReliableEntitlementEvidence(sameInstant, NOW)).toBe(false);
  });

  it('refuses a proof dated in the future', () => {
    const proof = evidence({ verifiedAt: hoursAfter(NOW, 1) });
    expect(isReliableEntitlementEvidence(proof, NOW)).toBe(false);
    expect(resolve({ lastVerifiedEntitlement: proof })).toEqual({
      mode: 'read-only',
      reason: 'unreliable-evidence',
    });
    expect(isReliableEntitlementEvidence(evidence({ verifiedAt: NOW }), NOW)).toBe(true);
  });

  it('rejects an invalid current instant instead of deciding', () => {
    expect(() => resolve({ now: new Date(NaN) })).toThrow(RangeError);
    expect(() => resolve({ now: new Date(NaN), enforcement: 'disabled' })).toThrow(RangeError);
  });
});

describe('Business access — enforcement disabled', () => {
  it('keeps full access for every status, with and without evidence', () => {
    for (const status of EVERY_STATUS) {
      expect(resolve({ enforcement: 'disabled', verification: verified(status) })).toEqual({
        mode: 'full',
        reason: 'enforcement-disabled',
      });
    }
    expect(resolve({ enforcement: 'disabled' })).toEqual({
      mode: 'full',
      reason: 'enforcement-disabled',
    });
    expect(
      resolve({
        enforcement: 'disabled',
        lastVerifiedEntitlement: evidence({
          verifiedAt: NOW,
          entitlement: { kind: 'active', plan: 'monthly', expiresAt: PAST },
        }),
        now: hoursAfter(NOW, 24 * 365),
      }),
    ).toEqual({ mode: 'full', reason: 'enforcement-disabled' });
  });

  it('still resolves the real decision once enforcement is enabled', () => {
    expect(resolve({ enforcement: 'enabled', verification: verified({ kind: 'expired' }) })).toEqual({
      mode: 'read-only',
      reason: 'subscription-expired',
    });
  });
});

describe('Business mutations', () => {
  it('are allowed only with full access', () => {
    expect(canMutateBusinessData({ mode: 'full' })).toBe(true);
    expect(canMutateBusinessData({ mode: 'read-only' })).toBe(false);
    expect(canMutateBusinessData(resolve({ enforcement: 'disabled' }))).toBe(true);
    expect(canMutateBusinessData(resolve())).toBe(false);
  });
});

describe('Entitlement evidence update', () => {
  it('records a confirmed entitlement as the new proof, dated now', () => {
    for (const entitlement of ENTITLEMENTS) {
      expect(updateEntitlementEvidence(undefined, verified(entitlement), NOW)).toEqual({
        verifiedAt: NOW,
        entitlement,
      });
    }
  });

  it('replaces an older proof with the new verification', () => {
    const older = evidence({
      verifiedAt: PAST,
      entitlement: { kind: 'trial', plan: 'monthly', expiresAt: NOW },
    });
    const renewed: SubscriptionEntitlement = { kind: 'active', plan: 'monthly', expiresAt: FUTURE };
    expect(updateEntitlementEvidence(older, verified(renewed), NOW)).toEqual({
      verifiedAt: NOW,
      entitlement: renewed,
    });
  });

  it('erases the proof when the store confirms an expiration or an absence', () => {
    expect(updateEntitlementEvidence(evidence(), verified({ kind: 'expired' }), NOW)).toBeUndefined();
    expect(updateEntitlementEvidence(evidence(), verified({ kind: 'never' }), NOW)).toBeUndefined();
  });

  it('keeps the previous proof untouched when verification is unavailable', () => {
    const previous = evidence();
    expect(updateEntitlementEvidence(previous, UNAVAILABLE, NOW)).toBe(previous);
    expect(updateEntitlementEvidence(undefined, UNAVAILABLE, NOW)).toBeUndefined();
  });

  it('rejects an invalid current instant', () => {
    expect(() =>
      updateEntitlementEvidence(undefined, verified({ kind: 'complimentary' }), new Date(NaN)),
    ).toThrow(RangeError);
  });

  it('exposes the grace duration as 72 hours', () => {
    expect(OFFLINE_ACCESS_GRACE_PERIOD_HOURS).toBe(72);
    expect(OFFLINE_ACCESS_GRACE_PERIOD_MS).toBe(72 * HOUR_MS);
  });
});
