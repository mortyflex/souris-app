// Souris — schema v6: standalone Sale payment columns (docs/architecture/PERSISTENCE.md §4)

import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { completeSale, loadSales } from '../stores/sales';
import { appointmentLea, clientLea, createTestSeed, productMask } from '../testing/fixtures';
import { insertHistoricalAppointment, insertSchemaV5Sale } from '../testing/historical-fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

const standaloneSale: Sale = {
  id: 'sale-standalone',
  businessId: 'business-test',
  clientId: clientLea.id,
  completedAt: new Date(2026, 8, 10, 11, 0),
  items: [
    { id: 'sale-standalone-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 },
  ],
};

const linkedSale: Sale = {
  ...standaloneSale,
  id: 'sale-linked',
  appointmentId: appointmentLea.id,
  completedAt: new Date(2026, 8, 11, 10, 0),
  items: [
    { id: 'sale-linked-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
  ],
};

/**
 * A database exactly as Checkout & Cash Register V1 (schema v5) left it:
 * a standalone Sale and an Appointment-linked Sale, no payment columns yet.
 */
function openSchemaV5Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 5)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 5');
  });
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['client-lea', 'Léa', 'Martin', null, null, null, null, null],
  );
  insertHistoricalAppointment(db, appointmentLea);
  insertSchemaV5Sale(db, standaloneSale);
  insertSchemaV5Sale(db, linkedSale);
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v6 migration on an existing v5 database', () => {
  it('adds the Sale payment columns, keeps every Sale, and fabricates no payment', () => {
    const db = openSchemaV5Database();
    expect(readSchemaVersion(db)).toBe(5);
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(6);
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(countRows(db, 'sales')).toBe(2);
    expect(countRows(db, 'sale_items')).toBe(2);
    expect(countRows(db, 'appointments')).toBe(1);
    expect(snapshot.sales).toEqual([standaloneSale, linkedSale]);
    for (const sale of snapshot.sales) {
      expect('payment' in sale).toBe(false);
    }
    expect(snapshot.appointments).toEqual([appointmentLea]);
  });

  it('stores NULL in every new column for historical rows', () => {
    const db = openSchemaV5Database();
    migrateDatabase(db);

    expect(
      db.getAllSync<{ paid_at: string | null; card_amount_cents: number | null; cash_amount_cents: number | null }>(
        'SELECT paid_at, card_amount_cents, cash_amount_cents FROM sales ORDER BY rowid',
      ),
    ).toEqual([
      { paid_at: null, card_amount_cents: null, cash_amount_cents: null },
      { paid_at: null, card_amount_cents: null, cash_amount_cents: null },
    ]);
  });

  it('is a no-op when run again and never re-seeds', () => {
    const db = openSchemaV5Database();
    migrateDatabase(db);

    expect(migrateDatabase(db)).toBe(6);
    expect(readSeedVersion(db)).toBe(1);
    expect(loadSnapshot(db).sales).toEqual([standaloneSale, linkedSale]);
  });

  it('lets a new standalone Sale record its payment on the migrated database', () => {
    const db = openSchemaV5Database();
    migrateDatabase(db);
    const paidAt = new Date(2026, 8, 12, 15, 0);

    completeSale(
      db,
      { ...standaloneSale, id: 'sale-paid', payment: { paidAt, cardAmountCents: 3000, cashAmountCents: 2000 } },
      [],
    );

    expect(loadSales(db).map((sale) => [sale.id, sale.payment])).toEqual([
      ['sale-standalone', undefined],
      ['sale-linked', undefined],
      ['sale-paid', { paidAt, cardAmountCents: 3000, cashAmountCents: 2000 }],
    ]);
  });
});
