// Souris — migration runner
//
// Deterministic and transactional: every pending migration runs in its own
// transaction together with the `user_version` bump, so a crash mid-way
// leaves the database at the last fully applied version. Re-running is a
// no-op. A database newer than this build is refused rather than wiped.

import type { SourisDatabase } from './database';
import { CURRENT_SCHEMA_VERSION, migrations } from './schema';

interface UserVersionRow {
  readonly user_version: number;
}

export function readSchemaVersion(db: SourisDatabase): number {
  return db.getFirstSync<UserVersionRow>('PRAGMA user_version')?.user_version ?? 0;
}

export function migrateDatabase(db: SourisDatabase): number {
  const installed = readSchemaVersion(db);
  if (installed > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Souris database schema v${installed} is newer than the supported v${CURRENT_SCHEMA_VERSION}`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= installed) continue;
    db.withTransactionSync(() => {
      migration.up(db);
      db.execSync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return readSchemaVersion(db);
}
