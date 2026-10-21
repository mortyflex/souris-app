// BeautIzzy — Business access domain types (BeautIzzy Plus)
//
// Two concerns, deliberately kept apart:
//
//   subscription status   what the store confirmed about the professional's
//                         BeautIzzy Plus subscription — commercial truth;
//   business access       what the application lets her do right now —
//                         `full` or `read-only` — an effective permission.
//
// Read-only access keeps every existing record, history, analytics and export
// readable. Business MUTATIONS require full access. A Calendar Block, an
// Appointment, a Sale… never carry access information: access is resolved
// from the subscription at the root of the application, never stored on data.
//
// The pilot's complimentary access is an entitlement like any other — it is
// granted through the store's entitlements, never through an account
// identifier hardcoded here.
//
// Framework-independent. Every instant is a `Date`; the resolver receives the
// current instant and never reads the system clock.

/** The two BeautIzzy Plus plans. Prices live in the stores, never here. */
export type SubscriptionPlan = 'monthly' | 'annual';

/**
 * The plan of a verified entitlement. `unknown` when the store's product
 * identifier does not establish it (a store test product, a product added
 * later): access never depends on the plan, so an adapter must never guess
 * one from an ambiguous identifier.
 */
export type EntitlementPlan = SubscriptionPlan | 'unknown';

/**
 * A subscription state that grants full access, with the instant at which it
 * stops doing so as the store knows it.
 *
 *   active             a paid subscription, renewing at `expiresAt`
 *   trial              the free trial, converting at `expiresAt`
 *   cancelled-active   renewal was cancelled; full until `expiresAt`, then read-only, no grace
 *   complimentary      pilot access granted individually; may have no end
 */
export type SubscriptionEntitlement =
  | { readonly kind: 'active'; readonly plan: EntitlementPlan; readonly expiresAt: Date }
  | { readonly kind: 'trial'; readonly plan: EntitlementPlan; readonly expiresAt: Date }
  | { readonly kind: 'cancelled-active'; readonly plan: EntitlementPlan; readonly expiresAt: Date }
  | { readonly kind: 'complimentary'; readonly expiresAt?: Date };

/**
 * What a SUCCESSFUL verification says. `expired` and `never` are confirmed
 * facts: nothing offline may soften them.
 */
export type SubscriptionStatus =
  | SubscriptionEntitlement
  | { readonly kind: 'expired' }
  | { readonly kind: 'never' };

/**
 * The latest verification attempt. `unavailable` means the renewal could not
 * be verified (offline, store unreachable): it is NOT a status, and on its own
 * it never grants anything.
 */
export type SubscriptionVerification =
  | { readonly kind: 'verified'; readonly status: SubscriptionStatus }
  | { readonly kind: 'unavailable' };

/**
 * The last proof that the professional held an entitlement: at `verifiedAt`,
 * a verification confirmed `entitlement`. It is what keeps the app usable
 * offline, and the ONLY thing that does. It is written by a successful
 * verification and never by a failed one (`updateEntitlementEvidence`).
 */
export interface EntitlementEvidence {
  readonly verifiedAt: Date;
  readonly entitlement: SubscriptionEntitlement;
}

/**
 * Whether the subscription decides access at all. `disabled` is the state of
 * the product until the paywall phase: every professional keeps full access
 * whatever her subscription. The resolver stays fully exercisable with
 * `enabled`.
 */
export type AccessEnforcement = 'enabled' | 'disabled';

export type BusinessAccessMode = 'full' | 'read-only';

export type BusinessAccess =
  /** Enforcement is off: nothing was checked, nothing can be refused. */
  | { readonly mode: 'full'; readonly reason: 'enforcement-disabled' }
  /** A verified entitlement that has not reached its end. */
  | { readonly mode: 'full'; readonly reason: 'entitled' }
  /**
   * Verification unavailable, the proven entitlement ended and may have
   * renewed: full until `graceEndsAt` (exclusive). Never the answer of a
   * successful verification, never granted to a cancelled subscription.
   */
  | { readonly mode: 'full'; readonly reason: 'offline-grace'; readonly graceEndsAt: Date }
  | { readonly mode: 'read-only'; readonly reason: ReadOnlyReason };

export type ReadOnlyReason =
  /** The subscription ended: confirmed by the store, or a verified cancellation reached its known end. */
  | 'subscription-expired'
  /** The store confirmed there never was one. */
  | 'never-subscribed'
  /** Verification unavailable and no proof of a past entitlement. */
  | 'no-entitlement-evidence'
  /** Verification unavailable and the 72-hour grace after the last proof is over. */
  | 'grace-elapsed'
  /**
   * The proof or the status carries an invalid or contradictory timestamp —
   * including a freshly verified entitlement whose expiration is already behind now.
   */
  | 'unreliable-evidence';

export interface BusinessAccessInput {
  readonly now: Date;
  readonly enforcement: AccessEnforcement;
  readonly verification: SubscriptionVerification;
  /** The persisted proof; `undefined` on a fresh installation. */
  readonly lastVerifiedEntitlement?: EntitlementEvidence;
}
