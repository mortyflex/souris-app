// BeautIzzy — Plus entitlement mirror: the snapshot model (Phase 6.5A)
//
// The server-side vocabulary of ONE row of `subscription_entitlements`
// (20261004120000_create_subscription_entitlements.sql). Plain TypeScript,
// shared by the webhook projection, the reconciliation mapper and the
// Supabase adapter; instants travel as Unix milliseconds — RevenueCat's own
// unit — in both directions, never as formatted strings.
//
// `entitledUntilMs` is THE instant access ends as RevenueCat knows it (the
// store expiration, or the end of the store's billing grace when later); null
// only for a complimentary grant without a predetermined end. Ends are
// exclusive. Nothing here models the app's 72-hour OFFLINE grace: that grace
// belongs to a device whose last trusted state was in force and whose renewal
// cannot be verified — never to a confirmed expiration or revocation.

export type SubscriptionEnvironment = 'PRODUCTION' | 'SANDBOX';

export const SUBSCRIPTION_ENVIRONMENTS: readonly SubscriptionEnvironment[] = ['PRODUCTION', 'SANDBOX'];

export type EntitlementStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'CANCELLED_ACTIVE'
  | 'BILLING_RETRY'
  | 'COMPLIMENTARY'
  | 'EXPIRED';

export type EntitlementPlan = 'MONTHLY' | 'ANNUAL' | 'UNKNOWN';

export type SnapshotSource = 'WEBHOOK' | 'RECONCILIATION';

/** Only the entitlement `plus` grants BeautIzzy Plus (the app's customer-info.ts agrees). */
export const PLUS_ENTITLEMENT_IDENTIFIER = 'plus';

/** The App Store products, by plan. Only an EXACT match establishes a plan (customer-info.ts agrees). */
export const APP_STORE_PLUS_PRODUCT_IDENTIFIERS: Readonly<Record<Exclude<EntitlementPlan, 'UNKNOWN'>, string>> = {
  MONTHLY: 'com.mortyflex.sourisapp.plus.monthly',
  ANNUAL: 'com.mortyflex.sourisapp.plus.annual',
};

export interface EntitlementSnapshot {
  readonly status: EntitlementStatus;
  readonly plan: EntitlementPlan;
  /** The granting product: THE unit of a row. An App Store product, a RevenueCat promotional product, a Test Store product. */
  readonly productId: string;
  /** The product of the NEXT period announced by PRODUCT_CHANGE; the current one stays in `productId`. */
  readonly pendingProductId: string | null;
  /** RevenueCat's vocabulary as received (APP_STORE, PLAY_STORE, PROMOTIONAL, …). */
  readonly store: string | null;
  readonly periodType: string | null;
  /** The RevenueCat App User ID that matched the Supabase user. */
  readonly appUserId: string;
  readonly originalAppUserId: string | null;
  readonly purchasedAtMs: number | null;
  readonly expiresAtMs: number | null;
  readonly gracePeriodExpiresAtMs: number | null;
  readonly entitledUntilMs: number | null;
  readonly willRenew: boolean;
  readonly unsubscribeDetectedAtMs: number | null;
  readonly billingIssueDetectedAtMs: number | null;
  readonly originalTransactionId: string | null;
  readonly latestTransactionId: string | null;
  /** The latest APPLIED webhook event; null for a snapshot the reconciliation wrote alone. */
  readonly latestEventId: string | null;
  readonly latestEventType: string | null;
  readonly latestEventAtMs: number | null;
  readonly source: SnapshotSource;
  /** The instant the state was last confirmed: the event timestamp, or the API `request_date`. */
  readonly verifiedAtMs: number;
}

/**
 * RevenueCat names a promotional grant `rc_promo_<entitlement id>_<duration>`
 * (lifetime, yearly, monthly, …): the entitlement id INSIDE the product id is
 * its association. BeautIzzy declares the single entitlement `plus`.
 */
export const PLUS_PROMOTIONAL_PRODUCT_PATTERN = /^rc_promo_plus_[a-z0-9_]+$/;

export function isPlusPromotionalProduct(productId: string | null | undefined): boolean {
  return typeof productId === 'string' && PLUS_PROMOTIONAL_PRODUCT_PATTERN.test(productId);
}

