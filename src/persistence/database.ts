// Souris — local database boundary
//
// The ONE synchronous SQL surface every persistence module writes against.
// Production binds it to expo-sqlite (see expo-database.ts); tests bind it to
// an in-memory `node:sqlite` database (see testing/). Nothing above this
// module knows which engine is behind the connection.

export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlRunResult {
  readonly changes: number;
}

export interface SourisDatabase {
  execSync(sql: string): void;
  runSync(sql: string, params?: SqlParams): SqlRunResult;
  getAllSync<Row extends object>(sql: string, params?: SqlParams): Row[];
  getFirstSync<Row extends object>(sql: string, params?: SqlParams): Row | null;
  /** Runs `task` inside BEGIN … COMMIT, rolling back when it throws. */
  withTransactionSync(task: () => void): void;
  isInTransactionSync(): boolean;
  closeSync(): void;
}

/**
 * Transaction boundary that tolerates nesting: an operation already running
 * inside a transaction (seed, Sale completion) simply joins it, while a
 * standalone call gets its own atomic BEGIN … COMMIT.
 */
export function runInTransaction(db: SourisDatabase, task: () => void): void {
  if (db.isInTransactionSync()) {
    task();
    return;
  }
  db.withTransactionSync(task);
}
