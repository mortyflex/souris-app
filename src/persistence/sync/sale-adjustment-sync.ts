// BeautIzzy — rollout safety and conflict state of SALE_ADJUSTMENT (schema v18)
//
// CLOUD_SYNC.md §28. Two concerns, both local reads / writes of bookkeeping:
//
//   1. Remote readiness. A remote proves it stores sale adjustments when a
//      pull answers with the `sale_adjustments` family (the key present, even
//      empty) — the proof that supabase/migrations/20261011120000_create_sale_adjustments.sql
//      is applied. Until a pull or a restore has seen it, the push worker
//      DEFERS every SALE_ADJUSTMENT entry: nothing is sent, nothing is
//      acknowledged, the entry stays pending with `REMOTE_SCHEMA_PENDING` and
//      the bounded backoff. Money must never be "acknowledged" by a remote
//      that would drop it, and an unmigrated remote rejects the type anyway.
//
//   2. Server refusal. The remote enforces the refund ceilings at its
//      transaction boundary; a write that would break them (two devices
//      refunding the same Sale offline) is answered `ADJUSTMENT_CONFLICT` and
//      NOTHING is written there. The device keeps its record, the entry stays
//      pending with `last_error = ADJUSTMENT_CONFLICT`, and the record reads
//      « Refusé par le serveur » — never as synchronized. It is resolved
//      explicitly, by what REALLY happened: money not returned → the refused
//      record is voided (the one case where a SETTLED record may be voided — it
//      never became authoritative); money returned → it is voided AND an
//      exceptional outflow (`<id>-outflow`, outside the Sale's ceiling) records
//      the money that left (stores/sale-adjustments.ts `recordStoredSaleRefundOutflow`).

import type { SourisDatabase } from '../database';
import { readMetadata, writeMetadata } from '../metadata';

export const SALE_ADJUSTMENT_REMOTE_KEY = 'sync_remote_sale_adjustments';
export const ADJUSTMENT_CONFLICT_ERROR = 'ADJUSTMENT_CONFLICT';

/** Shared with the service catalogue deferral (service-catalogue-sync.ts). */
const REMOTE_SCHEMA_PENDING_ERROR = 'REMOTE_SCHEMA_PENDING';

export function isSaleAdjustmentRemoteReady(db: SourisDatabase): boolean {
  return readMetadata(db, SALE_ADJUSTMENT_REMOTE_KEY) === '1';
}

/** Records the proof once; deferred adjustment entries become eligible at once. */
export function markSaleAdjustmentRemoteReady(db: SourisDatabase): void {
  if (isSaleAdjustmentRemoteReady(db)) return;
  writeMetadata(db, SALE_ADJUSTMENT_REMOTE_KEY, '1');
  db.runSync(
    "UPDATE sync_outbox SET next_attempt_at = NULL WHERE aggregate_type = 'SALE_ADJUSTMENT' AND last_error = ?",
    [REMOTE_SCHEMA_PENDING_ERROR],
  );
}

/**
 * Where a local adjustment stands with the remote, as the UI may say it:
 *   SYNCED        acknowledged by the remote, nothing pending
 *   PENDING       a local change waits to be sent (offline, deferred, retried)
 *   REFUSED       the remote refused it (ceiling) — it is NOT authoritative
 *   LOCAL_ONLY    this device does not synchronize (no binding, no outbox entry, no ack)
 */
export type SaleAdjustmentSyncState = 'SYNCED' | 'PENDING' | 'REFUSED' | 'LOCAL_ONLY';

export function readSaleAdjustmentSyncStates(db: SourisDatabase): ReadonlyMap<string, SaleAdjustmentSyncState> {
  const states = new Map<string, SaleAdjustmentSyncState>();
  for (const row of db.getAllSync<{ readonly aggregate_id: string }>(
    "SELECT aggregate_id FROM sync_state WHERE aggregate_type = 'SALE_ADJUSTMENT'",
  )) {
    states.set(row.aggregate_id, 'SYNCED');
  }
  for (const row of db.getAllSync<{ readonly aggregate_id: string; readonly last_error: string | null }>(
    "SELECT aggregate_id, last_error FROM sync_outbox WHERE aggregate_type = 'SALE_ADJUSTMENT'",
  )) {
    states.set(row.aggregate_id, row.last_error === ADJUSTMENT_CONFLICT_ERROR ? 'REFUSED' : 'PENDING');
  }
  return states;
}

/**
 * The remote refused this record and never acknowledged ANY revision of it:
 * it exists only on this device. The one state in which a SETTLED record may
 * be voided (domain `voidSaleAdjustment`, `serverRefused`).
 */
export function isSaleAdjustmentServerRefused(db: SourisDatabase, adjustmentId: string): boolean {
  const refused = db.getFirstSync<{ readonly found: number }>(
    "SELECT 1 AS found FROM sync_outbox WHERE aggregate_type = 'SALE_ADJUSTMENT' AND aggregate_id = ? AND last_error = ?",
    [adjustmentId, ADJUSTMENT_CONFLICT_ERROR],
  );
  if (!refused) return false;
  const acknowledged = db.getFirstSync<{ readonly found: number }>(
    "SELECT 1 AS found FROM sync_state WHERE aggregate_type = 'SALE_ADJUSTMENT' AND aggregate_id = ?",
    [adjustmentId],
  );
  return acknowledged === null;
}
