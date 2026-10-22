// BeautIzzy — paywall presentation rules (BeautIzzy Plus, Phase 5)
//
// Store-derived plans only: formatting from the offering, the annual plan
// preselected and recommended when both are offered, savings only when they
// are real and comparable, a trial only when the store confirmed
// eligibility, invalid or missing offers dropped, no action without a valid
// plan and a purchase entry point.

import {
  PAYWALL_BENEFITS,
  PAYWALL_HEADLINE,
  PAYWALL_RETURN_TITLE,
  PAYWALL_EXPLORE_TITLE,
  PLUS_BRAND_NAME,
} from '../paywall-copy';
import {
  noAccountPaywallOffering,
  unconfiguredPaywallOffering,
  type PaywallOffering,
  type PaywallPlanOffer,
  type PaywallTrialPeriod,
} from '../paywall-offering';
import {
  buildPaywallPlans,
  describePaywallContext,
  formatFreeTrial,
  formatPaywallPrice,
  formatTrialPeriod,
  isRetryablePaywallReason,
  isValidPlanOffer,
  resolveAnnualSavingsPercent,
  resolvePaywallAction,
  resolvePaywallIllustrationSide,
  resolveSelectedPaywallPlan,
} from '../paywall-presentation';
import {
  fixtureAnnualOffer,
  fixtureMonthlyOffer,
  paywallContextFixtures,
  paywallOfferingFixtures,
} from '../testing/paywall-fixtures';

/** fr-FR uses a narrow no-break space before € and a no-break group separator. */
const plain = (value: string | undefined) => value?.replace(/[\u202F\u00A0]/g, ' ');

const available = (...plans: PaywallPlanOffer[]): PaywallOffering => ({ status: 'available', plans });

function cards(offering: PaywallOffering) {
  const plans = buildPaywallPlans(offering);
  if (plans.status !== 'available') throw new Error(`expected available plans, got ${plans.status}`);
  return plans;
}

describe('approved copy', () => {
  it('names BeautIzzy Plus, the approved headline and the three approved benefits', () => {
    expect(PLUS_BRAND_NAME).toBe('BeautIzzy Plus');
    expect(PAYWALL_HEADLINE).toBe('Faites grandir votre activité, simplement.');
    expect([...PAYWALL_BENEFITS]).toEqual([
      'Tout votre quotidien au même endroit.',
      'Gardez le contrôle sur vos chiffres.',
      'Gagnez du temps chaque jour.',
    ]);
    expect(PAYWALL_EXPLORE_TITLE).toBe('Explorer sans abonnement');
  });
});

describe('price formatting', () => {
  it('formats the store amount for the locale and currency, cents only when there are some', () => {
    expect(plain(formatPaywallPrice({ amount: 12.99, currencyCode: 'EUR' }, 'fr-FR'))).toBe('12,99 €');
    expect(plain(formatPaywallPrice({ amount: 129, currencyCode: 'EUR' }, 'fr-FR'))).toBe('129 €');
    expect(formatPaywallPrice({ amount: 14.99, currencyCode: 'USD' }, 'en-US')).toBe('$14.99');
    expect(plain(formatPaywallPrice({ amount: 12.9, currencyCode: 'CHF' }, 'fr-CH'))).toBe('12.90 CHF');
  });

  it('prefers the string the store itself formatted', () => {
    expect(formatPaywallPrice({ amount: 14.99, currencyCode: 'USD', formatted: '$14.99' }, 'fr-FR')).toBe('$14.99');
  });
});

