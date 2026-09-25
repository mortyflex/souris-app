// Souris — schema v15: per-appointment client reminder flag
// (docs/architecture/PERSISTENCE.md §4)

import { isAppointmentClientReminderEnabled } from '@/domain/appointments';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { loadAppointments, updateAppointment } from '../stores/appointments';
import { createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const RAW_APPOINTMENT_COLUMNS =
  'rowid, id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents, discount_percent, discount_amount_cents';

/**
 * A database exactly as the current build (schema v14) leaves it on a device:
 * real Appointments without any reminder column — one upcoming, one completed
 * and paid — one acknowledged by the remote, one with a pending local edit.
 */
function openSchemaV14Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 14)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 14');
  });
  db.runSync("INSERT INTO clients (id, first_name, email) VALUES ('client-lea', 'Léa', 'lea@example.test')");
  const insertAppointment =
    'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, notes, paid_at, card_amount_cents, cash_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insertAppointment, ['appointment-upcoming', 'business-remote', 'client-lea', 'staff-amelie', '2027-03-25T08:00:00.000Z', 'SCHEDULED', 'Racines', null, null, null]);
  db.runSync(insertAppointment, ['appointment-paid', 'business-remote', 'client-lea', 'staff-amelie', '2026-09-10T12:00:00.000Z', 'COMPLETED', null, '2026-09-10T14:00:00.000Z', 6000, 4000]);
  const insertItem =
    "INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES (?, ?, ?, ?, NULL, ?, 'SERVICE', ?)";
  db.runSync(insertItem, ['appointment-upcoming', 'upcoming-item-0', 0, 'service-cut', 'Coupe', 4550]);
  db.runSync(insertItem, ['appointment-paid', 'paid-item-0', 0, 'service-color', 'Coloration', 10000]);
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-remote', 'APPOINTMENT', 'appointment-paid', 3, '2026-09-18T08:00:00.000Z')",
  );
  db.runSync(
    "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at) VALUES ('business-remote', 'APPOINTMENT', 'appointment-upcoming', 'UPSERT', 2, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v15 migration on an existing v14 database', () => {
  it('adds a NULL client_reminder_enabled column and leaves every row and sync bookkeeping untouched', () => {
    const db = openSchemaV14Database();
    const appointmentsBefore = db.getAllSync(`SELECT ${RAW_APPOINTMENT_COLUMNS} FROM appointments ORDER BY rowid`);
    const itemsBefore = db.getAllSync('SELECT * FROM appointment_items ORDER BY appointment_id, item_order');
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(15);
    expect(CURRENT_SCHEMA_VERSION).toBe(15);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);

    expect(db.getAllSync(`SELECT ${RAW_APPOINTMENT_COLUMNS} FROM appointments ORDER BY rowid`)).toEqual(appointmentsBefore);
    expect(db.getAllSync('SELECT * FROM appointment_items ORDER BY appointment_id, item_order')).toEqual(itemsBefore);
    expect(
      db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM appointments WHERE client_reminder_enabled IS NOT NULL',
      )?.count,
    ).toBe(0);
    // The migration changed nothing the remote should hear about.
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id')).toEqual(stateBefore);

    // Appointments written by the previous build hydrate WITHOUT the property
    // and therefore read as reminder-enabled: existing future Appointments
    // become eligible the day the professional enables the global preference.
    expect(snapshot.appointments).toHaveLength(2);
    for (const appointment of snapshot.appointments) {
      expect('clientReminderEnabled' in appointment).toBe(false);
      expect(isAppointmentClientReminderEnabled(appointment)).toBe(true);
    }
  });

  it('is idempotent and lets a migrated Appointment store an explicit choice afterwards', () => {
    const db = openSchemaV14Database();
    bootstrapPersistence(db, createTestSeed);

    expect(migrateDatabase(db)).toBe(15);
    const upcoming = loadAppointments(db).find(
      (appointment) => appointment.id === 'appointment-upcoming',
    )!;
    updateAppointment(db, { ...upcoming, clientReminderEnabled: false });

    const reloaded = loadSnapshot(db).appointments.find(
      (appointment) => appointment.id === 'appointment-upcoming',
    );
    expect(reloaded?.clientReminderEnabled).toBe(false);
    expect(isAppointmentClientReminderEnabled(reloaded!)).toBe(false);

    // Turning it back on stores the explicit true; clearing stores NULL again.
    updateAppointment(db, { ...reloaded!, clientReminderEnabled: true });
    expect(
      loadAppointments(db).find((appointment) => appointment.id === 'appointment-upcoming')
        ?.clientReminderEnabled,
    ).toBe(true);
    // The other Appointment is still exactly what the previous build stored.
    expect(
      'clientReminderEnabled' in
        loadAppointments(db).find((appointment) => appointment.id === 'appointment-paid')!,
    ).toBe(false);
  });

  it('refuses values the domain could never produce', () => {
    const db = openSchemaV14Database();
    bootstrapPersistence(db, createTestSeed);
    const set = (value: number | null) =>
      db.runSync("UPDATE appointments SET client_reminder_enabled = ? WHERE id = 'appointment-upcoming'", [value]);

    expect(() => set(2)).toThrow();
    expect(() => set(-1)).toThrow();
    expect(() => set(0)).not.toThrow();
    expect(() => set(1)).not.toThrow();
    expect(() => set(null)).not.toThrow();
  });
});
