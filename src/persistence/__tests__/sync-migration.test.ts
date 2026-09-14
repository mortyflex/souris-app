// Souris — schema v7: sync_outbox + sync_state (docs/architecture/PERSISTENCE.md §4)

import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { readBusinessProfile } from '../stores/business-profile';
import { updateClient } from '../stores/clients';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { loadSyncState } from '../sync/state';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
  serviceColor,
  serviceCut,
} from '../testing/fixtures';
import {
  insertHistoricalAppointment,
  insertHistoricalProduct,
  insertHistoricalService,
  insertSchemaV5Sale,
} from '../testing/historical-fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: SourisDatabase, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

function tableNames(db: SourisDatabase): readonly string[] {
  return db
    .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((row) => row.name);
}

const sale: Sale = {
  id: 'sale-historical',
  businessId: REMOTE_BUSINESS_ID,
  clientId: clientLea.id,
  appointmentId: appointmentLea.id,
  completedAt: new Date(2026, 8, 10, 11, 0),
  items: [
    { id: 'sale-historical-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 },
  ],
};

/**
 * A database exactly as Checkout & Cash Register V1 (schema v6) left it on a
 * BOUND device: every aggregate present under the remote Business id, the
 * account binding in place, no sync table yet.
 */
function openSchemaV6Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 6)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 6');
  });
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, null, null, '02-29'],
  );
  insertHistoricalService(db, { ...serviceColor, businessId: REMOTE_BUSINESS_ID });
  insertHistoricalService(db, { ...serviceCut, businessId: REMOTE_BUSINESS_ID });
  insertHistoricalProduct(db, { ...productMask, businessId: REMOTE_BUSINESS_ID });
  insertHistoricalProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
  insertHistoricalAppointment(db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID });
  insertSchemaV5Sale(db, sale);
  db.runSync(
    "INSERT INTO business_profile (singleton, id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at) VALUES (1, ?, ?, 'Léa', 'Martin', 'Maison Léa', 'HAIRDRESSING', '06 12 34 56 78', '2026-09-12T10:00:00.000Z', '2026-09-12T10:00:00.000Z')",
    [REMOTE_BUSINESS_ID, remoteBusinessProfile.ownerUserId],
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v7 migration on an existing v6 database', () => {
  it('adds the two empty sync tables and keeps every record, the binding and the seed marker', () => {
    const db = openSchemaV6Database();
    expect(readSchemaVersion(db)).toBe(6);
    expect(tableNames(db)).not.toEqual(expect.arrayContaining(['sync_outbox', 'sync_state']));
    const before = loadSnapshot(db);
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(7);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(tableNames(db)).toEqual(expect.arrayContaining(['sync_outbox', 'sync_state']));
    expect(snapshot).toEqual(before);
    expect(snapshot.clients).toEqual([clientLea]);
    expect(snapshot.services).toHaveLength(2);
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.appointments).toHaveLength(1);
    expect(snapshot.sales).toEqual([sale]);
    expect(countRows(db, 'service_phases')).toBe(4);
    expect(countRows(db, 'appointment_items')).toBe(2);
    expect(countRows(db, 'appointment_phases')).toBe(4);
    expect(countRows(db, 'sale_items')).toBe(1);
    expect(readBusinessProfile(db)).toEqual(remoteBusinessProfile);
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(countRows(db, 'sync_state')).toBe(0);
  });

  it('is a no-op when run again', () => {
    const db = openSchemaV6Database();
    migrateDatabase(db);
    const before = loadSnapshot(db);

    expect(migrateDatabase(db)).toBe(7);
    expect(loadSnapshot(db)).toEqual(before);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('fabricates no acknowledged remote revision for historical rows, and records the first mutation after upgrade', () => {
    const db = openSchemaV6Database();
    bootstrapPersistence(db, createTestSeed);

    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);

    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });

    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.businessId, entry.aggregateType, entry.aggregateId, entry.operation])).toEqual([
      [REMOTE_BUSINESS_ID, 'CLIENT', 'client-lea', 'UPSERT'],
    ]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
  });
});