describe('plan validity', () => {
  it.each([
    ['a zero amount', { ...fixtureMonthlyOffer, price: { amount: 0, currencyCode: 'EUR' } }],
    ['a negative amount', { ...fixtureMonthlyOffer, price: { amount: -5, currencyCode: 'EUR' } }],
    ['a NaN amount', { ...fixtureMonthlyOffer, price: { amount: Number.NaN, currencyCode: 'EUR' } }],
    ['an infinite amount', { ...fixtureMonthlyOffer, price: { amount: Number.POSITIVE_INFINITY, currencyCode: 'EUR' } }],
    ['an empty currency', { ...fixtureMonthlyOffer, price: { amount: 12.99, currencyCode: '' } }],
    ['a malformed currency', { ...fixtureMonthlyOffer, price: { amount: 12.99, currencyCode: 'euro' } }],
    ['a zero-length trial', { ...fixtureMonthlyOffer, freeTrial: { period: { unit: 'day' as const, count: 0 }, eligibility: 'eligible' as const } }],
    ['a fractional trial', { ...fixtureMonthlyOffer, freeTrial: { period: { unit: 'day' as const, count: 1.5 }, eligibility: 'eligible' as const } }],
    ['a trial in an unknown unit', { ...fixtureMonthlyOffer, freeTrial: { period: { unit: 'hour' as unknown as 'day', count: 3 }, eligibility: 'eligible' as const } }],
  ])('rejects an offer with %s', (_label, offer) => {
    expect(isValidPlanOffer(offer)).toBe(false);
    expect(buildPaywallPlans(available(offer))).toEqual({ status: 'unavailable', reason: 'no-valid-plan' });
  });

  it('keeps the valid plan when the other one is invalid, without a recommendation', () => {
    const plans = cards(available(fixtureAnnualOffer, { ...fixtureMonthlyOffer, price: { amount: 0, currencyCode: 'EUR' } }));
    expect(plans.cards.map((card) => card.plan)).toEqual(['annual']);
    expect(plans.cards[0]!.recommended).toBe(false);
    expect(plans.cards[0]!.savings).toBeUndefined();
  });

  it('keeps the first offer of a plan when the store repeats it', () => {
    const plans = cards(available(fixtureMonthlyOffer, { ...fixtureMonthlyOffer, price: { amount: 99, currencyCode: 'EUR' } }));
    expect(plans.cards).toHaveLength(1);
    expect(plain(plans.cards[0]!.price)).toBe('12,99 €');
  });
});

