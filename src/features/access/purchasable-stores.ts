// BeautIzzy — which stores the application may purchase from (BeautIzzy Plus)
//
// A BUILD constant, like the enforcement switch: never a setting, a remote
// flag or a control in the UI. Phase 6.3 enables store transactions against
// RevenueCat's Test Store ONLY — the store of a development bundle, whose
// purchases cost nothing. The provider refuses a purchase against any other
// store (`not-enabled`), so an iOS release bound to the App Store cannot
// start a real-money transaction whatever calls it. Adding `app-store` here
// is the product decision of the production purchase phase, made in code,
// reviewed and shipped with the paywall routing.

import type { SubscriptionStoreKind } from './subscription-source';

export const PURCHASABLE_STORES: readonly SubscriptionStoreKind[] = ['test-store'];

export function isPurchasableStore(store: SubscriptionStoreKind | undefined): boolean {
  return store !== undefined && PURCHASABLE_STORES.includes(store);
}
