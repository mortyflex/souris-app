// BeautIzzy — Plus entitlement mirror: reconciliation with the RevenueCat REST API
//
// RevenueCat recommends fetching the subscriber's CURRENT state after any
// webhook event (`GET /v1/subscribers/{app_user_id}`) rather than deriving it
// event by event. When the secret API key is configured, the webhook does
// exactly that after each delivery it recorded: the answer is authoritative
// for its `request_date` and for EACH PRODUCT it describes, and replaces that
// product's row unless the row was confirmed later
// (`subscription_apply_reconciliation`). It also settles what a single event
// cannot: a transfer's receiver, a delivery that arrived out of order, a
// subscriber whose history predates the webhook.
//
// What is read, and why per product. `subscriber.entitlements.plus` is
// RevenueCat's SUMMARY of the entitlement: ONE product (the one granting the
// longest), one expiration. It cannot enumerate several concurrent sources — a
// paid subscription and a promotional grant, two grants — so the mapping does
// not rely on it. The granting sources are read from
// `subscriber.subscriptions`, keyed by product (expires_date, purchase_date,
// store, period_type, is_sandbox, unsubscribe_detected_at,
// billing_issues_detected_at, grace_period_expires_date, refunded_at,
// store_transaction_id). A product is a Plus source when it is one of THE App
// Store products, a RevenueCat promotional product of the `plus` entitlement
// (`rc_promo_plus_<duration>`), or the product the `plus` summary itself names
// (a Test Store product, a product added later). Vocabularies arrive lowercase
// there (`app_store`, `promotional`, `normal`) and are upper-cased to the
// webhook's; `is_sandbox` decides the environment of EACH product.
// `non_subscriptions` are not read: BeautIzzy sells no such product.
//
// Conservative policy. A row the answer does NOT describe is left exactly as
// it is: an absence — a product RevenueCat no longer lists, a summary that
// names another product, a malformed or failed answer — is never evidence that
// a source expired. Confirmed ends the answer DOES carry (an expiration behind
// `request_date`, a refund) are applied. A store subscription without an
// expiration is not evidence of an indefinite grant and is skipped — only a
// promotional grant may have no end.
//
// A reconciliation failure NEVER fails the webhook delivery: the event was
// recorded already, and RevenueCat must not retry it for that. The key is
// sent on the Authorization header only and appears in no message.

import {
  PLUS_ENTITLEMENT_IDENTIFIER,
  SUBSCRIPTION_ENVIRONMENTS,
  isPlusPromotionalProduct,
  planFromProductIdentifier,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type SubscriptionEnvironment,
} from './entitlement-snapshot.ts';
import { findSnapshot, type MirrorRead, type SubscriptionMirror } from './mirror.ts';

export const REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com/v1';

export interface SubscriberApi {
  /** The raw JSON answer of GET /subscribers/{app_user_id}; rejects on a non-2xx answer. */
  fetchSubscriber(appUserId: string): Promise<unknown>;
}

export interface RevenueCatSubscriberApiOptions {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
}