describe('plans', () => {
  it('maps the offering, annual first, the annual plan preselected and recommended when both are offered', () => {
    const plans = cards(paywallOfferingFixtures.frenchWithTrial);
    expect(plans.defaultPlan).toBe('annual');
    expect(plans.cards.map((card) => card.plan)).toEqual(['annual', 'monthly']);
    const [annual, monthly] = plans.cards;
    expect(annual).toMatchObject({
      title: 'Annuel',
      period: 'par an',
      recommended: true,
      trial: '14 jours gratuits',
      trialPeriod: { unit: 'week', count: 2 },
    });
    expect(plain(annual!.price)).toBe('129 €');
    expect(plain(annual!.equivalent)).toBe('soit 10,75 € par mois');
    expect(annual!.savings).toBe('Économisez 17 %');
    expect(monthly).toMatchObject({ title: 'Mensuel', period: 'par mois', recommended: false, trial: '14 jours gratuits' });
    expect(plain(monthly!.price)).toBe('12,99 €');
    expect(monthly!.equivalent).toBeUndefined();
    expect(monthly!.savings).toBeUndefined();
  });

  it('speaks every store-derived fact of a card, the recommendation last', () => {
    const [annual, monthly] = cards(paywallOfferingFixtures.frenchWithTrial).cards;
    expect(plain(annual!.accessibilityLabel)).toBe(
      'Formule annuelle, 129 € par an, soit 10,75 € par mois, Économisez 17 %, 14 jours gratuits, recommandée',
    );
    expect(plain(monthly!.accessibilityLabel)).toBe('Formule mensuelle, 12,99 € par mois, 14 jours gratuits');
  });

  it('shows no trial when the store says ineligible or unknown, or offers none', () => {
    for (const offering of [paywallOfferingFixtures.frenchTrialIneligible, paywallOfferingFixtures.frenchNoTrial]) {
      for (const card of cards(offering).cards) {
        expect(card.trial).toBeUndefined();
        expect(card.trialPeriod).toBeUndefined();
        expect(card.accessibilityLabel).not.toContain('gratuit');
      }
    }
    const unknown = cards(available({ ...fixtureAnnualOffer, freeTrial: { period: { unit: 'week', count: 2 }, eligibility: 'unknown' } }));
    expect(unknown.cards[0]!.trial).toBeUndefined();
  });

  it('shows a trial for an eligible offer only, plan by plan', () => {
    const plans = cards(
      available(fixtureMonthlyOffer, { ...fixtureAnnualOffer, freeTrial: { period: { unit: 'day', count: 7 }, eligibility: 'ineligible' } }),
    );
    expect(plans.cards.find((card) => card.plan === 'annual')!.trial).toBeUndefined();
    expect(plans.cards.find((card) => card.plan === 'monthly')!.trial).toBe('14 jours gratuits');
  });

  it('offers one plan alone, preselected, with neither recommendation nor savings', () => {
    const monthly = cards(paywallOfferingFixtures.monthlyOnly);
    expect(monthly.defaultPlan).toBe('monthly');
    expect(monthly.cards).toHaveLength(1);
    expect(monthly.cards[0]).toMatchObject({ plan: 'monthly', recommended: false });
    expect(monthly.cards[0]!.savings).toBeUndefined();

    const annual = cards(paywallOfferingFixtures.annualOnly);
    expect(annual.defaultPlan).toBe('annual');
    expect(annual.cards[0]).toMatchObject({ plan: 'annual', recommended: false });
    expect(annual.cards[0]!.savings).toBeUndefined();
    expect(plain(annual.cards[0]!.equivalent)).toBe('soit 10,75 € par mois');
  });

  it('formats another currency with the store strings and compares savings in it', () => {
    const plans = cards(paywallOfferingFixtures.usDollars);
    expect(plans.cards.map((card) => card.price)).toEqual(['$149.99', '$14.99']);
    expect(plans.cards[0]!.savings).toBe('Économisez 17 %');
    expect(plain(plans.cards[0]!.equivalent)).toBe('soit 12,50 $US par mois');
  });

  it('passes the offering states through: loading, store unavailable, not configured', () => {
    expect(buildPaywallPlans(paywallOfferingFixtures.loading)).toEqual({ status: 'loading' });
    expect(buildPaywallPlans(paywallOfferingFixtures.storeUnavailable)).toEqual({ status: 'unavailable', reason: 'store-unavailable' });
    expect(buildPaywallPlans(unconfiguredPaywallOffering)).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(buildPaywallPlans(noAccountPaywallOffering)).toEqual({ status: 'unavailable', reason: 'no-account' });
    expect(buildPaywallPlans(available())).toEqual({ status: 'unavailable', reason: 'no-valid-plan' });
  });

  it('asking the store again only helps when a store and an account exist', () => {
    expect(isRetryablePaywallReason('store-unavailable')).toBe(true);
    expect(isRetryablePaywallReason('no-valid-plan')).toBe(true);
    expect(isRetryablePaywallReason('not-configured')).toBe(false);
    expect(isRetryablePaywallReason('no-account')).toBe(false);
  });
});

describe('trial period wording — the store defines the length, never the app', () => {
  const trial = (period: PaywallTrialPeriod): PaywallPlanOffer => ({
    ...fixtureAnnualOffer,
    freeTrial: { period, eligibility: 'eligible' },
  });

  it.each<[PaywallTrialPeriod, string, string]>([
    [{ unit: 'day', count: 1 }, '1 jour', '1 jour gratuit'],
    [{ unit: 'day', count: 3 }, '3 jours', '3 jours gratuits'],
    [{ unit: 'week', count: 1 }, '7 jours', '7 jours gratuits'],
    [{ unit: 'week', count: 2 }, '14 jours', '14 jours gratuits'],
    [{ unit: 'month', count: 1 }, '1 mois', '1 mois gratuit'],
    [{ unit: 'month', count: 3 }, '3 mois', '3 mois gratuits'],
    [{ unit: 'year', count: 1 }, '1 an', '1 an gratuit'],
    [{ unit: 'year', count: 2 }, '2 ans', '2 ans gratuits'],
  ])('says %j as « %s » and « %s »', (period, duration, chip) => {
    expect(formatTrialPeriod(period)).toBe(duration);
    expect(formatFreeTrial(period)).toBe(chip);
    const plans = cards(available(trial(period)));
    expect(plans.cards[0]).toMatchObject({ trial: chip, trialPeriod: period });
    expect(resolvePaywallAction(plans, 'annual', true)).toMatchObject({
      kind: 'subscribe',
      title: `Essayer gratuitement ${duration}`,
    });
  });

  it('never writes a trial length of its own: the chip and the action follow the period they are given', () => {
    const plans = cards(available(trial({ unit: 'month', count: 1 })));
    expect(JSON.stringify(plans)).not.toContain('14');
    expect(resolvePaywallAction(plans, 'annual', true)).toMatchObject({ title: 'Essayer gratuitement 1 mois' });
  });
});

