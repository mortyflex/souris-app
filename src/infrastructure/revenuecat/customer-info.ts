// BeautIzzy — RevenueCat CustomerInfo → SubscriptionVerification — pure
//
// THE translation of what RevenueCat knows about a customer into the domain's
// vocabulary. It reads the documented CustomerInfo fields and nothing else; it
// decides NO access — `resolveBusinessAccess` does — and models no grace.
//
// Only the entitlement `plus` grants BeautIzzy Plus. Its record, with the
// SDK's documented semantics:
//
//   absent, no known Plus product ever purchased     never
//   absent, a known Plus product purchased before    expired   (history distinguishes it from `never`)
//   absent, a known Plus product reported ACTIVE     unavailable (contradictory: fail closed, confirm nothing)
//   isActive false                                   expired   (the record exists: it once held)
//   isActive, store PROMOTIONAL                      complimentary, with the end when there is one
//   isActive, no expiration, not promotional         unavailable (no reliable evidence of an indefinite grant)
//   isActive, periodType TRIAL, will renew           trial
//   isActive, auto-renewal cancelled by the user     cancelled-active (unsubscribeDetectedAt, willRenew false)
//   isActive, willRenew false for another reason     cancelled-active, unless the only reason is a billing
//                                                    issue the store is still retrying: then active, with the
//                                                    expiration the store extends it to
//   isActive, will renew                             active
//
// Freshness. The SDK serves its cached CustomerInfo first and fetches when
// that cache is older than five minutes in the foreground. `requestDate` is
// the instant the store produced the answer: an answer older than
// CUSTOMER_INFO_FRESHNESS_MS (the SDK's own foreground cache lifetime) is
// what the store said THEN, not now — it is `unavailable` here, never a fresh
// confirmed revocation nor a fresh renewal; the source refetches instead.
//
// An entitlement whose expiration is already behind `now` — reported active
// because it was active when the answer was produced — is `unavailable`: its
// renewal is unverified, and the resolver must never receive an entitlement
// already expired as active (see its header). No date is ever invented.
//
// The plan is established by an EXACT App Store product identifier; any other
// identifier (a Test Store product, a future product) is `unknown`.
//
// Environment (Phase 6.5C, step 1). Every entitlement record says where it was
// unlocked: `isSandbox` false for a production purchase, true for Apple's
// Sandbox and the RevenueCat Test Store. A Sandbox entitlement is never
// evidence of production Plus access, so the caller states, with
// `EntitlementEnvironmentPolicy`, which environments ITS source may trust:
//
//   production-only   an ordinary source — an App Store release, TestFlight
//                     included: a record whose environment is not production
//                     (sandbox, or not readable) is `unavailable` as a whole,
//                     whatever it says — never active, never expired, never
//                     a fresh revocation. Nothing is fabricated: the status
//                     of production access is simply unknown here.
//   sandbox-trusted   the two testing configurations only — a source bound to
//                     the Test Store (a debug bundle), or an App Store source
//                     in Apple Sandbox mode with dedicated test accounts
//                     declared (`subscription-source.ts` resolves it; nothing
//                     else may): production and sandbox records are read
//                     alike, so the bench sees its own test purchases.
//
// The environment is read before anything else about the record: under
// `production-only` an expired Sandbox subscription is not `expired` (which
// would erase a production proof) — it is simply not production evidence.
// A record whose `isSandbox` is not a boolean is malformed under either
// policy: `unavailable`, like any other malformed record.

import type { EntitlementPlan, SubscriptionPlan, SubscriptionVerification } from '@/domain/access';

import type { CustomerInfo } from './sdk';

export const PLUS_ENTITLEMENT_IDENTIFIER = 'plus';

/**
 * Which store environments a source may read a `plus` record from.
 * `production-only` is the policy of every ordinary source; `sandbox-trusted`
 * is resolved from a testing configuration only, never from `__DEV__` alone.
 */
export type EntitlementEnvironmentPolicy = 'production-only' | 'sandbox-trusted';

/** The environment an entitlement record was unlocked in, as RevenueCat reports it. */
export type EntitlementEnvironment = 'production' | 'sandbox';

/** Five minutes: the SDK's foreground cache lifetime. An older answer is not a verification of now. */
export const CUSTOMER_INFO_FRESHNESS_MS = 5 * 60 * 1000;

/** The App Store products, by plan. Only an exact match establishes a plan. */
export const APP_STORE_PLUS_PRODUCT_IDENTIFIERS: Readonly<Record<SubscriptionPlan, string>> = {
  monthly: 'com.mortyflex.sourisapp.plus.monthly',
  annual: 'com.mortyflex.sourisapp.plus.annual',
};

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };
const EXPIRED: SubscriptionVerification = { kind: 'verified', status: { kind: 'expired' } };
const NEVER: SubscriptionVerification = { kind: 'verified', status: { kind: 'never' } };

