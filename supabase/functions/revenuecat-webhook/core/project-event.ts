// BeautIzzy — Plus entitlement mirror: ONE RevenueCat event → the mirror's decision — pure
//
// THE rule turning a webhook event into an outcome and the row writes it
// produces, given what the mirror already knows. It never reads a clock, a
// database or the network; the handler reads the mirror first and passes the
// reads in. The rules, in order:
//
//   TEST                                   IGNORED  (a dashboard test)
//   app_id outside the allowed list        IGNORED  (another RevenueCat app); no app_id passes
//   TRANSFER                               see below
//   an unknown event type                  UNSUPPORTED (recorded, nothing applied)
//   no matching Supabase user              UNMATCHED   (recorded for a manual reconciliation)
//   no environment, no product             IGNORED  (the mirror is per environment and per product)
//   entitlement_ids without `plus`         IGNORED  (a product not mapped to Plus)
//   older than the row's last event        STALE    (never applied — a delayed delivery)
//   EXPIRATION of an earlier expiration    STALE    (a later renewal or grant of the SAME product is known)
//   a store purchase without expiration    IGNORED  (no evidence of an indefinite grant)
//   otherwise                              APPLIED  (the row of the event's product; see the exception below)
//
// A row is ONE granting product. Every RevenueCat event is about one product,
// so it rewrites that product's row and no other: an Apple expiration never
// touches a complimentary grant, a grant's end never touches a paid
// subscription, and effective access is derived from all rows by the server
// (`subscription_has_plus_access`), never from the last event heard.
//
// The row is computed from the event's AUTHORITATIVE fields — expiration,
// period type, store, grace end — never from the event name alone:
//
//   CANCELLATION     paid: auto-renewal off, the access STAYS until the
//                    expiration (CANCELLED_ACTIVE) — a cancellation is not an
//                    expiration. PROMOTIONAL: a revocation — RevenueCat ends
//                    "all active promotional grants for that entitlement
//                    immediately" and emits CANCELLATION — so EVERY
//                    promotional row of the user in that environment is
//                    EXPIRED at the event instant (the one exception to
//                    "one event, one row")
//   BILLING_ISSUE    the store failed to charge and keeps retrying; the access
//                    stays until the later of the expiration and the store's
//                    grace end (BILLING_RETRY) — not a loss of entitlement
//   PRODUCT_CHANGE   announces the product of the NEXT period; the current
//                    period, product and access stay (pending product kept)
//   EXPIRATION       the confirmed end of THIS product (expired, refunded,
//                    a dated grant reaching its end)
//   PROMOTIONAL      a complimentary grant (NON_RENEWING_PURCHASE, production,
//                    store and period PROMOTIONAL); without an expiration it
//                    has no end. A second grant of the SAME product never
//                    shortens the row: the later end is kept (RevenueCat keeps
//                    both grants and grants until the latest)
//
// Whatever the type, an access whose end is already behind the event instant
// reads EXPIRED: nothing in force is ever written for a period that is over.
//
// TRANSFER moves a subscriber's STORE purchases to another subscriber: the
// transferred-FROM users lose their mirrored store rows at once (EXPIRED,
// "transferred") — promotional grants belong to the account and stay; the
// transferred-TO users receive NO invented row — the event carries no product
// or expiration — and are listed for reconciliation, which fetches their real
// state when the secret API key is configured.
//
// Sandbox and production never meet: the subject is read and written in the
// event's environment only.

import {
  PLUS_ENTITLEMENT_IDENTIFIER,
  planFromProductIdentifier,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type SubscriptionEnvironment,
} from './entitlement-snapshot.ts';
import { findSnapshot, type EventOutcome, type MirrorRead, type SnapshotWrite } from './mirror.ts';
import {
  isLifecycleEventType,
  TEST_EVENT_TYPE,
  TRANSFER_EVENT_TYPE,
  type LifecycleEventType,
  type RevenueCatEvent,
} from './revenuecat-event.ts';

export interface EventContext {
  /** The mirror read for the event's subscriber in the event's environment (lifecycle events). */
  readonly subject?: MirrorRead;
  /** TRANSFER: the reads for the transferred-from and transferred-to subscribers, in the event's environment. */
  readonly transferredFrom?: readonly MirrorRead[];
  readonly transferredTo?: readonly MirrorRead[];
  readonly allowedAppIds?: readonly string[];
}

