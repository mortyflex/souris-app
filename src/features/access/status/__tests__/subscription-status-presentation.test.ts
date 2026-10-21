// BeautIzzy — what « Mon abonnement » says, from the verification only: the
// badge for a verified entitlement, the plan when established, accurate date
// wording, nothing invented, nothing claimed while pending or unavailable,
// and never a conclusion drawn from the access mode.

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';

import {
  SUBSCRIPTION_CANCELLED_DETAIL,
  SUBSCRIPTION_EVERYTHING_AVAILABLE,
  SUBSCRIPTION_PENDING_DETAIL,
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_COMPLIMENTARY,
  SUBSCRIPTION_STATUS_NONE,
  SUBSCRIPTION_STATUS_PENDING,
  SUBSCRIPTION_STATUS_TRIAL,
  SUBSCRIPTION_STATUS_UNAVAILABLE,
  SUBSCRIPTION_UNAVAILABLE_DETAIL,
  describeSubscriptionStatus,
  formatSubscriptionDate,
  hasVerifiedPlusEntitlement,
} from '../subscription-status-presentation';
import { STATUS_FIXTURE_END, STATUS_FIXTURE_FAR_END, STATUS_FIXTURE_NOW, subscriptionStatusScenarios } from '../testing/subscription-status-fixtures';

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });

const describeAt = (verification: SubscriptionVerification | undefined, enforcement: 'enabled' | 'disabled' = 'disabled') =>
  describeSubscriptionStatus({ verification, now: STATUS_FIXTURE_NOW, enforcement });

const END = formatSubscriptionDate(STATUS_FIXTURE_END);
const FAR_END = formatSubscriptionDate(STATUS_FIXTURE_FAR_END);

describe('formatSubscriptionDate', () => {
  it('writes the day, the long French month and the year', () => {
    expect(END).toMatch(/^21 novembre 2026$/);
    expect(FAR_END).toMatch(/^21 octobre 2027$/);
  });
});

describe('describeSubscriptionStatus — verified entitlements show the badge', () => {
  it('active monthly: the badge, the plan, the end of the current period — no renewal promised', () => {
    const model = describeAt(verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }));
    expect(model).toEqual({
      tone: 'plus',
      plus: true,
      title: SUBSCRIPTION_STATUS_ACTIVE,
      plan: 'Mensuel',
      details: [`Période en cours jusqu’au ${END}.`],
      accessibilityLabel: `BeautIzzy Plus, ${SUBSCRIPTION_STATUS_ACTIVE}, Mensuel, Période en cours jusqu’au ${END}.`,
    });
    expect(JSON.stringify(model)).not.toMatch(/renouvel|prélèvement|paiement/i);
  });

  it('active annual: the annual plan', () => {
    const model = describeAt(verified({ kind: 'active', plan: 'annual', expiresAt: STATUS_FIXTURE_FAR_END }));
    expect(model).toMatchObject({ plus: true, title: SUBSCRIPTION_STATUS_ACTIVE, plan: 'Annuel', details: [`Période en cours jusqu’au ${FAR_END}.`] });
  });

  it('an unknown plan (a Test Store product) writes no plan at all', () => {
    const model = describeAt(verified({ kind: 'active', plan: 'unknown', expiresAt: STATUS_FIXTURE_END }));
    expect(model.plus).toBe(true);
    expect(model.plan).toBeUndefined();
    expect(model.accessibilityLabel).toBe(`BeautIzzy Plus, ${SUBSCRIPTION_STATUS_ACTIVE}, Période en cours jusqu’au ${END}.`);
  });

  it('trial: « Essai gratuit » and the verified end of the trial', () => {
    const model = describeAt(verified({ kind: 'trial', plan: 'annual', expiresAt: STATUS_FIXTURE_END }));
    expect(model).toMatchObject({ plus: true, title: SUBSCRIPTION_STATUS_TRIAL, plan: 'Annuel', details: [`Fin de l’essai le ${END}.`] });
  });

  it('cancelled but still active: « Actif jusqu’au … », no renewal claimed', () => {
    const model = describeAt(verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }));
    expect(model).toMatchObject({ plus: true, title: `Actif jusqu’au ${END}`, plan: 'Mensuel', details: [SUBSCRIPTION_CANCELLED_DETAIL] });
    expect(model.title).not.toMatch(/renouvel/i);
  });

  it('complimentary without an end: « Accès offert », no date invented, no billing implied', () => {
    const model = describeAt(verified({ kind: 'complimentary' }));
    expect(model).toEqual({
      tone: 'plus',
      plus: true,
      title: SUBSCRIPTION_STATUS_COMPLIMENTARY,
      details: [],
      accessibilityLabel: `BeautIzzy Plus, ${SUBSCRIPTION_STATUS_COMPLIMENTARY}`,
    });
    expect(JSON.stringify(model)).not.toMatch(/jusqu|factur|paiement|mensuel|annuel/i);
  });

  it('complimentary with an end: the end, neutrally worded', () => {
    const model = describeAt(verified({ kind: 'complimentary', expiresAt: STATUS_FIXTURE_FAR_END }));
    expect(model).toMatchObject({ plus: true, title: SUBSCRIPTION_STATUS_COMPLIMENTARY, details: [`Jusqu’au ${FAR_END}.`] });
    expect(model.plan).toBeUndefined();
  });

  it('a verified entitlement whose end is behind now has lapsed: unverified, never active, never expired', () => {
    const lapsed = verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END });
    const model = describeSubscriptionStatus({ verification: lapsed, now: new Date(STATUS_FIXTURE_END.getTime() + 1), enforcement: 'disabled' });
    expect(model).toMatchObject({ tone: 'pending', plus: false, title: SUBSCRIPTION_STATUS_UNAVAILABLE });
    expect(model.accessibilityLabel).not.toContain('BeautIzzy Plus,');
  });
});

