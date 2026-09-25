// Souris — schema v12: Appointment deposits (docs/architecture/PERSISTENCE.md §4)
//
// The migration creates one empty table AND rebuilds the two sync bookkeeping
// tables (SQLite cannot alter a CHECK) — the procedure of schema v11. Real
// data exists, so this suite builds a database exactly as the current
// TestFlight build (schema v11) leaves it — paid history, a discount, a
// Calendar Block, a linked Sale, pending and failed outbox entries, a gap in
// the outbox ids, acknowledged versions, a pull cursor — and proves nothing is
// lost.

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { insertAppointmentDeposit, loadAppointmentDeposits } from '../stores/appointment-deposits';
import { loadSyncOutbox, markAggregateUpserted } from '../sync/outbox';
import { SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { loadSyncState } from '../sync/state';
import { createTestSeed, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const BUSINESS_ID = remoteBusinessProfile.id;
const PAID_AT = '2026-09-10T14:00:00.000Z';

function openSchemaV11Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 11)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 11');
  });
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
  db.runSync(
    "INSERT INTO sales (id, business_id, client_id, completed_at, appointment_id) VALUES ('sale-linked', ?, 'client-lea', '2026-09-10T12:30:00.000Z', 'appointment-paid')",
    [BUSINESS_ID],
  );
  db.runSync(
    "INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price_cents, quantity) VALUES ('sale-linked', 'sale-linked-0', 0, 'product-mask', 'Masque', 2500, 1)",
  );
  db.runSync(
    "INSERT INTO calendar_blocks (id, business_id, staff_member_id, start_at, end_at, reason) VALUES ('block-1', ?, 'staff-amelie', '2026-09-25T12:00:00.000Z', '2026-09-25T13:00:00.000Z', 'Pause')",
    [BUSINESS_ID],
  );

  const insertOutbox =
    'INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  for (const id of ['settled-1', 'settled-2', 'settled-3']) {
    db.runSync(insertOutbox, [BUSINESS_ID, 'CLIENT', id, 'UPSERT', 1, '2026-09-18T08:00:00.000Z', '2026-09-18T08:00:00.000Z', 0, null, null]);
  }
  db.runSync(insertOutbox, [BUSINESS_ID, 'APPOINTMENT', 'appointment-upcoming', 'UPSERT', 3, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z', 2, 'CONFLICT', '2026-09-19T09:04:00.000Z']);
  db.runSync(insertOutbox, [BUSINESS_ID, 'CALENDAR_BLOCK', 'block-1', 'UPSERT', 1, '2026-09-19T10:00:00.000Z', '2026-09-19T10:00:00.000Z', 1, 'REJECTED', '2026-09-19T10:02:00.000Z']);
  db.runSync(insertOutbox, [BUSINESS_ID, 'SALE', 'sale-gone', 'DELETE', 1, '2026-09-19T11:00:00.000Z', '2026-09-19T11:00:00.000Z', 0, null, null]);
  db.runSync("DELETE FROM sync_outbox WHERE aggregate_id LIKE 'settled-%'");
  db.runSync('DELETE FROM sync_outbox WHERE id = 6');

  const insertState =
    'INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, ?, ?, ?, ?)';
  db.runSync(insertState, [BUSINESS_ID, 'CLIENT', 'client-lea', 4, '2026-09-18T08:00:00.000Z']);
  db.runSync(insertState, [BUSINESS_ID, 'APPOINTMENT', 'appointment-paid', 7, '2026-09-18T08:00:01.000Z']);
  db.runSync(insertState, [BUSINESS_ID, 'CALENDAR_BLOCK', 'block-old', 3, '2026-09-18T08:00:02.000Z']);
  db.runSync(insertState, [BUSINESS_ID, 'PRODUCT', 'product-tombstoned', 2, '2026-09-18T08:00:03.000Z']);

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
  'calendar_blocks',
  'business_profile',
] as const;

function dump(db: ReturnType<typeof openTestDatabase>, table: string) {
  const rows = db.getAllSync<Record<string, unknown>>(`SELECT rowid AS row_id, * FROM ${table} ORDER BY rowid`);
  // The bootstrap runs every later migration too: schema v13 adds
  // `clients.photo_path`, v14 `products.photo_path` and v15
  // `appointments.client_reminder_enabled` (all NULL; covered by
  // client-photo-migration.test.ts, product-photo-migration.test.ts and
  // appointment-reminder-migration.test.ts).
  return rows.map(
    ({ photo_path: _photoPath, client_reminder_enabled: _clientReminder, ...row }) => row,
  );
}

describe('schema v12 migration on an existing v11 database', () => {
  it('creates an empty appointment_deposits table and leaves every operational row byte-identical', () => {
    const db = openSchemaV11Database();
    const before = Object.fromEntries(OPERATIONAL_TABLES.map((table) => [table, dump(db, table)]));
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(15);
    expect(CURRENT_SCHEMA_VERSION).toBe(15);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    for (const table of OPERATIONAL_TABLES) expect(dump(db, table)).toEqual(before[table]);
    expect(snapshot.appointmentDeposits).toEqual([]);
    expect(snapshot.calendarBlocks.map((block) => block.id)).toEqual(['block-1']);
    expect(snapshot.appointments.map((appointment) => appointment.id)).toEqual([
      'appointment-upcoming',
      'appointment-paid',
    ]);
    expect(snapshot.sales.map((sale) => sale.id)).toEqual(['sale-linked']);
  });

  it('keeps the expected totals and the Cash Register exactly as before', () => {
    const db = openSchemaV11Database();
    const { appointments, sales, appointmentDeposits } = bootstrapPersistence(db, createTestSeed);

    expect(getAppointmentExpectedTotal(appointments[0]!, sales).expectedTotalCents).toBe(7600);
    expect(getAppointmentExpectedTotal(appointments[1]!, sales).expectedTotalCents).toBe(12500);
    expect(
      getCashRegisterDaySummary({ appointments, sales, deposits: appointmentDeposits }, new Date(PAID_AT)),
    ).toMatchObject({ cardCents: 6000, cashCents: 4000, checkoutCount: 1 });
  });

  it('rebuilds sync_outbox without losing an entry, an id, a revision or its retry state', () => {
    const db = openSchemaV11Database();
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    expect(outboxBefore).toHaveLength(2);

    bootstrapPersistence(db, createTestSeed);

    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(loadSyncOutbox(db, BUSINESS_ID)).toEqual([
      expect.objectContaining({ id: 4, aggregateType: 'APPOINTMENT', revision: 3, attemptCount: 2, lastError: 'CONFLICT' }),
      expect.objectContaining({ id: 5, aggregateType: 'CALENDAR_BLOCK', revision: 1, attemptCount: 1, lastError: 'REJECTED' }),
    ]);
  });

  it('carries the AUTOINCREMENT sequence over: an outbox id is still never reused', () => {
    const db = openSchemaV11Database();
    bootstrapPersistence(db, createTestSeed);

    markAggregateUpserted(db, 'CLIENT', 'client-lea');

    // Ids 1–6 were all handed out before the upgrade (6 settled since): next is 7.
    expect(loadSyncOutbox(db, BUSINESS_ID).map((entry) => entry.id)).toEqual([4, 5, 7]);
  });

  it('rebuilds sync_state with every acknowledged version, CALENDAR_BLOCK and tombstones included', () => {
    const db = openSchemaV11Database();
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id');

    bootstrapPersistence(db, createTestSeed);

    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_type, aggregate_id')).toEqual(stateBefore);
    expect(loadSyncState(db, BUSINESS_ID)).toHaveLength(4);
  });

  it('accepts APPOINTMENT_DEPOSIT in both sync tables and still refuses an unknown type', () => {
    const db = openSchemaV11Database();
    bootstrapPersistence(db, createTestSeed);
    const insertOutbox =
      "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, created_at, updated_at) VALUES ('b', ?, ?, 'UPSERT', 'now', 'now')";

    expect(() => db.runSync(insertOutbox, ['UNKNOWN', 'x'])).toThrow();
    expect(() => db.runSync(insertOutbox, ['APPOINTMENT_DEPOSIT', 'x'])).not.toThrow();
    expect(() => db.runSync(insertOutbox, ['APPOINTMENT_DEPOSIT', 'x'])).toThrow(/UNIQUE/);
    expect(() =>
      db.runSync(
        "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('b', 'APPOINTMENT_DEPOSIT', 'x', 1, 'now')",
      ),
    ).not.toThrow();
    expect(db.getAllSync("SELECT name FROM sqlite_master WHERE name LIKE '%_v12'")).toEqual([]);
  });

  it('clears the pull cursor — and only it — so deposits recorded meanwhile are fetched once', () => {
    const db = openSchemaV11Database();
    bootstrapPersistence(db, createTestSeed);

    const keys = db.getAllSync<{ key: string }>('SELECT key FROM souris_metadata ORDER BY key').map((row) => row.key);
    expect(keys).toEqual(['seed_version', 'sync_bootstrap']);
  });

  it('is idempotent and lets the migrated database record a deposit', () => {
    const db = openSchemaV11Database();
    bootstrapPersistence(db, createTestSeed);

    expect(migrateDatabase(db)).toBe(15);
    insertAppointmentDeposit(db, {
      id: 'deposit-1',
      businessId: BUSINESS_ID,
      appointmentId: 'appointment-upcoming',
      amountCents: 3000,
      paymentMethod: 'CASH',
      paidAt: new Date('2026-09-22T10:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date('2026-09-22T10:00:00.000Z'),
    });

    expect(loadAppointmentDeposits(db)).toHaveLength(1);
    expect(loadSnapshot(db).appointments).toHaveLength(2);
    expect(
      loadSyncOutbox(db, BUSINESS_ID).map((entry) => `${entry.aggregateType}/${entry.aggregateId}`),
    ).toEqual(['APPOINTMENT/appointment-upcoming', 'CALENDAR_BLOCK/block-1', 'APPOINTMENT_DEPOSIT/deposit-1']);
  });
});
