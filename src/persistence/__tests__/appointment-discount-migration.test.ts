// Souris — schema v10: Appointment discount (docs/architecture/PERSISTENCE.md §4)

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { loadAppointments, updateAppointmentDiscount } from '../stores/appointments';
import { createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const RAW_APPOINTMENT_COLUMNS =
  'rowid, id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents';

const PAID_AT = '2026-09-10T14:00:00.000Z';

/**
 * A database exactly as the current TestFlight build (schema v9) leaves it on
 * a device: real Appointments without any discount column — one upcoming, one
 * completed and paid — one acknowledged by the remote, one with a pending
 * local edit.
 */
function openSchemaV9Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 9)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 9');
  });
  db.runSync("INSERT INTO clients (id, first_name) VALUES ('client-lea', 'Léa')");
  const insertAppointment =
    'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, notes, paid_at, card_amount_cents, cash_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insertAppointment, ['appointment-upcoming', 'business-remote', 'client-lea', 'staff-amelie', '2026-09-25T08:00:00.000Z', 'SCHEDULED', 'Racines', null, null, null]);
  db.runSync(insertAppointment, ['appointment-paid', 'business-remote', 'client-lea', 'staff-amelie', '2026-09-10T12:00:00.000Z', 'COMPLETED', null, PAID_AT, 6000, 4000]);
  const insertItem =
    "INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES (?, ?, ?, ?, NULL, ?, 'SERVICE', ?)";
  db.runSync(insertItem, ['appointment-upcoming', 'upcoming-item-0', 0, 'service-cut', 'Coupe', 4550]);
  db.runSync(insertItem, ['appointment-upcoming', 'upcoming-item-1', 1, 'service-color', 'Coloration', 9500]);
  db.runSync(insertItem, ['appointment-paid', 'paid-item-0', 0, 'service-color', 'Coloration', 10000]);
  db.runSync(
    "INSERT INTO appointment_phases (appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff) VALUES ('appointment-paid', 'paid-item-0', 0, 'phase-0', 'Application', 45, 1)",
  );
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-remote', 'APPOINTMENT', 'appointment-paid', 3, '2026-09-18T08:00:00.000Z')",
  );
  db.runSync(
    "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at) VALUES ('business-remote', 'APPOINTMENT', 'appointment-upcoming', 'UPSERT', 2, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v10 migration on an existing v9 database', () => {
  it('adds two NULL discount columns and leaves every Appointment, item, phase and sync row untouched', () => {
    const db = openSchemaV9Database();
    const appointmentsBefore = db.getAllSync(`SELECT ${RAW_APPOINTMENT_COLUMNS} FROM appointments ORDER BY rowid`);
    const itemsBefore = db.getAllSync('SELECT * FROM appointment_items ORDER BY appointment_id, item_order');
    const phasesBefore = db.getAllSync('SELECT * FROM appointment_phases');
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(11);
    expect(CURRENT_SCHEMA_VERSION).toBe(11);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);

    expect(db.getAllSync(`SELECT ${RAW_APPOINTMENT_COLUMNS} FROM appointments ORDER BY rowid`)).toEqual(appointmentsBefore);
    expect(db.getAllSync('SELECT * FROM appointment_items ORDER BY appointment_id, item_order')).toEqual(itemsBefore);
    expect(db.getAllSync('SELECT * FROM appointment_phases')).toEqual(phasesBefore);
    expect(
      db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM appointments WHERE discount_percent IS NOT NULL OR discount_amount_cents IS NOT NULL',
      )?.count,
    ).toBe(0);
    // The migration changed nothing the remote should hear about.
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id')).toEqual(stateBefore);

    // Appointments written by the previous build load as "no discount".
    expect(snapshot.appointments).toHaveLength(2);
    for (const appointment of snapshot.appointments) {
      expect('discount' in appointment).toBe(false);
    }
  });

  it('keeps every financial result of the existing Appointments exactly as it was', () => {
    const db = openSchemaV9Database();
    const { appointments } = bootstrapPersistence(db, createTestSeed);
    const upcoming = appointments.find((appointment) => appointment.id === 'appointment-upcoming')!;
    const paid = appointments.find((appointment) => appointment.id === 'appointment-paid')!;

    expect(getAppointmentExpectedTotal(upcoming, [])).toEqual({
      servicesCents: 14050,
      discountCents: 0,
      productsCents: 0,
      expectedTotalCents: 14050,
    });
    expect(getAppointmentExpectedTotal(paid, []).expectedTotalCents).toBe(10000);
    expect(getCashRegisterDaySummary({ appointments, sales: [] }, new Date(PAID_AT))).toEqual({
      totalCents: 10000,
      cardCents: 6000,
      cashCents: 4000,
      checkoutCount: 1,
    });
  });

  // The bootstrap runs every later migration too: schema v11 creates
  // `calendar_blocks` and rebuilds the two sync bookkeeping tables for the new
  // aggregate type (covered by calendar-blocks-migration.test.ts).
  it('changes no other table definition', () => {
    const db = openSchemaV9Database();
    const tablesBefore = db.getAllSync<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('appointments', 'calendar_blocks', 'sync_outbox', 'sync_state') ORDER BY name",
    );

    bootstrapPersistence(db, createTestSeed);

    expect(
      db.getAllSync<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('appointments', 'calendar_blocks', 'sync_outbox', 'sync_state') ORDER BY name",
      ),
    ).toEqual(tablesBefore);
  });

  it('is idempotent and lets a migrated Appointment receive a discount afterwards', () => {
    const db = openSchemaV9Database();
    bootstrapPersistence(db, createTestSeed);

    expect(migrateDatabase(db)).toBe(11);
    updateAppointmentDiscount(db, 'appointment-upcoming', { type: 'PERCENT', percent: 20 });

    const reloaded = loadSnapshot(db).appointments.find(
      (appointment) => appointment.id === 'appointment-upcoming',
    );
    expect(reloaded?.discount).toEqual({ type: 'PERCENT', percent: 20 });
    expect(reloaded?.items.map((item) => item.price)).toEqual([45.5, 95]);
    // The other Appointment is still exactly what the previous build stored.
    expect(loadAppointments(db).find((appointment) => appointment.id === 'appointment-paid')?.discount).toBeUndefined();
  });

  it('refuses rows the domain could never produce', () => {
    const db = openSchemaV9Database();
    bootstrapPersistence(db, createTestSeed);
    const set = (percent: number | null, cents: number | null) =>
      db.runSync(
        "UPDATE appointments SET discount_percent = ?, discount_amount_cents = ? WHERE id = 'appointment-upcoming'",
        [percent, cents],
      );

    expect(() => set(0, null)).toThrow();
    expect(() => set(51, null)).toThrow();
    expect(() => set(100, null)).toThrow();
    expect(() => set(null, 0)).toThrow();
    expect(() => set(null, -500)).toThrow();
    expect(() => set(20, 1500)).toThrow();
    expect(() => set(1, null)).not.toThrow();
    expect(() => set(50, null)).not.toThrow();
    expect(() => set(null, 1500)).not.toThrow();
    expect(() => set(null, null)).not.toThrow();
  });
});