export function planFromProductIdentifier(productId: string | null | undefined): EntitlementPlan {
  if (productId === APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY) return 'MONTHLY';
  if (productId === APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL) return 'ANNUAL';
  return 'UNKNOWN';
}

/**
 * Whether THIS source grants at `atMs`: not EXPIRED, and its end (exclusive)
 * not reached. Effective Plus access is the OR over a user's production
 * sources — decided server-side by `subscription_has_plus_access` (the
 * migration), never by one row.
 */
export function isEntitledAt(snapshot: EntitlementSnapshot, atMs: number): boolean {
  if (snapshot.status === 'EXPIRED') return false;
  if (snapshot.entitledUntilMs === null) return true;
  return atMs < snapshot.entitledUntilMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function msOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const STATUSES: readonly EntitlementStatus[] = ['ACTIVE', 'TRIAL', 'CANCELLED_ACTIVE', 'BILLING_RETRY', 'COMPLIMENTARY', 'EXPIRED'];
const PLANS: readonly EntitlementPlan[] = ['MONTHLY', 'ANNUAL', 'UNKNOWN'];

/** The snapshot as the SQL functions exchange it (snake_case, `_ms` instants). */
export function snapshotToJson(snapshot: EntitlementSnapshot): Record<string, unknown> {
  return {
    status: snapshot.status,
    plan: snapshot.plan,
    product_id: snapshot.productId,
    pending_product_id: snapshot.pendingProductId,
    store: snapshot.store,
    period_type: snapshot.periodType,
    app_user_id: snapshot.appUserId,
    original_app_user_id: snapshot.originalAppUserId,
    purchased_at_ms: snapshot.purchasedAtMs,
    expires_at_ms: snapshot.expiresAtMs,
    grace_period_expires_at_ms: snapshot.gracePeriodExpiresAtMs,
    entitled_until_ms: snapshot.entitledUntilMs,
    will_renew: snapshot.willRenew,
    unsubscribe_detected_at_ms: snapshot.unsubscribeDetectedAtMs,
    billing_issue_detected_at_ms: snapshot.billingIssueDetectedAtMs,
    original_transaction_id: snapshot.originalTransactionId,
    latest_transaction_id: snapshot.latestTransactionId,
    latest_event_id: snapshot.latestEventId,
    latest_event_type: snapshot.latestEventType,
    latest_event_at_ms: snapshot.latestEventAtMs,
    source: snapshot.source,
    verified_at_ms: snapshot.verifiedAtMs,
  };
}

/** The inverse of `snapshotToJson`; undefined for anything that is not a well-formed snapshot. */
export function snapshotFromJson(value: unknown): EntitlementSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  const plan = value.plan;
  const appUserId = textOrNull(value.app_user_id);
  const productId = textOrNull(value.product_id);
  const verifiedAtMs = msOrNull(value.verified_at_ms);
  const source = value.source;
  if (!STATUSES.includes(status as EntitlementStatus)) return undefined;
  if (!PLANS.includes(plan as EntitlementPlan)) return undefined;
  if (appUserId === null || productId === null || verifiedAtMs === null) return undefined;
  if (source !== 'WEBHOOK' && source !== 'RECONCILIATION') return undefined;
  return {
    status: status as EntitlementStatus,
    plan: plan as EntitlementPlan,
    productId,
    pendingProductId: textOrNull(value.pending_product_id),
    store: textOrNull(value.store),
    periodType: textOrNull(value.period_type),
    appUserId,
    originalAppUserId: textOrNull(value.original_app_user_id),
    purchasedAtMs: msOrNull(value.purchased_at_ms),
    expiresAtMs: msOrNull(value.expires_at_ms),
    gracePeriodExpiresAtMs: msOrNull(value.grace_period_expires_at_ms),
    entitledUntilMs: msOrNull(value.entitled_until_ms),
    willRenew: value.will_renew === true,
    unsubscribeDetectedAtMs: msOrNull(value.unsubscribe_detected_at_ms),
    billingIssueDetectedAtMs: msOrNull(value.billing_issue_detected_at_ms),
    originalTransactionId: textOrNull(value.original_transaction_id),
    latestTransactionId: textOrNull(value.latest_transaction_id),
    latestEventId: textOrNull(value.latest_event_id),
    latestEventType: textOrNull(value.latest_event_type),
    latestEventAtMs: msOrNull(value.latest_event_at_ms),
    source,
    verifiedAtMs,
  };
}
