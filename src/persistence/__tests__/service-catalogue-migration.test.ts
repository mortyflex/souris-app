// BeautIzzy — schema v17 (service categories and descriptions) on a POPULATED v16 database:
// the real hairdressing catalogue and its sync bookkeeping survive byte-for-byte; the new fields
// are NULL, the categories table empty, the outbox and acknowledged versions carried over, the
// pull cursor cleared and the one-time Service refresh armed.

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { readMetadata } from '../metadata';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { insertServiceCategory } from '../stores/service-categories';
import { loadServices, updateService } from '../stores/services';
import { loadSyncOutbox, markAggregateUpserted } from '../sync/outbox';
import { SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { SERVICE_CATALOGUE_REFRESH_KEY, SERVICE_CATALOGUE_REMOTE_KEY } from '../sync/service-catalogue-sync';
import { loadSyncState } from '../sync/state';
import { createTestSeed, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const BUSINESS_ID = remoteBusinessProfile.id;

function openSchemaV16Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 16)) migration.up(db);
    db.execSync('PRAGMA user_version = 16');
  });
  db.runSync(
    "INSERT INTO business_profile (singleton, id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at) VALUES (1, ?, 'user-owner', 'Amélie', NULL, 'Atelier', 'HAIRDRESSING', NULL, '2026-09-12T10:00:00.000Z', '2026-09-12T10:00:00.000Z')",
    [BUSINESS_ID],
  );
  db.runSync(
    "INSERT INTO services (id, business_id, name, type, price_cents, active) VALUES ('technique-color', ?, 'Coloration', 'TECHNIQUE', 6800, 1), ('service-cut', ?, 'Coupe femme', 'SERVICE', 4500, 0)",
    [BUSINESS_ID, BUSINESS_ID],
  );
  const phase = 'INSERT INTO service_phases (service_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?)';
  db.runSync(phase, ['technique-color', 0, 'color-active', 'Application', 30, 1]);
  db.runSync(phase, ['technique-color', 1, 'color-processing', 'Temps de pose', 35, 0]);
  db.runSync(phase, ['service-cut', 0, 'cut-phase', 'Coupe femme', 45, 1]);
  db.runSync(
    "INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status) VALUES ('appointment-1', ?, 'client-1', 'staff-amelie', '2026-09-25T08:00:00.000Z', 'SCHEDULED')",
    [BUSINESS_ID],
  );
  db.runSync("INSERT INTO clients (id, first_name) VALUES ('client-1', 'Léa')");
  db.runSync(
    "INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES ('appointment-1', 'item-1', 0, 'technique-color', NULL, 'Coloration', 'TECHNIQUE', 6800)",
  );
  const outbox =
    'INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(outbox, [BUSINESS_ID, 'CLIENT', 'gone', 'UPSERT', 1, '2026-09-20T08:00:00.000Z', '2026-09-20T08:00:00.000Z', 0, null, null]);
  db.runSync('DELETE FROM sync_outbox');
  db.runSync(outbox, [BUSINESS_ID, 'SERVICE', 'service-cut', 'UPSERT', 3, '2026-09-21T08:00:00.000Z', '2026-09-21T08:05:00.000Z', 2, 'NETWORK', '2026-09-21T09:00:00.000Z']);
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'SERVICE', 'technique-color', 4, '2026-09-20T10:00:00.000Z'), (?, 'APPOINTMENT', 'appointment-1', 2, '2026-09-20T10:00:00.000Z')",
    [BUSINESS_ID, BUSINESS_ID],
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1'), ('sync_pull_cursor', '{}'), ('sync_bootstrap', '{}')");
  return db;
}

const rows = (db: ReturnType<typeof openTestDatabase>, sql: string) => db.getAllSync<Record<string, unknown>>(sql);

