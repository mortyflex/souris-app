// BeautIzzy — the entitlement hold of the push pass (Cloud Sync, BeautIzzy Plus Phase 6.5C step 3)
//
// The server may refuse a business write for lack of a Plus entitlement —
// `sync_push_aggregate` answering `ENTITLEMENT_REQUIRED` (a future server
// step; the client is prepared here). That refusal is about the OWNER's
// subscription, never about one aggregate: every other write of the Business
// would be refused the same way, so there is nothing to gain from sending
// them. The push worker therefore records ONE hold per Business and sends no
// write while it lasts — the pull half of a run is unaffected, so a device
// without Plus keeps receiving what other devices (or the server) changed.
//
// The hold is bookkeeping, like the first-sync decision (bootstrap.ts): one
// `souris_metadata` row, naming the Business it was recorded for, trusted
// only for that Business, cleared by the development reset. It carries the
// number of consecutive refusals (the bounded backoff of the worker grows
// with it: 1, 2, 4 … 60 minutes), the instant of the last refusal and the
// instant the next attempt is allowed. The outbox entries themselves stay
// exactly as they are: payload, operation, revision, order — a hold is never
// a reason to settle, drop or rewrite a local change (CLOUD_SYNC.md §26).
//
// A hold ends in three ways: its backoff elapses (the worker tries ONE write
// again); the server accepts or answers anything else for a write of that
// Business (the worker clears it); or the application learns that Plus is
// back (the cloud sync runner LIFTS it — the record goes, and the entries the
// refusal had deferred become eligible at once — and runs, without assuming
// the server agrees: a refusal then records a fresh hold).

import { runInTransaction, type SourisDatabase } from '../database';
import { deleteMetadata, readMetadata, writeMetadata } from '../metadata';
import { fromSqlInstant, toSqlInstant } from '../values';

import { releaseSyncOutboxEntries } from './outbox';

/** The `last_error` the worker records on an entry whose push was refused for entitlement. */
export const ENTITLEMENT_REQUIRED_ERROR = 'ENTITLEMENT_REQUIRED';

/** `souris_metadata` key of the hold; cleared by the development reset. */
export const SYNC_ENTITLEMENT_HOLD_KEY = 'sync_entitlement_hold';

export interface SyncEntitlementHold {
  readonly businessId: string;
  /** Consecutive refusals recorded so far (>= 1). */
  readonly refusals: number;
  readonly refusedAt: Date;
  /** No write of the Business is sent before this instant (inclusive: at the instant, one is). */
  readonly nextAttemptAt: Date;
}

function isValidInstant(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/**
 * The hold recorded for THIS Business, or undefined. A record naming another
 * Business, or an unreadable value, is ignored — never inherited, never a
 * reason to hold anything.
 */
export function readSyncEntitlementHold(db: SourisDatabase, businessId: string): SyncEntitlementHold | undefined {
  const raw = readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const { businessId: storedId, refusals, refusedAt, nextAttemptAt } = parsed as Record<string, unknown>;
    if (storedId !== businessId) return undefined;
    if (typeof refusals !== 'number' || !Number.isInteger(refusals) || refusals < 1) return undefined;
    if (typeof refusedAt !== 'string' || typeof nextAttemptAt !== 'string') return undefined;
    const refused = fromSqlInstant(refusedAt);
    const next = fromSqlInstant(nextAttemptAt);
    if (!isValidInstant(refused) || !isValidInstant(next)) return undefined;
    return { businessId, refusals, refusedAt: refused, nextAttemptAt: next };
  } catch {
    return undefined;
  }
}

export function writeSyncEntitlementHold(db: SourisDatabase, hold: SyncEntitlementHold): void {
  if (!Number.isInteger(hold.refusals) || hold.refusals < 1) {
    throw new RangeError(`sync_entitlement_hold: refusals must be a positive integer, got ${hold.refusals}`);
  }
  writeMetadata(
    db,
    SYNC_ENTITLEMENT_HOLD_KEY,
    JSON.stringify({
      businessId: hold.businessId,
      refusals: hold.refusals,
      refusedAt: toSqlInstant(hold.refusedAt),
      nextAttemptAt: toSqlInstant(hold.nextAttemptAt),
    }),
  );
}

/** Removes the hold when it belongs to `businessId` (or is unreadable); another Business's hold is left alone. */
export function clearSyncEntitlementHold(db: SourisDatabase, businessId: string): void {
  const raw = readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY);
  if (raw === undefined) return;
  let storedId: unknown;
  try {
    const parsed: unknown = JSON.parse(raw);
    storedId = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).businessId : undefined;
  } catch {
    storedId = undefined;
  }
  if (storedId !== undefined && storedId !== businessId) return;
  deleteMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY);
}

/**
 * Plus is back (as far as the device knows): the hold of THIS Business is
 * removed and the entries its refusals deferred become eligible at once, in
 * ONE transaction — so the next run sends them, in order. Returns how many
 * entries were released. Nothing is settled, acknowledged or rewritten.
 */
export function liftSyncEntitlementHold(db: SourisDatabase, businessId: string): number {
  let released = 0;
  runInTransaction(db, () => {
    clearSyncEntitlementHold(db, businessId);
    released = releaseSyncOutboxEntries(db, businessId, ENTITLEMENT_REQUIRED_ERROR);
  });
  return released;
}

/** Whether a hold of THIS Business still forbids sending writes at `now`. Local read only. */
export function isSyncEntitlementHoldActive(db: SourisDatabase, businessId: string, now: Date): boolean {
  const hold = readSyncEntitlementHold(db, businessId);
  return hold !== undefined && now.getTime() < hold.nextAttemptAt.getTime();
}