export interface EventDecision {
  readonly outcome: EventOutcome;
  readonly detail: string | null;
  /** The matched user the history row is attributed to, when one. */
  readonly userId: string | null;
  readonly writes: readonly SnapshotWrite[];
  /** The App User IDs whose real state should be fetched afterwards (reconciliation). */
  readonly reconcile: readonly string[];
}

function decision(
  outcome: EventOutcome,
  detail: string | null,
  userId: string | null = null,
  writes: readonly SnapshotWrite[] = [],
  reconcile: readonly string[] = [],
): EventDecision {
  return { outcome, detail, userId, writes, reconcile };
}

export function isPromotionalEvent(event: Pick<RevenueCatEvent, 'store' | 'periodType'>): boolean {
  return event.store === 'PROMOTIONAL' || event.periodType === 'PROMOTIONAL';
}

function isPromotionalSnapshot(snapshot: EntitlementSnapshot): boolean {
  return snapshot.store === 'PROMOTIONAL' || snapshot.periodType === 'PROMOTIONAL';
}

function laterOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** The end of a grant that joins an earlier grant of the same product still in force: the later one; no end wins. */
function extendedEnd(eventEnd: number | null, previous: EntitlementSnapshot | null, eventAtMs: number): number | null {
  if (previous === null || previous.status !== 'COMPLIMENTARY') return eventEnd;
  if (previous.entitledUntilMs !== null && previous.entitledUntilMs <= eventAtMs) return eventEnd;
  if (eventEnd === null || previous.entitledUntilMs === null) return null;
  return Math.max(eventEnd, previous.entitledUntilMs);
}

/** The row an event leaves for its product, given the previous row of that product. */
export function projectLifecycleSnapshot(
  type: LifecycleEventType,
  event: RevenueCatEvent,
  previous: EntitlementSnapshot | null,
  matchedAppUserId: string,
  productId: string,
): EntitlementSnapshot {
  const promotional = isPromotionalEvent(event);
  const base = {
    plan: planFromProductIdentifier(productId),
    productId,
    pendingProductId: previous?.pendingProductId ?? null,
    store: event.store ?? previous?.store ?? null,
    periodType: event.periodType ?? null,
    appUserId: matchedAppUserId,
    originalAppUserId: event.originalAppUserId,
    purchasedAtMs: event.purchasedAtMs ?? previous?.purchasedAtMs ?? null,
    expiresAtMs: event.expiresAtMs,
    gracePeriodExpiresAtMs: previous?.gracePeriodExpiresAtMs ?? null,
    unsubscribeDetectedAtMs: previous?.unsubscribeDetectedAtMs ?? null,
    billingIssueDetectedAtMs: previous?.billingIssueDetectedAtMs ?? null,
    originalTransactionId: event.originalTransactionId ?? previous?.originalTransactionId ?? null,
    latestTransactionId: event.transactionId ?? previous?.latestTransactionId ?? null,
    latestEventId: event.id,
    latestEventType: type,
    latestEventAtMs: event.eventAtMs,
    source: 'WEBHOOK' as const,
    verifiedAtMs: event.eventAtMs,
  };

  if (type === 'EXPIRATION' || (type === 'CANCELLATION' && promotional)) {
    // A confirmed end of this product; a promotional CANCELLATION is a
    // revocation, effective at once.
    const end = type === 'EXPIRATION' ? (event.expiresAtMs ?? event.eventAtMs) : event.eventAtMs;
    return {
      ...base,
      status: 'EXPIRED',
      entitledUntilMs: end,
      willRenew: false,
    };
  }

  let status: EntitlementStatus;
  let willRenew: boolean;
  let entitledUntilMs = event.expiresAtMs;
  let { gracePeriodExpiresAtMs, unsubscribeDetectedAtMs, billingIssueDetectedAtMs, pendingProductId } = base;

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
      // A fresh or renewed period: every earlier trouble is behind.
      willRenew = !promotional;
      unsubscribeDetectedAtMs = null;
      billingIssueDetectedAtMs = null;
      gracePeriodExpiresAtMs = null;
      if (type === 'RENEWAL' || type === 'INITIAL_PURCHASE') pendingProductId = null;
      status = event.periodType === 'TRIAL' ? 'TRIAL' : 'ACTIVE';
      break;
    case 'NON_RENEWING_PURCHASE':
      willRenew = false;
      unsubscribeDetectedAtMs = null;
      billingIssueDetectedAtMs = null;
      gracePeriodExpiresAtMs = null;
      status = 'ACTIVE';
      break;
    case 'PRODUCT_CHANGE':
      // The change takes effect at the next renewal; the current period stays.
      willRenew = !promotional;
      unsubscribeDetectedAtMs = null;
      pendingProductId = event.newProductId;
      status = event.periodType === 'TRIAL' ? 'TRIAL' : 'ACTIVE';
      if (billingIssueDetectedAtMs !== null) {
        status = 'BILLING_RETRY';
        entitledUntilMs = laterOf(entitledUntilMs, gracePeriodExpiresAtMs);
      }
      break;
    case 'CANCELLATION':
      willRenew = false;
      unsubscribeDetectedAtMs = event.eventAtMs;
      status = 'CANCELLED_ACTIVE';
      break;
    case 'BILLING_ISSUE':
      willRenew = previous?.willRenew ?? !promotional;
      billingIssueDetectedAtMs = event.eventAtMs;
      gracePeriodExpiresAtMs = event.gracePeriodExpiresAtMs;
      status = 'BILLING_RETRY';
      entitledUntilMs = laterOf(entitledUntilMs, gracePeriodExpiresAtMs);
      break;
  }

  if (promotional) {
    status = 'COMPLIMENTARY';
    willRenew = false;
    // A further grant of the same product joins the one in force: the later end wins.
    entitledUntilMs = extendedEnd(entitledUntilMs, previous, event.eventAtMs);
  }
  // Nothing in force is written for a period already over at the event instant.
  if (entitledUntilMs !== null && entitledUntilMs <= event.eventAtMs) status = 'EXPIRED';

  return {
    ...base,
    pendingProductId,
    gracePeriodExpiresAtMs,
    unsubscribeDetectedAtMs,
    billingIssueDetectedAtMs,
    status,
    willRenew,
    entitledUntilMs,
  };
}

