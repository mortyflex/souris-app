// BeautIzzy — rollout safety of the service catalogue fields (schema v17)
//
// Service categories and descriptions need a remote that knows them
// (supabase/migrations/20261010120000_add_service_categories_and_descriptions.sql).
// Two rules make the build that writes them safe in front of a remote that is
// not migrated yet, and for a device upgraded from a build that predates them
// (CLOUD_SYNC.md §27).
//
//   1. Remote readiness. A remote proves it knows the catalogue fields when a
//      pull answers with the `service_categories` family (the key is present,
//      even empty). Until a pull or a restore has seen that proof, the push
//      worker DEFERS every write that the old functions would lose silently:
//      any SERVICE_CATEGORY entry (an old remote rejects the type), and a
//      SERVICE upsert carrying a category or a description (an old remote
//      would drop the two keys and still acknowledge the write). A deferred
//      entry stays pending — nothing is sent, nothing acknowledged — with the
//      `REMOTE_SCHEMA_PENDING` code and the usual bounded backoff; the first
//      proof clears that backoff so it goes with the next run. A SERVICE
//      write without the new fields keeps syncing as always, so an
//      unmigrated remote never stalls the existing catalogue.
//
//   2. One-time refresh. Schema v17 arms `sync_service_catalogue_refresh` and
//      clears the pull cursor. While armed, the pull re-applies a SERVICE
//      revision EQUAL to the one this device acknowledged, when nothing is
//      pending for it — exactly the state the device already had, plus the
//      fields its previous build could not store. The first complete pull
//      that finishes disarms it.
//
// The flags live in `souris_metadata`; the development reset clears them.

import type { SourisDatabase } from '../database';
import { deleteMetadata, readMetadata, writeMetadata } from '../metadata';

import type { SyncAggregateRef, SyncOperation } from './aggregate';
import type { RemoteAggregatePayload, RemoteServicePayload } from './remote-gateway';

export const SERVICE_CATALOGUE_REMOTE_KEY = 'sync_remote_service_catalogue';
export const SERVICE_CATALOGUE_REFRESH_KEY = 'sync_service_catalogue_refresh';
export const REMOTE_SCHEMA_PENDING_ERROR = 'REMOTE_SCHEMA_PENDING';

export function isServiceCatalogueRemoteReady(db: SourisDatabase): boolean {
  return readMetadata(db, SERVICE_CATALOGUE_REMOTE_KEY) === '1';
}

/** Records the proof once; deferred entries become eligible at once. */
export function markServiceCatalogueRemoteReady(db: SourisDatabase): void {
  if (isServiceCatalogueRemoteReady(db)) return;
  writeMetadata(db, SERVICE_CATALOGUE_REMOTE_KEY, '1');
  db.runSync('UPDATE sync_outbox SET next_attempt_at = NULL WHERE last_error = ?', [REMOTE_SCHEMA_PENDING_ERROR]);
}

/** Whether pushing this entry to a remote without the catalogue fields would lose data. */
export function requiresServiceCatalogueRemote(
  ref: SyncAggregateRef,
  operation: SyncOperation,
  payload: RemoteAggregatePayload | undefined,
): boolean {
  if (ref.aggregateType === 'SERVICE_CATEGORY') return true;
  if (ref.aggregateType !== 'SERVICE' || operation !== 'UPSERT' || payload === undefined) return false;
  const service = payload as RemoteServicePayload;
  return (service.category_id ?? null) !== null || (service.description ?? null) !== null;
}

export function isServiceCatalogueRefreshArmed(db: SourisDatabase): boolean {
  return readMetadata(db, SERVICE_CATALOGUE_REFRESH_KEY) !== undefined;
}

export function disarmServiceCatalogueRefresh(db: SourisDatabase): void {
  deleteMetadata(db, SERVICE_CATALOGUE_REFRESH_KEY);
}
