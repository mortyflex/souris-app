// Souris — expo-sqlite binding of the SourisDatabase boundary
//
// Only the application root opens the real device database. Tests never
// import this module.

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SourisDatabase, SqlParams, SqlRunResult } from './database';

export const SOURIS_DATABASE_NAME = 'souris.db';

function bind(params: SqlParams | undefined) {
  return params ? [...params] : [];
}

export function wrapSqliteDatabase(native: SQLiteDatabase): SourisDatabase {
  return {
    execSync: (sql) => native.execSync(sql),
    runSync: (sql, params): SqlRunResult => ({
      changes: native.runSync(sql, bind(params)).changes,
    }),
    getAllSync: (sql, params) => native.getAllSync(sql, bind(params)),
    getFirstSync: (sql, params) => native.getFirstSync(sql, bind(params)),
    withTransactionSync: (task) => native.withTransactionSync(task),
    isInTransactionSync: () => native.isInTransactionSync(),
    closeSync: () => native.closeSync(),
  };
}

/** Opens (or creates) the device database with the connection settings Souris relies on. */
export function openSourisDatabase(): SourisDatabase {
  const native = openDatabaseSync(SOURIS_DATABASE_NAME);
  native.execSync('PRAGMA journal_mode = WAL;');
  native.execSync('PRAGMA foreign_keys = ON;');
  return wrapSqliteDatabase(native);
}