export function createRevenueCatSubscriberApi({
  apiKey,
  fetchFn = fetch,
  baseUrl = REVENUECAT_API_BASE_URL,
}: RevenueCatSubscriberApiOptions): SubscriberApi {
  return {
    async fetchSubscriber(appUserId) {
      const response = await fetchFn(`${baseUrl}/subscribers/${encodeURIComponent(appUserId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        // Status only: never the body (it may describe the account), never the key.
        throw new Error(`revenuecat api answered ${response.status}`);
      }
      return response.json();
    },
  };
}

/** One granting source as the API describes it, placed in its environment. */
export interface MappedSource {
  readonly environment: SubscriptionEnvironment;
  readonly snapshot: EntitlementSnapshot;
}

export interface MappedSubscriber {
  readonly requestDateMs: number;
  readonly originalAppUserId: string | null;
  readonly sources: readonly MappedSource[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function instantMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function upperOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function laterOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Whether `productId` grants Plus: THE App Store products, a promotional product of `plus`, or the product the summary names. */
export function isPlusSource(productId: string, summaryProductId: string | null): boolean {
  return planFromProductIdentifier(productId) !== 'UNKNOWN' || isPlusPromotionalProduct(productId) || productId === summaryProductId;
}

/** The row of one product from its `subscriptions` entry; undefined when the entry says nothing usable. */
function mapSubscription(
  productId: string,
  subscription: Record<string, unknown>,
  requestDateMs: number,
  appUserId: string,
  originalAppUserId: string | null,
): MappedSource | undefined {
  const store = upperOrNull(subscription.store);
  const promotional = store === 'PROMOTIONAL' || isPlusPromotionalProduct(productId);
  const expiresAtMs = instantMs(subscription.expires_date);
  if (!promotional && expiresAtMs === null) return undefined;

  const environment: SubscriptionEnvironment = subscription.is_sandbox === true ? 'SANDBOX' : 'PRODUCTION';
  const gracePeriodExpiresAtMs = instantMs(subscription.grace_period_expires_date);
  const unsubscribeDetectedAtMs = instantMs(subscription.unsubscribe_detected_at);
  const billingIssueDetectedAtMs = instantMs(subscription.billing_issues_detected_at);
  const refundedAtMs = instantMs(subscription.refunded_at);
  const periodType = upperOrNull(subscription.period_type);
  let entitledUntilMs = laterOf(expiresAtMs, billingIssueDetectedAtMs !== null ? gracePeriodExpiresAtMs : null);
  if (refundedAtMs !== null) entitledUntilMs = entitledUntilMs === null ? refundedAtMs : Math.min(entitledUntilMs, refundedAtMs);

  let status: EntitlementStatus;
  if (entitledUntilMs !== null && entitledUntilMs <= requestDateMs) status = 'EXPIRED';
  else if (promotional) status = 'COMPLIMENTARY';
  else if (billingIssueDetectedAtMs !== null) status = 'BILLING_RETRY';
  else if (unsubscribeDetectedAtMs !== null) status = 'CANCELLED_ACTIVE';
  else if (periodType === 'TRIAL') status = 'TRIAL';
  else status = 'ACTIVE';

  return {
    environment,
    snapshot: {
      status,
      plan: planFromProductIdentifier(productId),
      productId,
      pendingProductId: null,
      store: promotional ? 'PROMOTIONAL' : store,
      periodType,
      appUserId,
      originalAppUserId,
      purchasedAtMs: instantMs(subscription.purchase_date) ?? instantMs(subscription.original_purchase_date),
      expiresAtMs,
      gracePeriodExpiresAtMs,
      entitledUntilMs,
      willRenew: !promotional && status !== 'EXPIRED' && unsubscribeDetectedAtMs === null,
      unsubscribeDetectedAtMs,
      billingIssueDetectedAtMs,
      originalTransactionId: null,
      latestTransactionId: textOrNull(subscription.store_transaction_id),
      latestEventId: null,
      latestEventType: null,
      latestEventAtMs: null,
      source: 'RECONCILIATION',
      verifiedAtMs: requestDateMs,
    },
  };
}

export function mapSubscriberResponse(response: unknown, matchedAppUserId: string): MappedSubscriber | undefined {
  if (!isRecord(response) || !isRecord(response.subscriber)) return undefined;
  const requestDateMs =
    typeof response.request_date_ms === 'number' && Number.isFinite(response.request_date_ms)
      ? Math.trunc(response.request_date_ms)
      : instantMs(response.request_date);
  if (requestDateMs === null) return undefined;
  const subscriber = response.subscriber;
  const originalAppUserId = textOrNull(subscriber.original_app_user_id);
  const entitlements = isRecord(subscriber.entitlements) ? subscriber.entitlements : {};
  const subscriptions = isRecord(subscriber.subscriptions) ? subscriber.subscriptions : {};
  const summary = entitlements[PLUS_ENTITLEMENT_IDENTIFIER];
  const summaryProductId = isRecord(summary) ? textOrNull(summary.product_identifier) : null;

  const sources: MappedSource[] = [];
  for (const [productId, raw] of Object.entries(subscriptions)) {
    if (!isRecord(raw) || !isPlusSource(productId, summaryProductId)) continue;
    const mapped = mapSubscription(productId, raw, requestDateMs, matchedAppUserId, originalAppUserId);
    if (mapped !== undefined) sources.push(mapped);
  }
  return { requestDateMs, originalAppUserId, sources };
}

export type ReconciliationOutcome =
  | { readonly status: 'applied'; readonly applied: readonly string[]; readonly stale: readonly string[] }
  | { readonly status: 'nothing' }
  | { readonly status: 'unmatched' }
  | { readonly status: 'failed'; readonly reason: string };

export interface SubscriberReconciler {
  reconcile(appUserIds: readonly string[]): Promise<ReconciliationOutcome>;
}

export interface SubscriberReconcilerOptions {
  readonly api: SubscriberApi;
  readonly mirror: SubscriptionMirror;
}

export function createSubscriberReconciler({ api, mirror }: SubscriberReconcilerOptions): SubscriberReconciler {
  return {
    async reconcile(appUserIds) {
      try {
        const reads: Partial<Record<SubscriptionEnvironment, MirrorRead>> = {};
        for (const environment of SUBSCRIPTION_ENVIRONMENTS) {
          reads[environment] = await mirror.readMirror(appUserIds, environment);
        }
        const matched = reads.PRODUCTION;
        if (matched === undefined || matched.userId === null || matched.matchedAppUserId === null) return { status: 'unmatched' };

        const mapped = mapSubscriberResponse(await api.fetchSubscriber(matched.matchedAppUserId), matched.matchedAppUserId);
        if (mapped === undefined) return { status: 'failed', reason: 'malformed subscriber answer' };

        const applied: string[] = [];
        const stale: string[] = [];
        for (const { environment, snapshot } of mapped.sources) {
          const existing = findSnapshot(reads[environment]?.snapshots ?? [], snapshot.productId);
          // The webhook facts the API lacks travel with the row.
          const merged: EntitlementSnapshot =
            existing === null
              ? snapshot
              : { ...snapshot, originalTransactionId: existing.originalTransactionId, pendingProductId: existing.pendingProductId };
          const result = await mirror.applyReconciliation(matched.userId, environment, snapshot.productId, merged);
          (result === 'APPLIED' ? applied : stale).push(`${environment}:${snapshot.productId}`);
        }
        return applied.length === 0 && stale.length === 0 ? { status: 'nothing' } : { status: 'applied', applied, stale };
      } catch (error) {
        return { status: 'failed', reason: error instanceof Error ? error.message : 'reconciliation failed' };
      }
    },
  };
}