/** The write that ends one row at `eventAtMs`, attributed to `event`. */
function revokedWrite(
  userId: string,
  environment: SubscriptionEnvironment,
  row: EntitlementSnapshot,
  event: RevenueCatEvent,
  type: string,
): SnapshotWrite {
  return {
    userId,
    environment,
    productId: row.productId,
    expectedLatestEventId: row.latestEventId,
    snapshot: {
      ...row,
      status: 'EXPIRED',
      entitledUntilMs: row.entitledUntilMs !== null && row.entitledUntilMs < event.eventAtMs ? row.entitledUntilMs : event.eventAtMs,
      willRenew: false,
      latestEventId: event.id,
      latestEventType: type,
      latestEventAtMs: event.eventAtMs,
      source: 'WEBHOOK',
      verifiedAtMs: event.eventAtMs,
    },
  };
}

/** Whether `row` may still be rewritten by an event at `eventAtMs`: in force, and not already past a later event. */
function isRevocable(row: EntitlementSnapshot, eventAtMs: number): boolean {
  if (row.status === 'EXPIRED') return false;
  return row.latestEventAtMs === null || eventAtMs >= row.latestEventAtMs;
}

function projectTransfer(event: RevenueCatEvent, context: EventContext): EventDecision {
  const reconcile = [...new Set([...event.transferredFrom, ...event.transferredTo])];
  const environment = event.environment;
  const from = context.transferredFrom ?? [];
  const to = context.transferredTo ?? [];
  const userId = from.find((read) => read.userId !== null)?.userId ?? to.find((read) => read.userId !== null)?.userId ?? null;
  if (environment === null) {
    return decision('IGNORED', 'transfer without environment: left to the reconciliation', userId, [], reconcile);
  }
  const writes: SnapshotWrite[] = [];
  for (const read of from) {
    if (read.userId === null || read.matchedAppUserId === null) continue;
    for (const row of read.snapshots) {
      // Store purchases move with the receipt; a promotional grant belongs to the account and stays.
      if (isPromotionalSnapshot(row) || !isRevocable(row, event.eventAtMs)) continue;
      writes.push(revokedWrite(read.userId, environment, row, event, TRANSFER_EVENT_TYPE));
    }
  }
  if (writes.length === 0) {
    return decision('IGNORED', 'transfer: no mirrored store purchase to revoke; receivers left to the reconciliation', userId, [], reconcile);
  }
  return decision('APPLIED', 'store purchases transferred away; receivers left to the reconciliation', userId, writes, reconcile);
}

