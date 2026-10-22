// BeautIzzy — may the development test bench start a Test Store purchase? — pure
//
// THE guard of the ONLY purchase entry point of Phase 6.3, the development
// preview's « Offre RevenueCat actuelle ». Every condition must hold, and
// each refusal has its own developer-facing sentence (shown in the preview's
// alert, never logged):
//
//   * a development bundle (`__DEV__`), passed in by the caller so the rule
//     stays testable;
//   * the source is bound to RevenueCat's TEST STORE — explicitly, from the
//     source's own `store`, never inferred from APP_VARIANT or a key;
//   * an authenticated account;
//   * the store's own offering (it carries the adapter's `reference`; a
//     fixture never does, so a fixture scenario can never reach a purchase);
//   * the chosen plan is one that offering sells;
//   * no transaction or verification in progress.
//
// RevenueCat's server-side sandbox allowlist stays the primary account
// restriction: nothing here names an account.

import type { SubscriptionPlan } from '@/domain/access';

import type { PlusCheckoutActivity } from '../../session/use-plus-checkout';
import type { SubscriptionStoreKind } from '../../subscription-source';
import type { PaywallOffering } from '../paywall-offering';

export interface TestPurchaseConditions {
  readonly development: boolean;
  readonly store: SubscriptionStoreKind | undefined;
  readonly authenticated: boolean;
  readonly offering: PaywallOffering;
  readonly plan: SubscriptionPlan;
  readonly activity: PlusCheckoutActivity | undefined;
}

export type TestPurchaseRefusal =
  | 'not-development'
  | 'not-test-store'
  | 'not-authenticated'
  | 'no-store-offering'
  | 'plan-not-offered'
  | 'operation-in-progress';

export const TEST_PURCHASE_REFUSALS: Readonly<Record<TestPurchaseRefusal, string>> = {
  'not-development': 'Achat de test réservé aux bundles de développement.',
  'not-test-store': 'Achat de test réservé au RevenueCat Test Store : cette version est liée à un autre magasin.',
  'not-authenticated': 'Connectez-vous pour tester un achat.',
  'no-store-offering': 'Aucune offre RevenueCat chargée : seul un achat sur l’offre réelle est possible, jamais sur une offre fictive.',
  'plan-not-offered': 'Cette formule n’est pas proposée par l’offre RevenueCat actuelle.',
  'operation-in-progress': 'Une opération est déjà en cours.',
};

/** The reason the test purchase is refused, or undefined when every condition holds. */
export function resolveTestPurchaseRefusal(conditions: TestPurchaseConditions): TestPurchaseRefusal | undefined {
  if (!conditions.development) return 'not-development';
  if (conditions.store !== 'test-store') return 'not-test-store';
  if (!conditions.authenticated) return 'not-authenticated';
  if (conditions.offering.status !== 'available' || conditions.offering.reference === undefined) return 'no-store-offering';
  if (!conditions.offering.plans.some((offer) => offer.plan === conditions.plan)) return 'plan-not-offered';
  if (conditions.activity !== undefined) return 'operation-in-progress';
  return undefined;
}
