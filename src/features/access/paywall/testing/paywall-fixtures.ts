// BeautIzzy — deterministic paywall offerings for TESTS and the development
// preview — never imported by product code.
//
// The intended French-market products (monthly 12,99 €, annual 129 €, both
// with a 14-day free trial) exist here and ONLY here, as what a store adapter
// would hand the paywall. The application's own default is
// `unconfiguredPaywallOffering`: no price is ever substituted at runtime.

import type { PaywallOffering, PaywallPlanOffer, PaywallTrialPeriod } from '../paywall-offering';
import type { PaywallContext } from '../paywall-presentation';

/** The intended 14-day trial, as the App Store reports it: two weeks. */
export const FIXTURE_TRIAL_PERIOD: PaywallTrialPeriod = { unit: 'week', count: 2 };

export const fixtureMonthlyOffer: PaywallPlanOffer = {
  plan: 'monthly',
  price: { amount: 12.99, currencyCode: 'EUR' },
  freeTrial: { period: FIXTURE_TRIAL_PERIOD, eligibility: 'eligible' },
};

export const fixtureAnnualOffer: PaywallPlanOffer = {
  plan: 'annual',
  price: { amount: 129, currencyCode: 'EUR' },
  freeTrial: { period: FIXTURE_TRIAL_PERIOD, eligibility: 'eligible' },
};

function withoutTrial(offer: PaywallPlanOffer): PaywallPlanOffer {
  return { plan: offer.plan, price: offer.price };
}

function ineligibleTrial(offer: PaywallPlanOffer): PaywallPlanOffer {
  return { ...offer, freeTrial: { period: FIXTURE_TRIAL_PERIOD, eligibility: 'ineligible' } };
}

export const paywallOfferingFixtures = {
  /** Both plans, the free trial confirmed eligible. */
  frenchWithTrial: {
    status: 'available',
    plans: [fixtureMonthlyOffer, fixtureAnnualOffer],
  },
  /** Both plans, the store says this user already used the trial. */
  frenchTrialIneligible: {
    status: 'available',
    plans: [ineligibleTrial(fixtureMonthlyOffer), ineligibleTrial(fixtureAnnualOffer)],
  },
  /** Both plans, no introductory offer at all. */
  frenchNoTrial: {
    status: 'available',
    plans: [withoutTrial(fixtureMonthlyOffer), withoutTrial(fixtureAnnualOffer)],
  },
  monthlyOnly: { status: 'available', plans: [fixtureMonthlyOffer] },
  annualOnly: { status: 'available', plans: [fixtureAnnualOffer] },
  /** Another storefront: the store's own strings, another currency. */
  usDollars: {
    status: 'available',
    plans: [
      { plan: 'monthly', price: { amount: 14.99, currencyCode: 'USD', formatted: '$14.99' } },
      { plan: 'annual', price: { amount: 149.99, currencyCode: 'USD', formatted: '$149.99' } },
    ],
  },
  loading: { status: 'loading' },
  storeUnavailable: { status: 'unavailable', reason: 'store-unavailable' },
  notConfigured: { status: 'unavailable', reason: 'not-configured' },
} as const satisfies Record<string, PaywallOffering>;

export const paywallContextFixtures = {
  initialOffer: { kind: 'initial-offer' },
  expired: { kind: 'read-only', reason: 'subscription-expired' },
  neverSubscribed: { kind: 'read-only', reason: 'never-subscribed' },
  unverified: { kind: 'read-only', reason: 'grace-elapsed' },
  entitled: { kind: 'entitled' },
  verifying: { kind: 'verifying' },
} as const satisfies Record<string, PaywallContext>;

export interface PaywallPreviewScenario {
  readonly key: string;
  readonly title: string;
  readonly context: PaywallContext;
  readonly offering: PaywallOffering;
}

/** The scenarios of the development preview, in the order they are listed. */
export const paywallPreviewScenarios: readonly PaywallPreviewScenario[] = [
  {
    key: 'initial-trial',
    title: 'Première offre — essai éligible',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.frenchWithTrial,
  },
  {
    key: 'initial-no-trial',
    title: 'Première offre — sans essai',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.frenchTrialIneligible,
  },
  {
    key: 'expired',
    title: 'Abonnement expiré',
    context: paywallContextFixtures.expired,
    offering: paywallOfferingFixtures.frenchNoTrial,
  },
  {
    key: 'never',
    title: 'Jamais abonné',
    context: paywallContextFixtures.neverSubscribed,
    offering: paywallOfferingFixtures.frenchWithTrial,
  },
  {
    key: 'unverified',
    title: 'Abonnement non vérifié',
    context: paywallContextFixtures.unverified,
    offering: paywallOfferingFixtures.storeUnavailable,
  },
  {
    key: 'entitled',
    title: 'Abonnement actif',
    context: paywallContextFixtures.entitled,
    offering: paywallOfferingFixtures.frenchWithTrial,
  },
  {
    key: 'verifying',
    title: 'Vérification en cours',
    context: paywallContextFixtures.verifying,
    offering: paywallOfferingFixtures.loading,
  },
  {
    key: 'loading',
    title: 'Offres en chargement',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.loading,
  },
  {
    key: 'not-configured',
    title: 'Offres non configurées',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.notConfigured,
  },
  {
    key: 'monthly-only',
    title: 'Mensuel seul',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.monthlyOnly,
  },
  {
    key: 'annual-only',
    title: 'Annuel seul',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.annualOnly,
  },
  {
    key: 'usd',
    title: 'Devise étrangère (USD)',
    context: paywallContextFixtures.initialOffer,
    offering: paywallOfferingFixtures.usDollars,
  },
];