describe('describeSubscriptionStatus — no entitlement, no badge', () => {
  it('expired: no badge, the policy’s own sentence, and — enforcement disabled — that everything stays available', () => {
    const model = describeAt(verified({ kind: 'expired' }));
    expect(model).toEqual({
      tone: 'none',
      plus: false,
      title: SUBSCRIPTION_STATUS_NONE,
      details: ['Votre abonnement BeautIzzy Plus n’est plus actif.', SUBSCRIPTION_EVERYTHING_AVAILABLE],
      accessibilityLabel: `${SUBSCRIPTION_STATUS_NONE}, Votre abonnement BeautIzzy Plus n’est plus actif., ${SUBSCRIPTION_EVERYTHING_AVAILABLE}`,
    });
  });

  it('never subscribed: no badge, never told its subscription expired, nothing blocked', () => {
    const model = describeAt(verified({ kind: 'never' }));
    expect(model).toMatchObject({
      tone: 'none',
      plus: false,
      title: SUBSCRIPTION_STATUS_NONE,
      details: ['Votre compte n’a pas d’abonnement BeautIzzy Plus.', SUBSCRIPTION_EVERYTHING_AVAILABLE],
    });
    expect(JSON.stringify(model)).not.toMatch(/expir|bloqu|lecture seule|gratuit|free/i);
  });

  it('with enforcement enabled the availability line is not claimed', () => {
    expect(describeAt(verified({ kind: 'never' }), 'enabled').details).toEqual(['Votre compte n’a pas d’abonnement BeautIzzy Plus.']);
    expect(describeAt(verified({ kind: 'expired' }), 'enabled').details).toEqual(['Votre abonnement BeautIzzy Plus n’est plus actif.']);
  });
});