function isValidInstant(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** An ISO 8601 instant as RevenueCat reports it; undefined for anything else. */
export function parseStoreInstant(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const instant = new Date(value);
  return isValidInstant(instant) ? instant : undefined;
}

export function planFromProductIdentifier(productIdentifier: unknown): EntitlementPlan {
  if (productIdentifier === APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly) return 'monthly';
  if (productIdentifier === APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual) return 'annual';
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Whether `info` is an answer of the store for `now`: produced within the
 * freshness window, and not dated beyond it in the future (a clock that
 * disagrees with the store by more than the window is not trusted either).
 */
export function isCustomerInfoFresh(info: CustomerInfo, now: Date): boolean {
  if (!isValidInstant(now)) throw new RangeError('isCustomerInfoFresh: invalid current instant');
  const requestDate = parseStoreInstant(isRecord(info) ? info.requestDate : undefined);
  if (requestDate === undefined) return false;
  const age = now.getTime() - requestDate.getTime();
  return age <= CUSTOMER_INFO_FRESHNESS_MS && age >= -CUSTOMER_INFO_FRESHNESS_MS;
}

function isKnownPlusProduct(productIdentifier: string): boolean {
  return planFromProductIdentifier(productIdentifier) !== 'unknown';
}

/** The environment of an entitlement record from its documented `isSandbox` field; undefined when it is not a boolean. */
export function readEntitlementEnvironment(entitlement: unknown): EntitlementEnvironment | undefined {
  if (!isRecord(entitlement)) return undefined;
  if (entitlement.isSandbox === false) return 'production';
  if (entitlement.isSandbox === true) return 'sandbox';
  return undefined;
}

/** Whether a record of `environment` may be read under `policy`. An unreadable environment is trusted by no policy. */
export function isEntitlementEnvironmentTrusted(
  environment: EntitlementEnvironment | undefined,
  policy: EntitlementEnvironmentPolicy,
): boolean {
  if (environment === undefined) return false;
  return policy === 'sandbox-trusted' || environment === 'production';
}

/** What the absence of any `plus` record means, read from the purchase history. */
function mapWithoutEntitlementRecord(info: Record<string, unknown>): SubscriptionVerification {
  if (stringList(info.activeSubscriptions).some(isKnownPlusProduct)) return UNAVAILABLE;
  if (stringList(info.allPurchasedProductIdentifiers).some(isKnownPlusProduct)) return EXPIRED;
  return NEVER;
}

export function mapCustomerInfoToVerification(
  info: CustomerInfo,
  now: Date,
  policy: EntitlementEnvironmentPolicy,
): SubscriptionVerification {
  if (!isValidInstant(now)) throw new RangeError('mapCustomerInfoToVerification: invalid current instant');
  if (!isRecord(info) || !isCustomerInfoFresh(info, now)) return UNAVAILABLE;

  const entitlements = info.entitlements;
  if (!isRecord(entitlements) || !isRecord(entitlements.all)) return UNAVAILABLE;
  const entitlement = entitlements.all[PLUS_ENTITLEMENT_IDENTIFIER];
  if (entitlement === undefined) return mapWithoutEntitlementRecord(info);
  if (!isRecord(entitlement)) return UNAVAILABLE;
  // The environment first: a record this source may not read says nothing —
  // not even that the production access expired.
  if (!isEntitlementEnvironmentTrusted(readEntitlementEnvironment(entitlement), policy)) return UNAVAILABLE;
  if (entitlement.verification === 'FAILED') return UNAVAILABLE;

  if (entitlement.isActive === false) return EXPIRED;
  if (entitlement.isActive !== true) return UNAVAILABLE;

  let expiresAt: Date | undefined;
  if (entitlement.expirationDate !== null) {
    expiresAt = parseStoreInstant(entitlement.expirationDate);
    if (expiresAt === undefined) return UNAVAILABLE;
    if (expiresAt.getTime() <= now.getTime()) return UNAVAILABLE;
  }

  if (entitlement.store === 'PROMOTIONAL') {
    return {
      kind: 'verified',
      status: expiresAt ? { kind: 'complimentary', expiresAt } : { kind: 'complimentary' },
    };
  }
  if (expiresAt === undefined) return UNAVAILABLE;

  const plan = planFromProductIdentifier(entitlement.productIdentifier);
  const willRenew = entitlement.willRenew === true;
  const unsubscribed = entitlement.unsubscribeDetectedAt != null;
  const billingIssue = entitlement.billingIssueDetectedAt != null;

  if (!willRenew && (unsubscribed || !billingIssue)) {
    return { kind: 'verified', status: { kind: 'cancelled-active', plan, expiresAt } };
  }
  if (entitlement.periodType === 'TRIAL') {
    return { kind: 'verified', status: { kind: 'trial', plan, expiresAt } };
  }
  return { kind: 'verified', status: { kind: 'active', plan, expiresAt } };
}