describe('annual savings', () => {
  const eur = (amount: number) => ({ amount, currencyCode: 'EUR' });

  it('is the whole percentage saved over twelve monthly payments', () => {
    expect(resolveAnnualSavingsPercent(eur(12.99), eur(129))).toBe(17);
    expect(resolveAnnualSavingsPercent(eur(10), eur(60))).toBe(50);
  });

  it('is absent when the plans are not comparable or the annual plan saves nothing', () => {
    expect(resolveAnnualSavingsPercent(eur(12.99), { amount: 129, currencyCode: 'USD' })).toBeUndefined();
    expect(resolveAnnualSavingsPercent(eur(10), eur(120))).toBeUndefined();
    expect(resolveAnnualSavingsPercent(eur(10), eur(130))).toBeUndefined();
    expect(resolveAnnualSavingsPercent(eur(10), eur(119.5))).toBeUndefined();
    expect(resolveAnnualSavingsPercent(eur(0), eur(100))).toBeUndefined();
  });

  it('never appears on a card when the annual plan is not cheaper', () => {
    const plans = cards(available(fixtureMonthlyOffer, { ...fixtureAnnualOffer, price: eur(160) }));
    const annual = plans.cards.find((card) => card.plan === 'annual')!;
    expect(annual.savings).toBeUndefined();
    expect(annual.recommended).toBe(true);
    expect(annual.accessibilityLabel).not.toContain('Économisez');
  });
});

describe('selection', () => {
  it('keeps a requested plan that is offered and falls back to the default otherwise', () => {
    const both = buildPaywallPlans(paywallOfferingFixtures.frenchWithTrial);
    expect(resolveSelectedPaywallPlan(both, undefined)).toBe('annual');
    expect(resolveSelectedPaywallPlan(both, 'monthly')).toBe('monthly');
    const annualOnly = buildPaywallPlans(paywallOfferingFixtures.annualOnly);
    expect(resolveSelectedPaywallPlan(annualOnly, 'monthly')).toBe('annual');
    expect(resolveSelectedPaywallPlan(buildPaywallPlans(paywallOfferingFixtures.loading), 'annual')).toBeUndefined();
    expect(resolveSelectedPaywallPlan(buildPaywallPlans(unconfiguredPaywallOffering), 'annual')).toBeUndefined();
  });
});

