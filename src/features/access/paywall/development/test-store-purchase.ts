// BeautIzzy — may the development test bench start a transaction? — pure
//
// THE guard of the ONLY purchase entry point of the application, the
// development preview's « Offre RevenueCat actuelle », and of its restore
// link. Every condition must hold, and each refusal has its own developer-
// facing sentence (shown in the preview's alert, never logged):
//
//   * a development bundle (`__DEV__`), passed in by the caller so the rule
//     stays testable;
//   * a TESTABLE store, read from the source's own `store` and its own
//     `appleSandbox` — never inferred from APP_VARIANT or a key:
//       - RevenueCat's TEST STORE (Phase 6.3): a simulated purchase, no money;
//       - the APP STORE in APPLE SANDBOX MODE (Phase 6.4B): a debug bundle
//         bound to the App Store, the real Apple purchase sheet, for the dedicated
//         test accounts declared for the mode ONLY. The App Store without the
//         mode — a release — is never testable here; the preview does not
//         exist there anyway;
//   * an authenticated account, which — in Apple Sandbox mode — must be one of
//     the dedicated test accounts (`dedicatedTestAccount`, from THE
//     authorization rule through the checkout hook); a professional's or a
//     pilot's account meets a read-only paywall;
//   * (purchase) the store's own offering (it carries the adapter's
//     `reference`; a fixture never does, so a fixture scenario can never reach
//     a purchase);
//   * (purchase) the chosen plan is one that offering sells;
//   * no transaction or verification in progress.
//
// The provider applies THE authorization rule again (`purchase-authorization.ts`),
// with the live platform and compilation: this guard refuses early and explains;
// it authorizes nothing by itself. RevenueCat's server-side sandbox allowlist
// stays an additional restriction: nothing here names an account.

import type { SubscriptionPlan } from '@/domain/access';

import type { PlusCheckoutActivity } from '../../session/use-plus-checkout';
import type { SubscriptionStoreKind } from '../../subscription-source';
import type { PaywallOffering } from '../paywall-offering';

export interface TestRestoreConditions {
  readonly development: boolean;
  readonly store: SubscriptionStoreKind | undefined;
  /** The source is a debug bundle bound to the App Store (Apple Sandbox mode). */
  readonly appleSandbox: boolean;
  readonly authenticated: boolean;
  /** Apple Sandbox mode AND the signed-in account is one of its dedicated test accounts. */
  readonly dedicatedTestAccount: boolean;
  readonly activity: PlusCheckoutActivity | undefined;
}

export interface TestPurchaseConditions extends TestRestoreConditions {
  readonly offering: PaywallOffering;
  readonly plan: SubscriptionPlan;
}

export type TestRestoreRefusal =
  | 'not-development'
  | 'store-not-testable'
  | 'not-authenticated'
  | 'not-test-account'
  | 'operation-in-progress';

export type TestPurchaseRefusal = TestRestoreRefusal | 'no-store-offering' | 'plan-not-offered';

const STORE_NOT_TESTABLE =
  'cette version est liée à l’App Store sans le mode Apple Sandbox (APP_VARIANT=apple-sandbox), ou à aucun magasin.';
const NOT_TEST_ACCOUNT =
  'Apple Sandbox : le compte connecté n’est pas déclaré comme compte de test dédié (EXPO_PUBLIC_REVENUECAT_APPLE_SANDBOX_TEST_ACCOUNTS). Lecture seule.';

export const TEST_PURCHASE_REFUSALS: Readonly<Record<TestPurchaseRefusal, string>> = {
  'not-development': 'Achat de test réservé aux bundles de développement.',
  'store-not-testable': `Achat de test réservé au RevenueCat Test Store ou au mode Apple Sandbox : ${STORE_NOT_TESTABLE} Aucun achat.`,
  'not-authenticated': 'Connectez-vous pour tester un achat.',
  'not-test-account': `${NOT_TEST_ACCOUNT} Aucun achat.`,
  'no-store-offering': 'Aucune offre RevenueCat chargée : seul un achat sur l’offre réelle est possible, jamais sur une offre fictive.',
  'plan-not-offered': 'Cette formule n’est pas proposée par l’offre RevenueCat actuelle.',
  'operation-in-progress': 'Une opération est déjà en cours.',
};

export const TEST_RESTORE_REFUSALS: Readonly<Record<TestRestoreRefusal, string>> = {
  'not-development': 'Restauration de test réservée aux bundles de développement.',
  'store-not-testable': `Restauration de test réservée au RevenueCat Test Store ou au mode Apple Sandbox : ${STORE_NOT_TESTABLE} Aucune restauration.`,
  'not-authenticated': 'Connectez-vous pour tester une restauration.',
  'not-test-account': `${NOT_TEST_ACCOUNT} Aucune restauration.`,
  'operation-in-progress': 'Une opération est déjà en cours.',
};

/** Whether the source is one the bench may transact against at all: the Test Store, or the App Store in Apple Sandbox mode. */
export function isTestableStore(store: SubscriptionStoreKind | undefined, appleSandbox: boolean): boolean {
  return store === 'test-store' || (store === 'app-store' && appleSandbox);
}

/** The reason the test restore is refused, or undefined when every condition holds. */
export function resolveTestRestoreRefusal(conditions: TestRestoreConditions): TestRestoreRefusal | undefined {
  if (!conditions.development) return 'not-development';
  if (!isTestableStore(conditions.store, conditions.appleSandbox)) return 'store-not-testable';
  if (!conditions.authenticated) return 'not-authenticated';
  if (conditions.store === 'app-store' && !conditions.dedicatedTestAccount) return 'not-test-account';
  if (conditions.activity !== undefined) return 'operation-in-progress';
  return undefined;
}

/** The reason the test purchase is refused, or undefined when every condition holds. */
export function resolveTestPurchaseRefusal(conditions: TestPurchaseConditions): TestPurchaseRefusal | undefined {
  if (!conditions.development) return 'not-development';
  if (!isTestableStore(conditions.store, conditions.appleSandbox)) return 'store-not-testable';
  if (!conditions.authenticated) return 'not-authenticated';
  if (conditions.store === 'app-store' && !conditions.dedicatedTestAccount) return 'not-test-account';
  if (conditions.offering.status !== 'available' || conditions.offering.reference === undefined) return 'no-store-offering';
  if (!conditions.offering.plans.some((offer) => offer.plan === conditions.plan)) return 'plan-not-offered';
  if (conditions.activity !== undefined) return 'operation-in-progress';
  return undefined;
}
