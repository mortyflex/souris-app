// Souris — test database (Node built-in SQLite)
//
// Jest runs on Node, where `node:sqlite` provides a real SQLite engine with
// no extra dependency. Every test opens its own in-memory database, so
// suites never share state and never touch a developer device database.
// This module is never imported by application code.

import { DatabaseSync } from 'node:sqlite';

import type { SourisDatabase, SqlParams, SqlRunResult } from '../database';

function bind(params: SqlParams | undefined): (string | number | null)[] {
  return params ? [...params] : [];
}

export function wrapNodeDatabase(native: DatabaseSync): SourisDatabase {
  let inTransaction = false;
  return {
    execSync: (sql) => native.exec(sql),
    runSync: (sql, params): SqlRunResult => {
      const result = native.prepare(sql).run(...bind(params));
      return { changes: Number(result.changes) };
    },
    getAllSync: <Row extends object>(sql: string, params?: SqlParams) =>
      native.prepare(sql).all(...bind(params)) as Row[],
    getFirstSync: <Row extends object>(sql: string, params?: SqlParams) =>
      (native.prepare(sql).get(...bind(params)) as Row | undefined) ?? null,
    withTransactionSync: (task) => {
      native.exec('BEGIN');
      inTransaction = true;
      try {
        task();
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    isInTransactionSync: () => inTransaction,
    closeSync: () => native.close(),
  };
}

/** A fresh, empty in-memory database with foreign keys enforced — no schema yet. */
export function openTestDatabase(): SourisDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON');
  return wrapNodeDatabase(native);
}
