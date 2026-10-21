// BeautIzzy — RevenueCat CustomerInfo fixtures for tests (never imported by app code)
//
// Complete objects with the SDK's documented field names, so the mapping is
// exercised against real shapes. No store, no network, no real customer.

import type { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS, PLUS_ENTITLEMENT_IDENTIFIER } from '../customer-info';

export const NOW = new Date('2026-10-21T10:00:00.000Z');
export const NEXT_MONTH = new Date('2026-11-21T10:00:00.000Z');
export const LAST_MONTH = new Date('2026-09-21T10:00:00.000Z');

const NOT_REQUESTED = 'NOT_REQUESTED' as PurchasesEntitlementInfo['verification'];

export function plusEntitlement(overrides: Partial<PurchasesEntitlementInfo> = {}): PurchasesEntitlementInfo {
  return {
    identifier: PLUS_ENTITLEMENT_IDENTIFIER,
    isActive: true,
    willRenew: true,
    periodType: 'NORMAL',
    latestPurchaseDate: LAST_MONTH.toISOString(),
    latestPurchaseDateMillis: LAST_MONTH.getTime(),
    originalPurchaseDate: LAST_MONTH.toISOString(),
    originalPurchaseDateMillis: LAST_MONTH.getTime(),
    expirationDate: NEXT_MONTH.toISOString(),
    expirationDateMillis: NEXT_MONTH.getTime(),
    store: 'APP_STORE',
    productIdentifier: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly,
    productPlanIdentifier: null,
    isSandbox: true,
    unsubscribeDetectedAt: null,
    unsubscribeDetectedAtMillis: null,
    billingIssueDetectedAt: null,
    billingIssueDetectedAtMillis: null,
    ownershipType: 'PURCHASED',
    verification: NOT_REQUESTED,
    ...overrides,
  };
}

export interface CustomerInfoFixture {
  /** The `plus` record; `null` for none at all. Defaults to an active monthly subscription. */
  readonly plus?: PurchasesEntitlementInfo | null;
  /** Other entitlement records, keyed by identifier. */
  readonly otherEntitlements?: Readonly<Record<string, PurchasesEntitlementInfo>>;
  readonly requestDate?: Date;
  readonly originalAppUserId?: string;
  readonly allPurchasedProductIdentifiers?: readonly string[];
  readonly activeSubscriptions?: readonly string[];
}

export function customerInfo({
  plus = plusEntitlement(),
  otherEntitlements = {},
  requestDate = NOW,
  originalAppUserId = 'user-lea',
  allPurchasedProductIdentifiers,
  activeSubscriptions,
}: CustomerInfoFixture = {}): CustomerInfo {
  const all: Record<string, PurchasesEntitlementInfo> = { ...otherEntitlements };
  if (plus) all[PLUS_ENTITLEMENT_IDENTIFIER] = plus;
  const active = Object.fromEntries(Object.entries(all).filter(([, info]) => info.isActive));
  const purchased = allPurchasedProductIdentifiers ?? (plus ? [plus.productIdentifier] : []);
  const subscriptions = activeSubscriptions ?? (plus?.isActive ? [plus.productIdentifier] : []);
  return {
    entitlements: { all, active, verification: NOT_REQUESTED },
    activeSubscriptions: [...subscriptions],
    allPurchasedProductIdentifiers: [...purchased],
    latestExpirationDate: plus?.expirationDate ?? null,
    firstSeen: LAST_MONTH.toISOString(),
    originalAppUserId,
    requestDate: requestDate.toISOString(),
    allExpirationDates: plus ? { [plus.productIdentifier]: plus.expirationDate } : {},
    allPurchaseDates: plus ? { [plus.productIdentifier]: plus.latestPurchaseDate } : {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  };
}
