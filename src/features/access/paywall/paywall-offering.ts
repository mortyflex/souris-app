// BeautIzzy — the paywall offering boundary (BeautIzzy Plus) — plain TypeScript
//
// What the paywall needs to know about the plans a store offers THIS user,
// and nothing of how it was learnt. The RevenueCat adapter maps the store's
// offering (packages, prices, billing periods, introductory-offer
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
// promise. Its length is the store's own introductory period — days, weeks,
// months or years — never a number written here.

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

export type PaywallTrialPeriodUnit = 'day' | 'week' | 'month' | 'year';

/** The length of an introductory free period, as the store defines it. */
export interface PaywallTrialPeriod {
  readonly unit: PaywallTrialPeriodUnit;
  /** A whole, positive number of units. */
  readonly count: number;
}

export interface PaywallFreeTrial {
  readonly period: PaywallTrialPeriod;
  /** Whether THIS user may take it, as the store answered. */
  readonly eligibility: PaywallTrialEligibility;
}

export interface PaywallPlanOffer {
  readonly plan: SubscriptionPlan;
  readonly price: PaywallPrice;
  /** Absent when the plan carries no FREE introductory offer at all (a paid introductory price is not a trial). */
  readonly freeTrial?: PaywallFreeTrial;
}

export type PaywallOfferingUnavailableReason =
  /** No store adapter is integrated in this build. */
  | 'not-configured'
  /** The adapter exists but could not obtain the offering (offline, store down, no native module). */
  | 'store-unavailable'
  /** Nobody is signed in: there is no account to ask the store for. */
  | 'no-account';

export type PaywallOffering =
  /** The adapter is asking the store. The adapter — never the UI — turns a failure into `unavailable`. */
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly reason: PaywallOfferingUnavailableReason }
  /**
   * Whatever the store offers: both plans, one of them, or none that is
   * valid. `reference` is the opaque handle of THIS loaded offering, set by
   * the store adapter: a purchase names it, so the adapter buys the exact
   * store package it presented. Absent from fixtures and from an offering
   * nobody can buy from: without it, nothing can be purchased.
   */
  | { readonly status: 'available'; readonly plans: readonly PaywallPlanOffer[]; readonly reference?: string };

/**
 * What a store adapter answers for an identified user: the offering, or that
 * the store could not provide it. Never `loading`, never one of the
 * application's own states.
 */
export type StorePaywallOffering =
  | { readonly status: 'unavailable'; readonly reason: 'store-unavailable' }
  | { readonly status: 'available'; readonly plans: readonly PaywallPlanOffer[]; readonly reference?: string };

/** The offering of the application until a store adapter is integrated. */
export const unconfiguredPaywallOffering: PaywallOffering = {
  status: 'unavailable',
  reason: 'not-configured',
};

/** The store could not be asked, or did not answer. */
export const storeUnavailablePaywallOffering: StorePaywallOffering = {
  status: 'unavailable',
  reason: 'store-unavailable',
};

/** Nobody is signed in. */
export const noAccountPaywallOffering: PaywallOffering = {
  status: 'unavailable',
  reason: 'no-account',
};
