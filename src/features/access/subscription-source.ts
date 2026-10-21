// BeautIzzy — the subscription source contract (BeautIzzy Plus)
//
// The ONE boundary through which the application learns about the
// professional's subscription. A future RevenueCat adapter implements it; the
// provider (`BusinessAccessProvider`) consumes it; nothing else ever talks to
// a store. The answer is the domain's `SubscriptionVerification`: a confirmed
// status, or `unavailable` when nothing could be verified. The source never
// decides access — THE domain rule does.
//
// `verify` must resolve; a rejection is read as `unavailable` by the provider.
// An adapter must never report an entitlement already expired as active (see
// the resolver's header): the store's extended expiration is the one to pass.
//
// `loadOffering` (Phase 6.2) is the same boundary for what the store SELLS
// that user: the plans, their store prices and the user's trial eligibility,
// as `StorePaywallOffering`. Optional: a source without a store has none, and
// the provider answers `not-configured`. It never purchases.

import type { SubscriptionVerification } from '@/domain/access';

import type { StorePaywallOffering } from './paywall/paywall-offering';

export interface SubscriptionSource {
  /** Verifies the subscription of the signed-in user. */
  readonly verify: (userId: string) => Promise<SubscriptionVerification>;
  /**
   * Later verifications pushed by the store (a renewal, a purchase, a
   * revocation) for that user. Returns the unsubscribe. Optional: a source
   * that cannot push only answers `verify`.
   */
  readonly onVerificationChange?: (
    userId: string,
    listener: (verification: SubscriptionVerification) => void,
  ) => () => void;
  /**
   * The offering the store makes to that user, read for that identity only.
   * Must resolve; a rejection is read as `store-unavailable` by the provider.
   */
  readonly loadOffering?: (userId: string) => Promise<StorePaywallOffering>;
}

/**
 * The source of the application until a store is integrated: no network, no
 * store, no claim. Every verification is `unavailable`, which on its own
 * never grants anything — and, with enforcement disabled, never refuses.
 */
export const unconfiguredSubscriptionSource: SubscriptionSource = {
  verify: () => Promise.resolve({ kind: 'unavailable' }),
};
