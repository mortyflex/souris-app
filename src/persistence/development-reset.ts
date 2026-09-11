// Souris — development-only data reset
//
// Wipes every persisted record AND the seed marker in one transaction, so
// the next bootstrap runs the first-run seed again. The schema (and its
// version) is kept: this is a data reset, not a reinstall. Guarded by
// `__DEV__`; production builds cannot reach it.

import type { SourisDatabase } from './database';
import { deleteMetadata } from './metadata';
import { SOURIS_TABLES } from './schema';
import { SEED_VERSION_KEY } from './seed';

export function clearPersistedDataForDevelopment(db: SourisDatabase): void {
  if (!__DEV__) {
    throw new Error('clearPersistedDataForDevelopment is available in development builds only');
  }
  db.withTransactionSync(() => {
    for (const table of SOURIS_TABLES) {
      db.runSync(`DELETE FROM ${table}`);
    }
    deleteMetadata(db, SEED_VERSION_KEY);
  });
}
