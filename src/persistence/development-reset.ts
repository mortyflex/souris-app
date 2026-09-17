// Souris — development-only data reset
//
// Wipes every persisted record, the local sync bookkeeping (pending outbox
// intents, acknowledged remote revisions, the first-sync decision and any
// initial-upload approval describe rows that no longer exist after the wipe) AND the seed marker in one
// transaction, so the next bootstrap runs the first-run seed again and the
// next sync run classifies both sides again instead of pushing development
// fixtures under a stale decision or a stale approval. The schema (and its version) and
// the account binding are kept: this is a data reset, not a reinstall.
// Guarded by `__DEV__`; production builds cannot reach it.

import type { SourisDatabase } from './database';
import { deleteMetadata } from './metadata';
import { SOURIS_TABLES, SYNC_TABLES } from './schema';
import { SEED_VERSION_KEY } from './seed';
import { SYNC_BOOTSTRAP_KEY, SYNC_INITIAL_UPLOAD_APPROVAL_KEY } from './sync/bootstrap';

export function clearPersistedDataForDevelopment(db: SourisDatabase): void {
  if (!__DEV__) {
    throw new Error('clearPersistedDataForDevelopment is available in development builds only');
  }
  db.withTransactionSync(() => {
    for (const table of [...SOURIS_TABLES, ...SYNC_TABLES]) {
      db.runSync(`DELETE FROM ${table}`);
    }
    deleteMetadata(db, SEED_VERSION_KEY);
    deleteMetadata(db, SYNC_BOOTSTRAP_KEY);
    deleteMetadata(db, SYNC_INITIAL_UPLOAD_APPROVAL_KEY);
  });
}