describe('schema v17 migration on an existing v16 database', () => {
  it('adds two NULL Service columns and an empty categories table, touching no existing row', () => {
    const db = openSchemaV16Database();
    const servicesBefore = rows(db, 'SELECT id, business_id, name, type, price_cents, active FROM services ORDER BY rowid');
    const phasesBefore = rows(db, 'SELECT * FROM service_phases ORDER BY service_id, position');
    const itemsBefore = rows(db, 'SELECT * FROM appointment_items');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(17);
    expect(CURRENT_SCHEMA_VERSION).toBe(17);
    expect(createSeed).not.toHaveBeenCalled();
    expect(rows(db, 'SELECT id, business_id, name, type, price_cents, active FROM services ORDER BY rowid')).toEqual(servicesBefore);
    expect(rows(db, 'SELECT category_id, description FROM services')).toEqual([
      { category_id: null, description: null },
      { category_id: null, description: null },
    ]);
    expect(rows(db, 'SELECT * FROM service_phases ORDER BY service_id, position')).toEqual(phasesBefore);
    expect(rows(db, 'SELECT * FROM appointment_items')).toEqual(itemsBefore);
    expect(rows(db, 'SELECT * FROM service_categories')).toEqual([]);
    expect(snapshot.serviceCategories).toEqual([]);
    // Old records read exactly as before: no category, no description key at all.
    expect(snapshot.services.map((service) => Object.keys(service).sort())).toEqual([
      ['active', 'businessId', 'id', 'name', 'phases', 'price', 'type'],
      ['active', 'businessId', 'id', 'name', 'phases', 'price', 'type'],
    ]);
  });

  it('carries every outbox entry (id, revision, retry state, sequence) and every acknowledged version over', () => {
    const db = openSchemaV16Database();
    const outboxBefore = rows(db, 'SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = rows(db, 'SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id');
    const sequenceBefore = rows(db, "SELECT seq FROM sqlite_sequence WHERE name = 'sync_outbox'");

    migrateDatabase(db);

    expect(rows(db, 'SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(rows(db, 'SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id')).toEqual(stateBefore);
    expect(rows(db, "SELECT seq FROM sqlite_sequence WHERE name = 'sync_outbox'")).toEqual(sequenceBefore);
    // A new entry continues the sequence; the vocabulary now accepts SERVICE_CATEGORY.
    markAggregateUpserted(db, 'SERVICE_CATEGORY', 'cat-1');
    const entries = loadSyncOutbox(db, BUSINESS_ID);
    expect(entries.map((entry) => [entry.id, entry.aggregateType])).toEqual([
      [2, 'SERVICE'],
      [3, 'SERVICE_CATEGORY'],
    ]);
    expect(loadSyncState(db, BUSINESS_ID).map((entry) => [entry.aggregateType, entry.remoteVersion])).toEqual([
      ['APPOINTMENT', 2],
      ['SERVICE', 4],
    ]);
  });

  it('clears the pull cursor and arms the one-time Service refresh; the remote is not assumed ready', () => {
    const db = openSchemaV16Database();
    migrateDatabase(db);
    expect(readMetadata(db, SYNC_PULL_CURSOR_KEY)).toBeUndefined();
    expect(readMetadata(db, SERVICE_CATALOGUE_REFRESH_KEY)).toBe('1');
    expect(readMetadata(db, SERVICE_CATALOGUE_REMOTE_KEY)).toBeUndefined();
    expect(readMetadata(db, 'sync_bootstrap')).toBe('{}');
    expect(readMetadata(db, 'seed_version')).toBe('1');
  });

  it('is idempotent and lets the migrated database store categories and the two Service fields', () => {
    const db = openSchemaV16Database();
    migrateDatabase(db);
    expect(migrateDatabase(db)).toBe(17);

    insertServiceCategory(db, { id: 'cat-color', businessId: BUSINESS_ID, name: 'Couleurs', position: 0 });
    const color = loadServices(db).find((service) => service.id === 'technique-color')!;
    updateService(db, { ...color, categoryId: 'cat-color', description: 'Shampoing inclus.' });

    const reloaded = loadSnapshot(db);
    expect(reloaded.serviceCategories).toEqual([{ id: 'cat-color', businessId: BUSINESS_ID, name: 'Couleurs', position: 0 }]);
    expect(reloaded.services.find((service) => service.id === 'technique-color')).toEqual({
      ...color,
      categoryId: 'cat-color',
      description: 'Shampoing inclus.',
    });
    // The historical snapshot is untouched by the catalogue edit.
    expect(rows(db, 'SELECT service_name, price_cents FROM appointment_items')).toEqual([
      { service_name: 'Coloration', price_cents: 6800 },
    ]);
  });
});
