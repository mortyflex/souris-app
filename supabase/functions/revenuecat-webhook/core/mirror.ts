// BeautIzzy — Plus entitlement mirror: the mirror port and its Supabase binding
//
// The webhook's ONLY database surface. Every call goes through the
// `subscription_*` functions of 20261004120000_create_subscription_entitlements.sql
// under the service role; no table is read or written directly, so matching,
// idempotence, the ordering guard and the atomicity of history + snapshot stay
// in the database. Instants travel as Unix milliseconds in both directions.

import {
  snapshotFromJson,
  snapshotToJson,
  type EntitlementSnapshot,
  type SubscriptionEnvironment,
} from './entitlement-snapshot.ts';

/** What the mirror knows about a subscriber in ONE environment: every granting-source row. */
export interface MirrorRead {
  /** The matched Supabase user; null when no App User ID is an existing user. */
  readonly userId: string | null;
  readonly businessId: string | null;
  readonly matchedAppUserId: string | null;
  /** One row per product granting the entitlement in that environment; empty when none. */
  readonly snapshots: readonly EntitlementSnapshot[];
}

/** The row of one product among the rows read, if any. */
export function findSnapshot(snapshots: readonly EntitlementSnapshot[], productId: string): EntitlementSnapshot | null {
  return snapshots.find((snapshot) => snapshot.productId === productId) ?? null;
}

/** One row write an event produced — for ONE product — with the optimistic guard it was computed against. */
export interface SnapshotWrite {
  readonly userId: string;
  readonly environment: SubscriptionEnvironment;
  readonly productId: string;
  readonly expectedLatestEventId: string | null;
  readonly snapshot: EntitlementSnapshot;
}

export type EventOutcome = 'APPLIED' | 'STALE' | 'IGNORED' | 'UNMATCHED' | 'UNSUPPORTED';

/** The history row of one received event (columns of `subscription_events`). */
export interface SubscriptionEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly appId: string | null;
  readonly environment: SubscriptionEnvironment | null;
  readonly store: string | null;
  readonly appUserId: string | null;
  readonly originalAppUserId: string | null;
  readonly aliases: readonly string[];
  readonly userId: string | null;
  readonly productId: string | null;
  readonly entitlementIds: readonly string[] | null;
  readonly eventAtMs: number;
  readonly purchasedAtMs: number | null;
  readonly expiresAtMs: number | null;
  readonly transactionId: string | null;
  readonly originalTransactionId: string | null;
  readonly outcome: EventOutcome;
  readonly outcomeDetail: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type ApplyEventResult =
  | { readonly status: 'DUPLICATE' }
  | { readonly status: EventOutcome; readonly applied: number };

export type ApplyReconciliationResult = 'APPLIED' | 'STALE';

export interface SubscriptionMirror {
  readMirror(appUserIds: readonly string[], environment: SubscriptionEnvironment): Promise<MirrorRead>;
  /** Records the event (idempotent on its id) and applies the writes atomically; rejects when the guard fails. */
  applyEvent(record: SubscriptionEventRecord, writes: readonly SnapshotWrite[]): Promise<ApplyEventResult>;
  /** Replaces the row of ONE product with the REST API state, unless that row was confirmed later. */
  applyReconciliation(
    userId: string,
    environment: SubscriptionEnvironment,
    productId: string,
    snapshot: EntitlementSnapshot,
  ): Promise<ApplyReconciliationResult>;
}

/** The slice of a supabase-js client this adapter needs (privileged server client). */
export interface SubscriptionRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function eventRecordToJson(record: SubscriptionEventRecord): Record<string, unknown> {
  return {
    event_id: record.eventId,
    event_type: record.eventType,
    app_id: record.appId,
    environment: record.environment,
    store: record.store,
    app_user_id: record.appUserId,
    original_app_user_id: record.originalAppUserId,
    aliases: record.aliases,
    user_id: record.userId,
    product_id: record.productId,
    entitlement_ids: record.entitlementIds,
    event_at_ms: record.eventAtMs,
    purchased_at_ms: record.purchasedAtMs,
    expires_at_ms: record.expiresAtMs,
    transaction_id: record.transactionId,
    original_transaction_id: record.originalTransactionId,
    outcome: record.outcome,
    outcome_detail: record.outcomeDetail,
    payload: record.payload,
  };
}

export function snapshotWriteToJson(write: SnapshotWrite): Record<string, unknown> {
  return {
    user_id: write.userId,
    environment: write.environment,
    product_id: write.productId,
    expected_latest_event_id: write.expectedLatestEventId,
    snapshot: snapshotToJson(write.snapshot),
  };
}

const OUTCOMES: readonly EventOutcome[] = ['APPLIED', 'STALE', 'IGNORED', 'UNMATCHED', 'UNSUPPORTED'];

export function createSupabaseSubscriptionMirror(client: SubscriptionRpcClient): SubscriptionMirror {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      // The database message names the function, never a payload or a key.
      throw new Error(`subscriptions: ${fn} failed: ${error.message}`);
    }
    return data;
  }

  return {
    async readMirror(appUserIds, environment) {
      const data = await call('subscription_read_mirror', {
        p_app_user_ids: [...appUserIds],
        p_environment: environment,
      });
      if (!isRecord(data)) throw new Error('subscriptions: subscription_read_mirror answered no object');
      return {
        userId: textOrNull(data.user_id),
        businessId: textOrNull(data.business_id),
        matchedAppUserId: textOrNull(data.matched_app_user_id),
        snapshots: Array.isArray(data.snapshots)
          ? data.snapshots.flatMap((row) => {
              const snapshot = snapshotFromJson(row);
              return snapshot === undefined ? [] : [snapshot];
            })
          : [],
      };
    },

    async applyEvent(record, writes) {
      const data = await call('subscription_apply_revenuecat_event', {
        p_event: eventRecordToJson(record),
        p_writes: writes.map(snapshotWriteToJson),
      });
      if (!isRecord(data)) throw new Error('subscriptions: subscription_apply_revenuecat_event answered no object');
      if (data.status === 'DUPLICATE') return { status: 'DUPLICATE' };
      const status = data.status;
      if (!OUTCOMES.includes(status as EventOutcome)) {
        throw new Error('subscriptions: subscription_apply_revenuecat_event answered an unknown status');
      }
      return { status: status as EventOutcome, applied: typeof data.applied === 'number' ? data.applied : 0 };
    },

    async applyReconciliation(userId, environment, productId, snapshot) {
      const data = await call('subscription_apply_reconciliation', {
        p_user_id: userId,
        p_environment: environment,
        p_product_id: productId,
        p_snapshot: snapshotToJson(snapshot),
      });
      if (!isRecord(data) || (data.status !== 'APPLIED' && data.status !== 'STALE')) {
        throw new Error('subscriptions: subscription_apply_reconciliation answered an unknown status');
      }
      return data.status;
    },
  };
}