describe('primary action', () => {
  it('offers the eligible trial, then the selected plan price', () => {
    const plans = buildPaywallPlans(paywallOfferingFixtures.frenchWithTrial);
    const annual = resolvePaywallAction(plans, 'annual', true);
    expect(annual.kind).toBe('subscribe');
    expect(annual).toMatchObject({ plan: 'annual', title: 'Essayer gratuitement 14 jours' });
    expect(plain((annual as { footnote: string }).footnote)).toBe('Puis 129 € par an.');

    const monthly = resolvePaywallAction(plans, 'monthly', true);
    expect(monthly).toMatchObject({ kind: 'subscribe', plan: 'monthly', title: 'Essayer gratuitement 14 jours' });
    expect(plain((monthly as { footnote: string }).footnote)).toBe('Puis 12,99 € par mois.');
  });

  it('subscribes without a trial claim when the store confirmed none', () => {
    const plans = buildPaywallPlans(paywallOfferingFixtures.frenchTrialIneligible);
    const action = resolvePaywallAction(plans, 'annual', true);
    expect(action).toMatchObject({ kind: 'subscribe', plan: 'annual', title: 'S’abonner à BeautIzzy Plus' });
    expect(plain((action as { footnote: string }).footnote)).toBe('129 € par an.');
    expect(JSON.stringify(action)).not.toContain('gratuit');
  });

  it('is disabled and says so without a purchase entry point', () => {
    const plans = buildPaywallPlans(paywallOfferingFixtures.frenchWithTrial);
    expect(resolvePaywallAction(plans, 'annual', false)).toEqual({
      kind: 'not-configured',
      title: 'S’abonner à BeautIzzy Plus',
      footnote: 'Achat non disponible dans cette version.',
    });
  });

  it('cannot be initiated while loading, with an unavailable offering, or without a valid selection', () => {
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.loading), 'annual', true)).toEqual({
      kind: 'loading',
      title: 'Chargement des offres…',
    });
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.storeUnavailable), 'annual', true)).toEqual({ kind: 'none' });
    expect(resolvePaywallAction(buildPaywallPlans(unconfiguredPaywallOffering), 'annual', true)).toEqual({ kind: 'none' });
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.annualOnly), 'monthly', true)).toEqual({ kind: 'none' });
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.frenchWithTrial), undefined, true)).toEqual({ kind: 'none' });
  });
});

describe('contexts', () => {
  it('the initial offer sells and lets the professional explore in read-only', () => {
    const model = describePaywallContext(paywallContextFixtures.initialOffer);
    expect(model.title).toBe(PAYWALL_HEADLINE);
    expect(model.showsOffer).toBe(true);
    expect(model.showsBenefits).toBe(true);
    expect(model.notice).toBeUndefined();
    expect(model.lead).toBe('Votre espace est prêt. Profitez pleinement de BeautIzzy Plus.');
    expect(model.secondaryAction).toEqual({
      kind: 'explore',
      title: PAYWALL_EXPLORE_TITLE,
      accessibilityLabel: 'Explorer sans abonnement, en lecture seule',
      caption: 'Sans abonnement, vous pouvez consulter votre activité, sans la modifier.',
    });
  });

  it('an expired subscription says the data is kept, that the subscription ended, and lets the professional return', () => {
    const model = describePaywallContext(paywallContextFixtures.expired);
    expect(model.showsOffer).toBe(true);
    expect(model.notice).toEqual({
      tone: 'reassuring',
      title: 'Vos données sont conservées.',
      lines: [
        'Votre abonnement BeautIzzy Plus n’est plus actif.',
        'Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres. Les modifications nécessitent BeautIzzy Plus.',
      ],
    });
    expect(model.secondaryAction).toEqual({ kind: 'return', title: PAYWALL_RETURN_TITLE });
  });

  it('a never-subscribed account is never told its subscription expired', () => {
    const model = describePaywallContext(paywallContextFixtures.neverSubscribed);
    expect(model.notice!.lines[0]).toBe('Votre compte n’a pas d’abonnement BeautIzzy Plus.');
    expect(JSON.stringify(model)).not.toMatch(/plus actif|expir/i);
    expect(model.notice!.lines).not.toEqual(describePaywallContext(paywallContextFixtures.expired).notice!.lines);
  });

  it('an unverified subscription is neither declared expired nor blamed on a payment', () => {
    for (const reason of ['grace-elapsed', 'no-entitlement-evidence', 'unreliable-evidence'] as const) {
      const model = describePaywallContext({ kind: 'read-only', reason });
      expect(JSON.stringify(model)).not.toMatch(/plus actif|expir|paiement|refus/i);
      expect(model.notice!.lines[0]).toMatch(/n’a pas pu être vérifié/);
    }
  });

  it('an active subscriber gets no plans, no upsell and a way to continue', () => {
    const model = describePaywallContext(paywallContextFixtures.entitled);
    expect(model.showsOffer).toBe(false);
    expect(model.showsBenefits).toBe(false);
    expect(model.title).toBe('Votre abonnement BeautIzzy Plus est actif.');
    expect(model.secondaryAction).toEqual({ kind: 'continue', title: 'Continuer' });
  });

  it('a pending verification claims neither a subscription nor its absence, and never blocks', () => {
    const model = describePaywallContext(paywallContextFixtures.verifying);
    expect(model.showsOffer).toBe(false);
    expect(model.notice).toEqual({
      tone: 'pending',
      title: 'Vérification de votre abonnement…',
      lines: ['Un instant, nous vérifions votre abonnement BeautIzzy Plus.'],
    });
    expect(JSON.stringify(model)).not.toMatch(/plus actif|expir|pas d’abonnement/i);
    expect(model.secondaryAction).toEqual({ kind: 'continue', title: 'Continuer' });
  });
});

