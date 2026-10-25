// BeautIzzy — the subscription source contract (BeautIzzy Plus)
//
// The ONE boundary through which the application learns about the
// professional's subscription. The RevenueCat adapter implements it; the
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
// the provider answers `not-configured`.
//
// `purchase` and `restore` (Phase 6.3) are the same boundary for the two
// store transactions the professional may start. A purchase names a plan of
// an offering the source itself loaded (`reference`): the adapter buys the
// exact store package it presented, never one rebuilt from a label, a price
// or an identifier typed elsewhere. Both resolve with an OUTCOME, never
// reject: the transaction completed (with the verification the store
// answered — which may well confirm nothing yet), the professional cancelled,
// the store deferred it, or it failed for a named reason. An outcome never
// grants anything: the verification goes through the provider's pipeline and
// THE domain rule, like every other verification.

import type { SubscriptionPlan, SubscriptionVerification } from '@/domain/access';

import type { StorePaywallOffering } from './paywall/paywall-offering';

/** Which store a source is bound to: RevenueCat's Test Store (development) or Apple's App Store. */
export type SubscriptionStoreKind = 'test-store' | 'app-store';

/**
 * Apple Sandbox mode (Phase 6.4): a DEBUG bundle bound to the App Store by the
 * explicit `APP_VARIANT=apple-sandbox` opt-in, for Apple Sandbox testing on a
 * development-signed device build. Absent from every other source — a release
 * bound to the App Store never carries it. Carrying it is not a proof that a
 * transaction runs in Apple's Sandbox: StoreKit decides the environment from
 * the app's signature and the Apple account signed in on the device.
 */
export interface AppleSandboxMode {
  /**
   * The dedicated test accounts that may transact in this mode — Supabase user
   * ids or emails, lowercase — and nobody else (`purchase-authorization.ts`).
   * Empty: no account may transact.
   */
  readonly testAccounts: readonly string[];
}

/** A purchase names the offering it was shown (`reference`) and the plan chosen in it. */
export interface PurchaseRequest {
  /** The opaque reference the source attached to the offering it loaded (`StorePaywallOffering.reference`). */
  readonly reference: string;
  readonly plan: SubscriptionPlan;
}

/** Why a purchase or a restore did not complete. Each reason has its own wording; none is a secret. */
export type StoreTransactionFailure =
  /** Nobody is signed in. */
  | 'no-account'
  /** No store adapter, or one without transactions, in this build. */
  | 'not-configured'
  /** The build's store is not one purchases are enabled for (see `purchasable-stores.ts`, `purchase-authorization.ts`). */
  | 'not-enabled'
  /** Apple Sandbox mode: the signed-in account is not one of the dedicated test accounts. */
  | 'not-test-account'
  /** A purchase or a restore is already in flight for this session. */
  | 'operation-in-progress'
  /** The named offering is not the one the source currently holds for this account: load it again. */
  | 'stale-offering'
  /** The SDK cannot act: native module absent, or never configured. */
  | 'sdk-unavailable'
  /** The SDK does not hold the requested account. */
  | 'identity-mismatch'
  /** The store refused or failed (StoreKit, a simulated Test Store failure). */
  | 'store-problem'
  /** The product cannot be bought right now (not available in this storefront). */
  | 'product-unavailable'
  /** The store says this account already owns the subscription. */
  | 'already-owned'
  /** The store receipt belongs to another account. */
  | 'linked-to-another-account'
  /** Purchases are not allowed on this device (parental controls, restrictions). */
  | 'not-allowed'
  /** Offline, or the store did not answer in time. */
  | 'network'
  /** Anything the adapter could not name. */
  | 'unexpected';

export type StorePurchaseOutcome =
  /** The native transaction finished; `verification` is what the store answered right after. */
  | { readonly kind: 'completed'; readonly verification: SubscriptionVerification }
  | { readonly kind: 'cancelled' }
  /** Deferred by the store (an approval to come): nothing is owned yet. */
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly reason: StoreTransactionFailure };

export type StoreRestoreOutcome =
  /** The store answered; `verification` may confirm an entitlement, confirm none, or be unavailable. */
  | { readonly kind: 'completed'; readonly verification: SubscriptionVerification }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: StoreTransactionFailure };

export interface SubscriptionSource {
  /** The store this source is bound to; absent for a source without one. */
  readonly store?: SubscriptionStoreKind;
  /** Apple Sandbox mode (a debug bundle bound to the App Store, Phase 6.4); absent from every other source. */
  readonly appleSandbox?: AppleSandboxMode;
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
  /**
   * Buys, for that user, the plan of an offering this source loaded. Must
   * resolve with an outcome; a rejection is read as `unexpected`.
   */
  readonly purchase?: (userId: string, request: PurchaseRequest) => Promise<StorePurchaseOutcome>;
  /**
   * Asks the store for that user's previous purchases. Explicitly user-
   * initiated: never called at launch, sign-in or foreground. Must resolve.
   */
  readonly restore?: (userId: string) => Promise<StoreRestoreOutcome>;
}

/**
 * The source of the application until a store is integrated: no network, no
 * store, no claim. Every verification is `unavailable`, which on its own
 * never grants anything — and, with enforcement disabled, never refuses.
 */
export const unconfiguredSubscriptionSource: SubscriptionSource = {
  verify: () => Promise.resolve({ kind: 'unavailable' }),
};
