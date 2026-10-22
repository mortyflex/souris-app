// BeautIzzy — the ONE binding to the RevenueCat SDK (react-native-purchases)
//
// The only module that imports `react-native-purchases`. It exposes the
// narrow, process-global surface the subscription source needs — identity,
// CustomerInfo, its update event, the offerings with the introductory-offer
// eligibility (Phase 6.2) and, since Phase 6.3, the two store transactions:
// the purchase of a PACKAGE the SDK itself returned (`purchasePackage`: the
// SDK sends the package identifier and its presented-offering context to the
// native layer, so only an original package can be bought) and the user-
// initiated restore (`restorePurchases`). Behind an interface tests implement
// with a deterministic fake. Nothing here syncs, and no purchase by product,
// by subscription option or with a discount is bound.
//
// `Purchases.configure` throws when the native module is absent (a
// development build that predates the SDK, Expo Go): the source turns that
// into "unavailable", never into a crash. `logOut` is deliberately absent: it
// would create an anonymous RevenueCat identity, which this identified-only
// integration never does (see subscription-source.ts).

import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type IntroEligibility,
  type LogInResult,
  type MakePurchaseResult,
  type PurchasesIntroPrice,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

export type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  IntroEligibility,
  LogInResult,
  MakePurchaseResult,
  PurchasesIntroPrice,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
};
// The SDK's own enumerations, re-exported so the pure mappings compare
// documented members and never a magic number or a bare string.
export { INTRO_ELIGIBILITY_STATUS, PACKAGE_TYPE, PURCHASES_ERROR_CODE };

/** The eligibility of the identified user for each product's introductory offer, keyed by product identifier. */
export type IntroEligibilityByProduct = Readonly<Record<string, IntroEligibility>>;

export interface RevenueCatIdentifiedConfiguration {
  readonly apiKey: string;
  /** The authenticated Supabase user id. The SDK is never configured without one. */
  readonly appUserID: string;
}

export interface RevenueCatSdk {
  /** Configures the process-global SDK, once, with an identified user. Throws when the native module is absent. */
  configure(configuration: RevenueCatIdentifiedConfiguration): void;
  /** Switches the SDK to another identified user; rejects offline. */
  logIn(appUserID: string): Promise<LogInResult>;
  /** The identity the SDK currently holds. Local, no network. */
  getAppUserID(): Promise<string>;
  /** The SDK's CustomerInfo: its cache when fresh, a fetch otherwise; rejects when nothing can be obtained. */
  getCustomerInfo(): Promise<CustomerInfo>;
  /** Drops the cached CustomerInfo so the next read fetches from the store. */
  invalidateCustomerInfoCache(): Promise<void>;
  addCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void;
  removeCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): boolean;
  /** The offerings configured in the dashboard for the identified user, with their store products; rejects when the store cannot answer. */
  getOfferings(): Promise<PurchasesOfferings>;
  /**
   * Whether the identified user may take the introductory offer of each
   * product. Best-effort: the SDK answers UNKNOWN when it cannot tell (always
   * on Android), and the store's purchase sheet decides in the end.
   */
  checkTrialOrIntroductoryPriceEligibility(productIdentifiers: readonly string[]): Promise<IntroEligibilityByProduct>;
  /**
   * Buys a package the SDK returned in an offering: the store's purchase
   * sheet, then the CustomerInfo the store answered. Rejects with the SDK's
   * `PurchasesError` shape (a numeric `code` string) on cancellation,
   * deferral and every failure — see purchase-error.ts.
   */
  purchasePackage(pkg: PurchasesPackage): Promise<MakePurchaseResult>;
  /** Asks the store for the identified user's previous purchases; resolves with the CustomerInfo the store answered. */
  restorePurchases(): Promise<CustomerInfo>;
}

export const expoRevenueCatSdk: RevenueCatSdk = {
  configure: ({ apiKey, appUserID }) => Purchases.configure({ apiKey, appUserID }),
  logIn: (appUserID) => Purchases.logIn(appUserID),
  getAppUserID: () => Purchases.getAppUserID(),
  getCustomerInfo: () => Purchases.getCustomerInfo(),
  invalidateCustomerInfoCache: () => Purchases.invalidateCustomerInfoCache(),
  addCustomerInfoUpdateListener: (listener) => Purchases.addCustomerInfoUpdateListener(listener),
  removeCustomerInfoUpdateListener: (listener) => Purchases.removeCustomerInfoUpdateListener(listener),
  getOfferings: () => Purchases.getOfferings(),
  checkTrialOrIntroductoryPriceEligibility: (productIdentifiers) =>
    Purchases.checkTrialOrIntroductoryPriceEligibility([...productIdentifiers]),
  purchasePackage: (pkg) => Purchases.purchasePackage(pkg),
  restorePurchases: () => Purchases.restorePurchases(),
};