/** A promotional CANCELLATION revokes every promotional grant of the entitlement at once (RevenueCat's rule). */
function projectPromotionalRevocation(
  event: RevenueCatEvent,
  subject: MirrorRead,
  userId: string,
  matchedAppUserId: string,
  environment: SubscriptionEnvironment,
  productId: string,
): EventDecision {
  const writes: SnapshotWrite[] = [];
  let sawEventProduct = false;
  for (const row of subject.snapshots) {
    if (!isPromotionalSnapshot(row)) continue;
    if (row.productId === productId) sawEventProduct = true;
    if (!isRevocable(row, event.eventAtMs)) continue;
    writes.push(revokedWrite(userId, environment, row, event, event.type));
  }
  if (!sawEventProduct) {
    // The revoked grant was never mirrored: its end is recorded all the same.
    writes.push({
      userId,
      environment,
      productId,
      expectedLatestEventId: null,
      snapshot: projectLifecycleSnapshot('CANCELLATION', event, null, matchedAppUserId, productId),
    });
  }
  return decision('APPLIED', 'promotional grants revoked', userId, writes, [matchedAppUserId]);
}

export function projectRevenueCatEvent(event: RevenueCatEvent, context: EventContext): EventDecision {
  if (event.type === TEST_EVENT_TYPE) return decision('IGNORED', 'dashboard test event');
  const allowed = context.allowedAppIds ?? [];
  if (allowed.length > 0 && event.appId !== null && !allowed.includes(event.appId)) {
    return decision('IGNORED', 'app_id is not an allowed RevenueCat app');
  }
  if (event.type === TRANSFER_EVENT_TYPE) return projectTransfer(event, context);

  const subject = context.subject;
  const userId = subject?.userId ?? null;
  if (!isLifecycleEventType(event.type)) return decision('UNSUPPORTED', 'event type not interpreted by this phase', userId);
  if (subject === undefined || userId === null || subject.matchedAppUserId === null) {
    return decision('UNMATCHED', 'no App User ID is an existing Supabase user');
  }
  const environment: SubscriptionEnvironment | null = event.environment;
  if (environment === null) return decision('IGNORED', 'event without environment', userId);
  const productId = event.productId;
  if (productId === null) return decision('IGNORED', 'event without product', userId);
  if (event.entitlementIds === null || !event.entitlementIds.includes(PLUS_ENTITLEMENT_IDENTIFIER)) {
    return decision('IGNORED', 'product not mapped to the plus entitlement', userId);
  }

  const previous = findSnapshot(subject.snapshots, productId);
  if (previous !== null && previous.latestEventAtMs !== null && event.eventAtMs < previous.latestEventAtMs) {
    return decision('STALE', 'older than the latest applied event', userId, [], [subject.matchedAppUserId]);
  }
  if (
    event.type === 'EXPIRATION' &&
    previous !== null &&
    previous.status !== 'EXPIRED' &&
    previous.expiresAtMs !== null &&
    event.expiresAtMs !== null &&
    event.expiresAtMs < previous.expiresAtMs
  ) {
    return decision('STALE', 'expiration of an earlier period; a later renewal is known', userId, [], [subject.matchedAppUserId]);
  }
  if (event.type !== 'EXPIRATION' && !isPromotionalEvent(event) && event.expiresAtMs === null) {
    return decision('IGNORED', 'store purchase without an expiration', userId);
  }
  if (event.type === 'CANCELLATION' && isPromotionalEvent(event)) {
    return projectPromotionalRevocation(event, subject, userId, subject.matchedAppUserId, environment, productId);
  }

  const snapshot = projectLifecycleSnapshot(event.type, event, previous, subject.matchedAppUserId, productId);
  return decision(
    'APPLIED',
    null,
    userId,
    [{ userId, environment, productId, expectedLatestEventId: previous?.latestEventId ?? null, snapshot }],
    [subject.matchedAppUserId],
  );
}