describe('describeSubscriptionStatus — nothing confirmed', () => {
  it('pending: a neutral verification state, no claim either way', () => {
    const model = describeAt(undefined);
    expect(model).toEqual({
      tone: 'pending',
      plus: false,
      title: SUBSCRIPTION_STATUS_PENDING,
      details: [SUBSCRIPTION_PENDING_DETAIL],
      accessibilityLabel: `${SUBSCRIPTION_STATUS_PENDING}, ${SUBSCRIPTION_PENDING_DETAIL}`,
    });
    expect(JSON.stringify(model)).not.toMatch(/aucun abonnement|expir|gratuit/i);
  });

  it('unavailable: unverified — never "free", never expired, never active', () => {
    const model = describeAt({ kind: 'unavailable' });
    expect(model).toMatchObject({ tone: 'pending', plus: false, title: SUBSCRIPTION_STATUS_UNAVAILABLE, details: [SUBSCRIPTION_UNAVAILABLE_DETAIL] });
    expect(JSON.stringify(model)).not.toMatch(/aucun abonnement|expir|gratuit|actif/i);
  });

  it('takes no access mode and no mutation permission: full access proves nothing', () => {
    // The signature itself admits only the verification: there is no way to pass `canMutate` or an access result.
    const input = { verification: { kind: 'unavailable' } as const, now: STATUS_FIXTURE_NOW, enforcement: 'disabled' as const };
    expect(Object.keys(input).sort()).toEqual(['enforcement', 'now', 'verification']);
    expect(describeSubscriptionStatus(input).plus).toBe(false);
  });
});

describe('the development fixtures cover every status once', () => {
  it('lists each kind exactly once, plus the pending and unavailable states', () => {
    const kinds = subscriptionStatusScenarios.map((scenario) =>
      scenario.verification === undefined
        ? 'pending'
        : scenario.verification.kind === 'unavailable'
          ? 'unavailable'
          : `${scenario.verification.status.kind}${'plan' in scenario.verification.status ? `:${scenario.verification.status.plan}` : ''}${'expiresAt' in scenario.verification.status && scenario.verification.status.expiresAt ? ':dated' : ''}`,
    );
    expect(kinds).toEqual([
      'active:monthly:dated',
      'active:annual:dated',
      'active:unknown:dated',
      'trial:annual:dated',
      'cancelled-active:monthly:dated',
      'complimentary',
      'complimentary:dated',
      'expired',
      'never',
      'unavailable',
      'pending',
    ]);
    const badges = subscriptionStatusScenarios.map((scenario) => describeAt(scenario.verification).plus);
    expect(badges).toEqual([true, true, true, true, true, true, true, false, false, false, false]);
  });
});

describe('hasVerifiedPlusEntitlement — THE rule of every « Plus » cue', () => {
  it('is true for a verified entitlement in force: active, trial, cancelled-active, complimentary', () => {
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'active', plan: 'annual', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'active', plan: 'unknown', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'trial', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'cancelled-active', plan: 'annual', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'complimentary' }), STATUS_FIXTURE_NOW)).toBe(true);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'complimentary', expiresAt: STATUS_FIXTURE_FAR_END }), STATUS_FIXTURE_NOW)).toBe(true);
  });

  it('is false for never, expired, unavailable, pending and a lapsed entitlement', () => {
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'never' }), STATUS_FIXTURE_NOW)).toBe(false);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'expired' }), STATUS_FIXTURE_NOW)).toBe(false);
    expect(hasVerifiedPlusEntitlement({ kind: 'unavailable' }, STATUS_FIXTURE_NOW)).toBe(false);
    expect(hasVerifiedPlusEntitlement(undefined, STATUS_FIXTURE_NOW)).toBe(false);
    const lapsed = verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END });
    expect(hasVerifiedPlusEntitlement(lapsed, STATUS_FIXTURE_END)).toBe(false);
    expect(hasVerifiedPlusEntitlement(verified({ kind: 'complimentary', expiresAt: STATUS_FIXTURE_END }), STATUS_FIXTURE_FAR_END)).toBe(false);
  });

  it('agrees with the badge decision of « Mon abonnement » on every fixture', () => {
    for (const scenario of subscriptionStatusScenarios) {
      expect(hasVerifiedPlusEntitlement(scenario.verification, STATUS_FIXTURE_NOW)).toBe(describeAt(scenario.verification).plus);
    }
  });
});
