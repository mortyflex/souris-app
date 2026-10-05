// Souris — bulk Client insertion of the client import (fictional data)
//
// `insertClients` is the single-Client insert + CLIENT outbox mark repeated
// inside ONE transaction, refused on an unbound database, and retry-safe.

import type { Client } from '@/domain/clients';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { ClientBulkInsertUnboundError, insertClients, loadClients } from '../stores/clients';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { createTestSeed, REMOTE_BUSINESS_ID, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function openBoundDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ clients: [], appointments: [] }));
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

function importedClients(count: number, prefix = 'import'): Client[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    firstName: `Prénom${index}`,
    ...(index % 2 === 0 ? { lastName: 'Exemple' } : {}),
    phone: `06 00 ${String(index).padStart(6, '0').replace(/(\d{2})(?=\d)/g, '$1 ')}`,
    ...(index % 3 === 0 ? { email: `client${index}@example.com` } : {}),
    ...(index % 5 === 0 ? { birthday: { month: 2, day: 29 } } : {}),
  }));
}

function countClients(db: SourisDatabase): number {
  return db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM clients')?.count ?? -1;
}

/** Wraps a database so the Nth Client INSERT throws (a failing chunk). */
function failingOnClientInsert(db: SourisDatabase, failingInsert: number): SourisDatabase {
  let inserts = 0;
  return {
    ...db,
    execSync: (sql) => db.execSync(sql),
    getAllSync: (sql, params) => db.getAllSync(sql, params),
    getFirstSync: (sql, params) => db.getFirstSync(sql, params),
    withTransactionSync: (task) => db.withTransactionSync(task),
    isInTransactionSync: () => db.isInTransactionSync(),
    closeSync: () => db.closeSync(),
    runSync: (sql, params) => {
      if (sql.startsWith('INSERT INTO clients')) {
        inserts += 1;
        if (inserts === failingInsert) throw new Error('disk full');
      }
      return db.runSync(sql, params);
    },
  };
}

describe('insertClients (client import)', () => {
  it('stores a batch with one CLIENT UPSERT outbox entry per Client', () => {
    const db = openBoundDatabase();
    const batch = importedClients(3);

    const inserted = insertClients(db, batch);

    expect(inserted).toEqual(batch);
    expect(loadClients(db)).toEqual(batch);
    expect(
      loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation, entry.revision]),
    ).toEqual([
      ['CLIENT', 'import-0', 'UPSERT', 1],
      ['CLIENT', 'import-1', 'UPSERT', 1],
      ['CLIENT', 'import-2', 'UPSERT', 1],
    ]);
  });

  it('never writes notes, a photo, a lifecycle state or an SMS consent', () => {
    const db = openBoundDatabase();
    insertClients(db, importedClients(1));

    expect(
      db.getFirstSync("SELECT notes, photo_path, archived_at, sms_marketing_consent FROM clients WHERE id = 'import-0'"),
    ).toEqual({ notes: null, photo_path: null, archived_at: null, sms_marketing_consent: null });
  });

  it('imports 500 Clients, each with its outbox entry, and keeps them across a restart', () => {
    const db = openBoundDatabase();
    const batch = importedClients(500);

    insertClients(db, batch.slice(0, 250));
    insertClients(db, batch.slice(250));

    expect(countClients(db)).toBe(500);
    expect(countSyncOutboxRows(db)).toBe(500);
    expect(loadSnapshot(db).clients).toEqual(batch);
  });

  it('rolls a failing batch back entirely: no row, no outbox entry', () => {
    const db = openBoundDatabase();
    insertClients(db, importedClients(2, 'earlier'));

    expect(() => insertClients(failingOnClientInsert(db, 50), importedClients(100))).toThrow('disk full');

    expect(loadClients(db).map((client) => client.id)).toEqual(['earlier-0', 'earlier-1']);
    expect(countSyncOutboxRows(db)).toBe(2);
  });

  it('is retry-safe: ids already stored are skipped, never duplicated nor re-marked', () => {
    const db = openBoundDatabase();
    const batch = importedClients(4);
    insertClients(db, batch.slice(0, 2));

    const retried = insertClients(db, batch);

    expect(retried.map((client) => client.id)).toEqual(['import-2', 'import-3']);
    expect(countClients(db)).toBe(4);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => entry.revision)).toEqual([1, 1, 1, 1]);
    expect(insertClients(db, batch)).toEqual([]);
    expect(countClients(db)).toBe(4);
  });

  it('refuses an unbound database before writing anything', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [], appointments: [] }));

    expect(() => insertClients(db, importedClients(3))).toThrow(ClientBulkInsertUnboundError);
    expect(countClients(db)).toBe(0);
    expect(countSyncOutboxRows(db)).toBe(0);
  });
});
