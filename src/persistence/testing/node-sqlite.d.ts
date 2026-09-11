// Minimal typing for Node's built-in SQLite (test-only). The project keeps
// `types: ["jest"]` in tsconfig, so @types/node is intentionally not loaded.
declare module 'node:sqlite' {
  type SQLInputValue = null | number | bigint | string | Uint8Array;
  interface StatementResultingChanges {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  }
  interface StatementSync {
    run(...params: SQLInputValue[]): StatementResultingChanges;
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
  }
  class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
