// BeautIzzy — the paywall offering boundary (BeautIzzy Plus) — plain TypeScript
//
// What the paywall needs to know about the plans a store offers THIS user,
// and nothing of how it was learnt. The future RevenueCat adapter maps the
// store's offering (packages, prices, billing periods, introductory-offer
// eligibility) into this model; the paywall components consume it and never
// touch a store SDK, fetch anything, or call a purchase.
//
// Price ownership. Every price, currency and billing period here comes from
// the store. The application holds NO price of its own: the intended French
// prices are product planning information, kept out of this module and out
// of every runtime default. Without an adapter the offering is
// `unconfiguredPaywallOffering`, which the paywall presents as "not yet
// available" with no purchase action.
//
// Trial ownership. A free trial is shown only when the store confirmed that
// this user is ELIGIBLE for it. `unknown` and `ineligible` never read as a
// promise.

import type { SubscriptionPlan } from '@/domain/access';

export interface PaywallPrice {
  /** The amount in major units of the currency, as the store reports it (a decimal number). */
  readonly amount: number;
  /** ISO 4217 code: EUR, USD, CHF… */
  readonly currencyCode: string;
  /**
   * The store's own localized price string, when it provides one (the App
   * Store formats for the storefront). Preferred over local formatting.
   */
  readonly formatted?: string;
}

export type PaywallTrialEligibility = 'eligible' | 'ineligible' | 'unknown';

export interface PaywallFreeTrial {
  /** Whole days of the introductory free trial, as the store defines it. */
  readonly days: number;
  /** Whether THIS user may take it, as the store answered. */
  readonly eligibility: PaywallTrialEligibility;
}

export interface PaywallPlanOffer {
  readonly plan: SubscriptionPlan;
  readonly price: PaywallPrice;
  /** Absent when the plan carries no introductory offer at all. */
  readonly freeTrial?: PaywallFreeTrial;
}

export type PaywallOfferingUnavailableReason =
  /** No store adapter is integrated in this build. */
  | 'not-configured'
  /** The adapter exists but could not obtain the offering (offline, store down). */
  | 'store-unavailable';

export type PaywallOffering =
  /** The adapter is asking the store. The adapter — never the UI — turns a failure into `unavailable`. */
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly reason: PaywallOfferingUnavailableReason }
  /** Whatever the store offers: both plans, one of them, or none that is valid. */
  | { readonly status: 'available'; readonly plans: readonly PaywallPlanOffer[] };

/** The offering of the application until a store adapter is integrated. */
export const unconfiguredPaywallOffering: PaywallOffering = {
  status: 'unavailable',
  reason: 'not-configured',
};
