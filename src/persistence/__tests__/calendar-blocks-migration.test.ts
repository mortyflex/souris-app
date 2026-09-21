// Souris — schema v11: Calendar Blocks (docs/architecture/PERSISTENCE.md §4)
//
// The migration creates one empty table AND rebuilds the two sync bookkeeping
// tables (SQLite cannot alter a CHECK). Real data exists, so this suite builds
// a database exactly as the current TestFlight build (schema v10) leaves it —
// paid history, a discount, pending and failed outbox entries, a gap in the
// outbox ids, acknowledged versions, a pull cursor — and proves nothing is lost.

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { insertCalendarBlock, loadCalendarBlocks } from '../stores/calendar-blocks';
import { updateClient, loadClients } from '../stores/clients';
import { loadSyncOutbox, markAggregateUpserted } from '../sync/outbox';
import { SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { loadSyncState } from '../sync/state';
import { createTestSeed, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const BUSINESS_ID = remoteBusinessProfile.id;
const PAID_AT = '2026-09-10T14:00:00.000Z';

function openSchemaV10Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 10)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 10');
  });
  // Raw binding row: `bindLocalDatabaseToBusiness` scans today's table list,
  // which a v10 database does not have yet (binding always runs after migration).
  db.runSync(
    "INSERT INTO business_profile (singleton, id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at) VALUES (1, ?, 'user-owner', 'Amélie', NULL, 'Atelier', 'HAIRDRESSING', NULL, '2026-09-12T10:00:00.000Z', '2026-09-12T10:00:00.000Z')",
    [BUSINESS_ID],
  );
  db.runSync("INSERT INTO clients (id, first_name, notes) VALUES ('client-lea', 'Léa', 'Cuir chevelu sensible')");
  const insertAppointment =
    'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, paid_at, card_amount_cents, cash_amount_cents, discount_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insertAppointment, ['appointment-upcoming', BUSINESS_ID, 'client-lea', 'staff-amelie', '2026-09-25T08:00:00.000Z', 'SCHEDULED', null, null, null, 20]);
  db.runSync(insertAppointment, ['appointment-paid', BUSINESS_ID, 'client-lea', 'staff-amelie', '2026-09-10T12:00:00.000Z', 'COMPLETED', PAID_AT, 6000, 4000, null]);
  const insertItem =
    "INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES (?, ?, 0, 'service-color', NULL, 'Coloration', 'SERVICE', ?)";
  db.runSync(insertItem, ['appointment-upcoming', 'upcoming-item-0', 9500]);
  db.runSync(insertItem, ['appointment-paid', 'paid-item-0', 10000]);
  db.runSync(
    "INSERT INTO appointment_phases (appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff) VALUES ('appointment-paid', 'paid-item-0', 0, 'phase-0', 'Application', 45, 1)",
  );

  const insertOutbox =
    'INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  // Five entries, then the first three settle: ids 4 and 5 remain and the
  // AUTOINCREMENT high-water mark (5) sits above nothing it could re-derive
  // once entry 5 settles too.
  for (const id of ['settled-1', 'settled-2', 'settled-3']) {
    db.runSync(insertOutbox, [BUSINESS_ID, 'CLIENT', id, 'UPSERT', 1, '2026-09-18T08:00:00.000Z', '2026-09-18T08:00:00.000Z', 0, null, null]);
  }
  db.runSync(insertOutbox, [BUSINESS_ID, 'APPOINTMENT', 'appointment-upcoming', 'UPSERT', 3, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z', 2, 'CONFLICT', '2026-09-19T09:04:00.000Z']);
  db.runSync(insertOutbox, [BUSINESS_ID, 'SALE', 'sale-gone', 'DELETE', 1, '2026-09-19T10:00:00.000Z', '2026-09-19T10:00:00.000Z', 0, null, null]);
  db.runSync("DELETE FROM sync_outbox WHERE aggregate_id LIKE 'settled-%'");
  db.runSync('DELETE FROM sync_outbox WHERE id = 5');

  const insertState =
    'INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, ?, ?, ?, ?)';
  db.runSync(insertState, [BUSINESS_ID, 'CLIENT', 'client-lea', 4, '2026-09-18T08:00:00.000Z']);
  db.runSync(insertState, [BUSINESS_ID, 'APPOINTMENT', 'appointment-paid', 7, '2026-09-18T08:00:01.000Z']);
  db.runSync(insertState, [BUSINESS_ID, 'PRODUCT', 'product-tombstoned', 2, '2026-09-18T08:00:02.000Z']);

  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  db.runSync('INSERT INTO souris_metadata (key, value) VALUES (?, ?)', [
    SYNC_PULL_CURSOR_KEY,
    JSON.stringify({ businessId: BUSINESS_ID, pulledAt: '2026-09-19T12:00:00.000Z' }),
  ]);
  db.runSync(
    `INSERT INTO souris_metadata (key, value) VALUES ('sync_bootstrap', '${JSON.stringify({ businessId: BUSINESS_ID, decision: 'ALREADY_SYNCED', decidedAt: '2026-09-18T08:00:00.000Z' })}')`,
  );
  return db;
}

const OPERATIONAL_TABLES = [
  'clients',
  'services',
  'service_phases',
  'appointments',
  'appointment_items',
  'appointment_phases',
  'products',
  'sales',
  'sale_items',
  'business_profile',
] as const;

function dump(db: ReturnType<typeof openTestDatabase>, table: string) {
  return db.getAllSync(`SELECT rowid AS row_id, * FROM ${table} ORDER BY rowid`);
}

describe('schema v11 migration on an existing v10 database', () => {
  it('creates an empty calendar_blocks table and leaves every operational row byte-identical', () => {
    const db = openSchemaV10Database();
    const before = Object.fromEntries(OPERATIONAL_TABLES.map((table) => [table, dump(db, table)]));
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(11);
    expect(CURRENT_SCHEMA_VERSION).toBe(11);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    for (const table of OPERATIONAL_TABLES) expect(dump(db, table)).toEqual(before[table]);
    expect(snapshot.calendarBlocks).toEqual([]);
    expect(snapshot.appointments.map((appointment) => appointment.id)).toEqual([
      'appointment-upcoming',
      'appointment-paid',
    ]);
    expect(snapshot.appointments[0]?.discount).toEqual({ type: 'PERCENT', percent: 20 });
    expect(snapshot.clients[0]?.notes).toBe('Cuir chevelu sensible');
  });

  it('keeps the expected totals and the Cash Register exactly as before', () => {
    const db = openSchemaV10Database();
    const { appointments, sales } = bootstrapPersistence(db, createTestSeed);

    expect(getAppointmentExpectedTotal(appointments[0]!, sales).expectedTotalCents).toBe(7600);
    expect(getCashRegisterDaySummary({ appointments, sales }, new Date(PAID_AT))).toMatchObject({
      cardCents: 6000,
      cashCents: 4000,
      checkoutCount: 1,
    });
  });

  it('rebuilds sync_outbox without losing an entry, an id, a revision or its retry state', () => {
    const db = openSchemaV10Database();
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    expect(outboxBefore).toHaveLength(1);

    bootstrapPersistence(db, createTestSeed);

    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(loadSyncOutbox(db, BUSINESS_ID)).toEqual([
      expect.objectContaining({
        id: 4,
        aggregateType: 'APPOINTMENT',
        aggregateId: 'appointment-upcoming',
        revision: 3,
        attemptCount: 2,
        lastError: 'CONFLICT',
        nextAttemptAt: new Date('2026-09-19T09:04:00.000Z'),
      }),
    ]);
  });

  it('carries the AUTOINCREMENT sequence over: an outbox id is still never reused', () => {
    const db = openSchemaV10Database();
    bootstrapPersistence(db, createTestSeed);

    markAggregateUpserted(db, 'CLIENT', 'client-lea');

    // Ids 1–5 were all handed out before the upgrade (5 settled since): next is 6.
    expect(loadSyncOutbox(db, BUSINESS_ID).map((entry) => entry.id)).toEqual([4, 6]);
  });

  it('keeps an empty outbox working when its sequence was never started', () => {
    const db = openTestDatabase();
    db.withTransactionSync(() => {
      for (const migration of migrations.filter((candidate) => candidate.version <= 10)) migration.up(db);
      db.execSync('PRAGMA user_version = 10');
    });
    migrateDatabase(db);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    markAggregateUpserted(db, 'CLIENT', 'client-new');

    expect(loadSyncOutbox(db, BUSINESS_ID).map((entry) => entry.id)).toEqual([1]);
  });

  it('rebuilds sync_state with every acknowledged version, tombstones included', () => {
    const db = openSchemaV10Database();
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id');

    bootstrapPersistence(db, createTestSeed);

    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id')).toEqual(stateBefore);
    expect(loadSyncState(db, BUSINESS_ID).map((entry) => [entry.aggregateId, entry.remoteVersion])).toEqual([
      ['appointment-paid', 7],
      ['client-lea', 4],
      ['product-tombstoned', 2],
    ]);
  });

  it('keeps the constraints and the unique key of both sync tables', () => {
    const db = openSchemaV10Database();
    bootstrapPersistence(db, createTestSeed);
    const insertOutbox =
      "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, created_at, updated_at) VALUES ('b', ?, ?, ?, 'now', 'now')";

    expect(() => db.runSync(insertOutbox, ['UNKNOWN', 'x', 'UPSERT'])).toThrow();
    expect(() => db.runSync(insertOutbox, ['CLIENT', 'x', 'PATCH'])).toThrow();
    expect(() => db.runSync(insertOutbox, ['CALENDAR_BLOCK', 'x', 'UPSERT'])).not.toThrow();
    expect(() => db.runSync(insertOutbox, ['CALENDAR_BLOCK', 'x', 'DELETE'])).toThrow(/UNIQUE/);
    expect(() =>
      db.runSync(
        "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('b', 'CALENDAR_BLOCK', 'x', 0, 'now')",
      ),
    ).toThrow();
    expect(() =>
      db.runSync(
        "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('b', 'CALENDAR_BLOCK', 'x', 1, 'now')",
      ),
    ).not.toThrow();
    expect(
      db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE name LIKE '%_v11'"),
    ).toEqual([]);
  });

  it('clears the pull cursor — and only it — so blocks created meanwhile are fetched once', () => {
    const db = openSchemaV10Database();

    bootstrapPersistence(db, createTestSeed);

    const keys = db
      .getAllSync<{ key: string }>('SELECT key FROM souris_metadata ORDER BY key')
      .map((row) => row.key);
    expect(keys).toEqual(['seed_version', 'sync_bootstrap']);
  });

  it('writes nothing to the outbox: no aggregate changed', () => {
    const db = openSchemaV10Database();
    bootstrapPersistence(db, createTestSeed);

    expect(loadSyncOutbox(db, BUSINESS_ID).map((entry) => entry.aggregateId)).toEqual([
      'appointment-upcoming',
    ]);
  });

  it('is idempotent and lets the migrated database store a block and keep editing Clients', () => {
    const db = openSchemaV10Database();
    bootstrapPersistence(db, createTestSeed);

    expect(migrateDatabase(db)).toBe(11);
    insertCalendarBlock(db, {
      id: 'block-1',
      businessId: BUSINESS_ID,
      staffMemberId: 'staff-amelie',
      startAt: new Date('2026-09-25T10:00:00.000Z'),
      endAt: new Date('2026-09-25T10:30:00.000Z'),
      reason: 'Pause',
    });
    updateClient(db, { ...loadClients(db)[0]!, phone: '0600000000' });

    expect(loadCalendarBlocks(db)).toHaveLength(1);
    expect(loadSnapshot(db).appointments).toHaveLength(2);
    expect(
      loadSyncOutbox(db, BUSINESS_ID).map((entry) => `${entry.aggregateType}/${entry.aggregateId}`),
    ).toEqual(['APPOINTMENT/appointment-upcoming', 'CALENDAR_BLOCK/block-1', 'CLIENT/client-lea']);
  });

  it('refuses at the database level what the domain refuses', () => {
    const db = openSchemaV10Database();
    bootstrapPersistence(db, createTestSeed);
    const insert =
      "INSERT INTO calendar_blocks (id, business_id, staff_member_id, start_at, end_at, reason) VALUES ('raw', 'b', 's', ?, ?, ?)";

    expect(() => db.runSync(insert, ['2026-09-25T10:00:00.000Z', '2026-09-25T10:00:00.000Z', 'Pause'])).toThrow();
    expect(() => db.runSync(insert, ['2026-09-25T10:00:00.000Z', '2026-09-25T09:00:00.000Z', 'Pause'])).toThrow();
    expect(() => db.runSync(insert, ['2026-09-25T10:00:00.000Z', '2026-09-25T11:00:00.000Z', '   '])).toThrow();
    expect(
      db
        .getAllSync<{ name: string }>('PRAGMA table_info(calendar_blocks)')
        .map((column) => column.name),
    ).toEqual(['id', 'business_id', 'staff_member_id', 'start_at', 'end_at', 'reason']);
  });
});
