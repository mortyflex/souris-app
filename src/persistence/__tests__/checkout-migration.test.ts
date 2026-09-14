// Souris — schema v5: Sale ↔ Appointment link + Appointment checkout columns
// (docs/architecture/PERSISTENCE.md §4)

import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { checkoutAppointment, loadAppointments } from '../stores/appointments';
import { completeSale, loadSales } from '../stores/sales';
import { appointmentLea, clientLea, createTestSeed, productMask } from '../testing/fixtures';
import { insertHistoricalAppointment, insertHistoricalSale } from '../testing/historical-fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface CountRow {
  readonly count: number;
}

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

const historicalSale: Sale = {
  id: 'sale-historical',
  businessId: 'business-test',
  clientId: clientLea.id,
  completedAt: new Date(2026, 8, 10, 11, 0),
  items: [
    { id: 'sale-historical-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 },
  ],
};

/**
 * A database exactly as the Client Birthday milestone left it on a device:
 * schema v4, seeded, with a SCHEDULED and a COMPLETED Appointment and one
 * standalone Sale — no `appointment_id`, no payment columns yet.
 */
function openSchemaV4Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 4)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 4');
  });
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, null, null, '02-29'],
  );
  insertHistoricalAppointment(db, appointmentLea);
  insertHistoricalAppointment(db, {
    ...appointmentLea,
    id: 'appointment-completed',
    startAt: new Date(2026, 8, 1, 9, 30),
    status: 'COMPLETED',
  });
  insertHistoricalSale(db, historicalSale);
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v5 migration on an existing v4 database', () => {
  it('adds the link and payment columns, preserves every row, and fabricates no payment', () => {
    const db = openSchemaV4Database();
    expect(readSchemaVersion(db)).toBe(4);
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(7);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'appointments')).toBe(2);
    expect(countRows(db, 'appointment_items')).toBe(4);
    expect(countRows(db, 'sales')).toBe(1);
    expect(countRows(db, 'sale_items')).toBe(1);

    expect(snapshot.sales).toEqual([historicalSale]);
    expect('appointmentId' in snapshot.sales[0]!).toBe(false);

    const [scheduled, completed] = snapshot.appointments;
    expect(scheduled).toEqual(appointmentLea);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.payment).toBeUndefined();
    for (const appointment of snapshot.appointments) {
      expect('payment' in appointment).toBe(false);
    }
  });

  it('stores NULL in every new column for historical rows', () => {
    const db = openSchemaV4Database();
    migrateDatabase(db);

    expect(
      db.getAllSync<{ appointment_id: string | null }>('SELECT appointment_id FROM sales'),
    ).toEqual([{ appointment_id: null }]);
    expect(
      db.getAllSync<{ paid_at: string | null; card_amount_cents: number | null; cash_amount_cents: number | null }>(
        'SELECT paid_at, card_amount_cents, cash_amount_cents FROM appointments ORDER BY rowid',
      ),
    ).toEqual([
      { paid_at: null, card_amount_cents: null, cash_amount_cents: null },
      { paid_at: null, card_amount_cents: null, cash_amount_cents: null },
    ]);
  });

  it('is a no-op when run again and never re-seeds', () => {
    const db = openSchemaV4Database();
    migrateDatabase(db);

    expect(migrateDatabase(db)).toBe(7);
    expect(readSeedVersion(db)).toBe(1);
    expect(countRows(db, 'appointments')).toBe(2);
    expect(countRows(db, 'sales')).toBe(1);
    expect(loadSnapshot(db).sales).toEqual([historicalSale]);
  });

  it('lets a migrated Appointment be checked out and a new Sale be linked to it', () => {
    const db = openSchemaV4Database();
    migrateDatabase(db);
    const paidAt = new Date(2026, 8, 11, 11, 5);

    checkoutAppointment(db, appointmentLea.id, { paidAt, cardAmountCents: 9500, cashAmountCents: 4000 });
    completeSale(
      db,
      { ...historicalSale, id: 'sale-linked', appointmentId: appointmentLea.id },
      [],
    );

    const reloaded = loadAppointments(db).find((appointment) => appointment.id === appointmentLea.id);
    expect(reloaded?.status).toBe('COMPLETED');
    expect(reloaded?.payment).toEqual({ paidAt, cardAmountCents: 9500, cashAmountCents: 4000 });
    expect(loadSales(db).map((sale) => [sale.id, sale.appointmentId])).toEqual([
      ['sale-historical', undefined],
      ['sale-linked', appointmentLea.id],
    ]);
  });
});