describe('illustration side', () => {
  it('is a present accent of about 12.7 % of the window, bounded per class of phone', () => {
    expect(resolvePaywallIllustrationSide(667)).toBe(85); // iPhone SE
    expect(resolvePaywallIllustrationSide(600)).toBe(80); // never smaller on a small phone
    expect(resolvePaywallIllustrationSide(700)).toBe(89); // the last small height
    expect(resolvePaywallIllustrationSide(812)).toBe(103); // iPhone 13 mini
    expect(resolvePaywallIllustrationSide(852)).toBe(108); // iPhone 17
    expect(resolvePaywallIllustrationSide(874)).toBe(111); // iPhone 17 Pro
    expect(resolvePaywallIllustrationSide(932)).toBe(116); // Plus / Pro Max: capped
    expect(resolvePaywallIllustrationSide(701)).toBe(100); // never smaller on a regular phone
    expect(resolvePaywallIllustrationSide(1200)).toBe(116); // a tablet-sized window never inflates it
  });

  it('stays an accent on every height: never above 116 pt, never under 80 pt', () => {
    for (const height of [568, 667, 736, 812, 852, 874, 932, 956, 1024, 1366]) {
      expect(resolvePaywallIllustrationSide(height)).toBeLessThanOrEqual(116);
      expect(resolvePaywallIllustrationSide(height)).toBeGreaterThanOrEqual(80);
    }
  });

  it('on an iPhone 17 sits between the former 15 % hero and the over-reduced 10.5 % accent', () => {
    const side = resolvePaywallIllustrationSide(852);
    expect(side).toBeGreaterThanOrEqual(108);
    expect(side).toBeLessThanOrEqual(115);
    expect(side).toBeLessThan(Math.round(852 * 0.15));
  });
});

describe('primary action — a transaction or a verification in progress (Phase 6.3)', () => {
  const plans = buildPaywallPlans(paywallOfferingFixtures.frenchWithTrial);

  it.each([
    ['purchasing', 'Achat en cours…'],
    ['restoring', 'Restauration en cours…'],
    ['verifying', 'Vérification de l’abonnement…'],
  ] as const)('%s disables the action and names it, whatever the plan and the trial', (activity, title) => {
    expect(resolvePaywallAction(plans, 'annual', true, activity)).toEqual({ kind: 'in-progress', activity, title });
    expect(resolvePaywallAction(plans, 'monthly', true, activity)).toEqual({ kind: 'in-progress', activity, title });
    // Even without a purchase entry point: the activity speaks first.
    expect(resolvePaywallAction(plans, 'annual', false, activity)).toEqual({ kind: 'in-progress', activity, title });
  });

  it('changes nothing while the offering loads or is unavailable, and nothing without an activity', () => {
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.loading), 'annual', true, 'purchasing')).toEqual({
      kind: 'loading',
      title: 'Chargement des offres…',
    });
    expect(resolvePaywallAction(buildPaywallPlans(paywallOfferingFixtures.storeUnavailable), 'annual', true, 'purchasing')).toEqual({ kind: 'none' });
    expect(resolvePaywallAction(plans, 'annual', true, undefined)).toMatchObject({ kind: 'subscribe', plan: 'annual' });
  });
});
