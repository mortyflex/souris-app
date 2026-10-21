// BeautIzzy — the ONE binding to the RevenueCat SDK (react-native-purchases)
//
// The only module that imports `react-native-purchases`. It exposes the
// narrow, process-global surface the subscription source needs — identity,
// CustomerInfo, its update event — behind an interface tests implement with a
// deterministic fake. A later phase extends this facade with offerings and
// purchases; nothing here purchases, restores or syncs anything.
//
// `Purchases.configure` throws when the native module is absent (a
// development build that predates the SDK, Expo Go): the source turns that
// into "unavailable", never into a crash. `logOut` is deliberately absent: it
// would create an anonymous RevenueCat identity, which this identified-only
// integration never does (see subscription-source.ts).

import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type LogInResult,
} from 'react-native-purchases';

export type { CustomerInfo, CustomerInfoUpdateListener, LogInResult };

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
}

export const expoRevenueCatSdk: RevenueCatSdk = {
  configure: ({ apiKey, appUserID }) => Purchases.configure({ apiKey, appUserID }),
  logIn: (appUserID) => Purchases.logIn(appUserID),
  getAppUserID: () => Purchases.getAppUserID(),
  getCustomerInfo: () => Purchases.getCustomerInfo(),
  invalidateCustomerInfoCache: () => Purchases.invalidateCustomerInfoCache(),
  addCustomerInfoUpdateListener: (listener) => Purchases.addCustomerInfoUpdateListener(listener),
  removeCustomerInfoUpdateListener: (listener) => Purchases.removeCustomerInfoUpdateListener(listener),
};
