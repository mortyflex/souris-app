// Souris — schema v8: monetary values as integer cents (docs/architecture/PERSISTENCE.md §4)

import { getAppointmentExpectedTotal } from '@/domain/appointments';
import type { Appointment, Service } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';
import type { Product } from '@/domain/products';
import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { readBusinessProfile } from '../stores/business-profile';
import { insertProduct } from '../stores/products';
import { completeSale } from '../stores/sales';
import { insertService, updateService } from '../stores/services';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { loadSyncState } from '../sync/state';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import {
  insertHistoricalAppointment,
  insertHistoricalProduct,
  insertHistoricalService,
  insertSchemaV5Sale,
} from '../testing/historical-fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
}

function columns(db: SourisDatabase, table: string): readonly ColumnInfo[] {
  return db.getAllSync<ColumnInfo>(`PRAGMA table_info(${table})`);
}

function columnNames(db: SourisDatabase, table: string): readonly string[] {
  return columns(db, table).map((column) => column.name);
}

function idsInRowidOrder(db: SourisDatabase, table: string, idColumn = 'id'): readonly string[] {
  return db.getAllSync<{ id: string }>(`SELECT ${idColumn} AS id FROM ${table} ORDER BY rowid`).map((row) => row.id);
}

function countRows(db: SourisDatabase, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

/** Representative decimal prices that a REAL column cannot always hold exactly. */
const serviceGloss: Service = {
  id: 'service-gloss',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Gloss',
  type: 'SERVICE',
  price: 12.5,
  active: true,
  phases: [{ id: 'gloss', name: 'Gloss', durationMinutes: 20, requiresStaff: true }],
};

const serviceFringe: Service = {
  id: 'service-fringe',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Frange',
  type: 'SERVICE',
  price: 0.99,
  active: false,
  phases: [{ id: 'fringe', name: 'Frange', durationMinutes: 10, requiresStaff: true }],
};

const productElastic: Product = {
  id: 'product-elastic',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Élastique',
  price: 0.29,
  stockQuantity: 40,
  active: true,
};

const productSample: Product = {
  id: 'product-sample',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Échantillon',
  brand: 'Kérastase',
  barcode: '00012345',
  price: 0,
  stockQuantity: 3,
  active: true,
};

const productSerumLuxe: Product = {
  id: 'product-serum-luxe',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Sérum luxe',
  price: 1234.56,
  stockQuantity: 1,
  active: true,
};

const appointmentPaid: Appointment = {
  ...appointmentLea,
  id: 'appointment-paid',
  businessId: REMOTE_BUSINESS_ID,
  startAt: new Date(2026, 8, 10, 9, 30),
  status: 'COMPLETED',
  items: [
    { ...appointmentLea.items[0]!, id: 'appointment-paid-item-0', price: 12.5 },
    { ...appointmentLea.items[1]!, id: 'appointment-paid-item-1', price: 19.99 },
  ],
};

const paidAt = new Date(2026, 8, 10, 11, 0);

const saleLinked: Sale = {
  id: 'sale-linked',
  businessId: REMOTE_BUSINESS_ID,
  clientId: clientLea.id,
  appointmentId: appointmentPaid.id,
  completedAt: new Date(2026, 8, 10, 10, 45),
  items: [
    { id: 'sale-linked-item-0', productId: productElastic.id, productName: 'Élastique', unitPrice: 0.29, quantity: 3 },
    { id: 'sale-linked-item-1', productId: productSerumLuxe.id, productName: 'Sérum luxe', unitPrice: 1234.56, quantity: 1 },
    { id: 'sale-linked-item-2', productId: productSample.id, productName: 'Échantillon', unitPrice: 0, quantity: 2 },
  ],
};

const saleStandalone: Sale = {
  id: 'sale-standalone',
  businessId: REMOTE_BUSINESS_ID,
  completedAt: new Date(2026, 8, 10, 16, 0),
  items: [{ id: 'sale-standalone-item-0', productId: productElastic.id, productName: 'Élastique', unitPrice: 0.99, quantity: 1 }],
  payment: { paidAt: new Date(2026, 8, 10, 16, 0), cardAmountCents: 99, cashAmountCents: 0 },
};

/**
 * A database exactly as Cloud Sync V1B (schema v7) left it on a BOUND
 * device: euro REAL prices everywhere, a checked-out Appointment, a linked
 * and a paid standalone Sale, pending outbox rows and an acknowledged
 * remote revision.
 */
function openSchemaV7Database(): SourisDatabase {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 7)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 7');
  });
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, null, null, '02-29'],
  );
  insertHistoricalService(db, serviceGloss);
  insertHistoricalService(db, serviceFringe);
  insertHistoricalProduct(db, productElastic);
  insertHistoricalProduct(db, productSample);
  insertHistoricalProduct(db, productSerumLuxe);
  insertHistoricalAppointment(db, appointmentPaid);
  db.runSync('UPDATE appointments SET paid_at = ?, card_amount_cents = ?, cash_amount_cents = ? WHERE id = ?', [
    paidAt.toISOString(),
    3000,
    349,
    appointmentPaid.id,
  ]);
  insertSchemaV5Sale(db, saleLinked);
  insertSchemaV5Sale(db, saleStandalone);
  db.runSync('UPDATE sales SET paid_at = ?, card_amount_cents = 99, cash_amount_cents = 0 WHERE id = ?', [
    saleStandalone.payment!.paidAt.toISOString(),
    saleStandalone.id,
  ]);
  db.runSync(
    "INSERT INTO business_profile (singleton, id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at) VALUES (1, ?, ?, 'Léa', 'Martin', 'Maison Léa', 'HAIRDRESSING', '06 12 34 56 78', '2026-09-12T10:00:00.000Z', '2026-09-12T10:00:00.000Z')",
    [REMOTE_BUSINESS_ID, remoteBusinessProfile.ownerUserId],
  );
  db.runSync(
    "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at) VALUES (?, 'SERVICE', 'service-gloss', 'UPSERT', 2, '2026-09-13T08:00:00.000Z', '2026-09-13T09:00:00.000Z', 1, 'network', '2026-09-13T09:05:00.000Z')",
    [REMOTE_BUSINESS_ID],
  );
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'PRODUCT', 'product-sample', 4, '2026-09-13T08:00:00.000Z')",
    [REMOTE_BUSINESS_ID],
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

const expectedSnapshot = {
  clients: [clientLea],
  services: [serviceGloss, serviceFringe],
  products: [productElastic, productSample, productSerumLuxe],
  appointments: [{ ...appointmentPaid, payment: { paidAt, cardAmountCents: 3000, cashAmountCents: 349 } }],
  sales: [saleLinked, saleStandalone],
  calendarBlocks: [],
};

describe('schema v8 migration on an existing v7 database', () => {
  it('replaces the euro REAL columns with exact integer cents and keeps every record, the binding and the seed marker', () => {
    const db = openSchemaV7Database();
    expect(readSchemaVersion(db)).toBe(7);
    expect(columnNames(db, 'services')).toContain('price');
    expect(columnNames(db, 'sale_items')).toContain('unit_price');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(11);
    expect(CURRENT_SCHEMA_VERSION).toBe(11);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(readBusinessProfile(db)).toEqual(remoteBusinessProfile);
    expect(snapshot).toEqual(expectedSnapshot);

    expect(db.getAllSync<{ id: string; price_cents: number; kind: string }>(
      'SELECT id, price_cents, typeof(price_cents) AS kind FROM services ORDER BY rowid',
    )).toEqual([
      { id: 'service-gloss', price_cents: 1250, kind: 'integer' },
      { id: 'service-fringe', price_cents: 99, kind: 'integer' },
    ]);
    expect(db.getAllSync<{ id: string; price_cents: number; kind: string }>(
      'SELECT id, price_cents, typeof(price_cents) AS kind FROM products ORDER BY rowid',
    )).toEqual([
      { id: 'product-elastic', price_cents: 29, kind: 'integer' },
      { id: 'product-sample', price_cents: 0, kind: 'integer' },
      { id: 'product-serum-luxe', price_cents: 123456, kind: 'integer' },
    ]);
    expect(db.getAllSync<{ id: string; item_order: number; price_cents: number; kind: string }>(
      'SELECT id, item_order, price_cents, typeof(price_cents) AS kind FROM appointment_items ORDER BY item_order',
    )).toEqual([
      { id: 'appointment-paid-item-0', item_order: 0, price_cents: 1250, kind: 'integer' },
      { id: 'appointment-paid-item-1', item_order: 1, price_cents: 1999, kind: 'integer' },
    ]);
    expect(db.getAllSync<{ sale_id: string; id: string; position: number; unit_price_cents: number; kind: string }>(
      'SELECT sale_id, id, position, unit_price_cents, typeof(unit_price_cents) AS kind FROM sale_items ORDER BY sale_id, position',
    )).toEqual([
      { sale_id: 'sale-linked', id: 'sale-linked-item-0', position: 0, unit_price_cents: 29, kind: 'integer' },
      { sale_id: 'sale-linked', id: 'sale-linked-item-1', position: 1, unit_price_cents: 123456, kind: 'integer' },
      { sale_id: 'sale-linked', id: 'sale-linked-item-2', position: 2, unit_price_cents: 0, kind: 'integer' },
      { sale_id: 'sale-standalone', id: 'sale-standalone-item-0', position: 0, unit_price_cents: 99, kind: 'integer' },
    ]);
  });

  it('drops the legacy REAL columns and constrains the cents columns', () => {
    const db = openSchemaV7Database();
    migrateDatabase(db);

    for (const [table, legacy, cents] of [
      ['services', 'price', 'price_cents'],
      ['appointment_items', 'price', 'price_cents'],
      ['products', 'price', 'price_cents'],
      ['sale_items', 'unit_price', 'unit_price_cents'],
    ] as const) {
      const names = columnNames(db, table);
      expect({ table, hasLegacy: names.includes(legacy) }).toEqual({ table, hasLegacy: false });
      const column = columns(db, table).find((candidate) => candidate.name === cents);
      expect({ table, type: column?.type, notnull: column?.notnull }).toEqual({ table, type: 'INTEGER', notnull: 1 });
    }
    expect(() =>
      db.runSync("INSERT INTO services (id, business_id, name, type, price_cents, active) VALUES ('service-neg', ?, 'Neg', 'SERVICE', -1, 1)", [
        REMOTE_BUSINESS_ID,
      ]),
    ).toThrow();
    expect(() =>
      db.runSync("UPDATE sale_items SET unit_price_cents = -1 WHERE id = 'sale-standalone-item-0'"),
    ).toThrow();
  });

  it('keeps every id, rowid order, relationship, checkout cents and sync bookkeeping row exactly', () => {
    const db = openSchemaV7Database();
    const before = {
      clients: idsInRowidOrder(db, 'clients'),
      services: idsInRowidOrder(db, 'services'),
      servicePhases: db.getAllSync('SELECT service_id, position, id, name, duration_minutes, requires_staff FROM service_phases ORDER BY rowid'),
      products: idsInRowidOrder(db, 'products'),
      appointments: db.getAllSync('SELECT id, business_id, client_id, staff_member_id, start_at, status, notes, paid_at, card_amount_cents, cash_amount_cents FROM appointments ORDER BY rowid'),
      appointmentItems: idsInRowidOrder(db, 'appointment_items'),
      appointmentPhases: db.getAllSync('SELECT appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff FROM appointment_phases ORDER BY rowid'),
      sales: db.getAllSync('SELECT id, business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents FROM sales ORDER BY rowid'),
      saleItems: idsInRowidOrder(db, 'sale_items'),
      outbox: db.getAllSync('SELECT * FROM sync_outbox ORDER BY id'),
      state: db.getAllSync('SELECT * FROM sync_state ORDER BY rowid'),
    };

    migrateDatabase(db);

    expect({
      clients: idsInRowidOrder(db, 'clients'),
      services: idsInRowidOrder(db, 'services'),
      servicePhases: db.getAllSync('SELECT service_id, position, id, name, duration_minutes, requires_staff FROM service_phases ORDER BY rowid'),
      products: idsInRowidOrder(db, 'products'),
      appointments: db.getAllSync('SELECT id, business_id, client_id, staff_member_id, start_at, status, notes, paid_at, card_amount_cents, cash_amount_cents FROM appointments ORDER BY rowid'),
      appointmentItems: idsInRowidOrder(db, 'appointment_items'),
      appointmentPhases: db.getAllSync('SELECT appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff FROM appointment_phases ORDER BY rowid'),
      sales: db.getAllSync('SELECT id, business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents FROM sales ORDER BY rowid'),
      saleItems: idsInRowidOrder(db, 'sale_items'),
      outbox: db.getAllSync('SELECT * FROM sync_outbox ORDER BY id'),
      state: db.getAllSync('SELECT * FROM sync_state ORDER BY rowid'),
    }).toEqual(before);
    expect(before.services).toEqual(['service-gloss', 'service-fringe']);
    expect(before.saleItems).toEqual(['sale-linked-item-0', 'sale-linked-item-1', 'sale-linked-item-2', 'sale-standalone-item-0']);
    expect(countRows(db, 'service_phases')).toBe(2);
    expect(countRows(db, 'appointment_phases')).toBe(4);
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(1);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateId, entry.revision, entry.attemptCount])).toEqual([
      ['service-gloss', 2, 1],
    ]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateId, entry.remoteVersion])).toEqual([
      ['product-sample', 4],
    ]);
  });

  it('leaves the user-visible euro totals unchanged', () => {
    const db = openSchemaV7Database();
    const expectedTotal = getAppointmentExpectedTotal(expectedSnapshot.appointments[0]!, expectedSnapshot.sales);
    const expectedCashRegister = getCashRegisterDaySummary(expectedSnapshot, paidAt);

    migrateDatabase(db);
    const snapshot = loadSnapshot(db);

    expect(getAppointmentExpectedTotal(snapshot.appointments[0]!, snapshot.sales)).toEqual(expectedTotal);
    expect(expectedTotal).toEqual({
      servicesCents: 3249,
      discountCents: 0,
      productsCents: 123543,
      expectedTotalCents: 126792,
    });
    expect(getCashRegisterDaySummary(snapshot, paidAt)).toEqual(expectedCashRegister);
    expect(expectedCashRegister).toEqual({ totalCents: 3448, cardCents: 3099, cashCents: 349, checkoutCount: 2 });
  });

  it('is a no-op when run again', () => {
    const db = openSchemaV7Database();
    migrateDatabase(db);
    const before = loadSnapshot(db);

    expect(migrateDatabase(db)).toBe(11);
    expect(loadSnapshot(db)).toEqual(before);
    expect(db.getAllSync('SELECT price_cents FROM services ORDER BY rowid')).toEqual([{ price_cents: 1250 }, { price_cents: 99 }]);
  });

  it('persists new and edited prices as integer cents on the migrated database', () => {
    const db = openSchemaV7Database();
    migrateDatabase(db);

    insertService(db, { ...serviceGloss, id: 'service-new', name: 'Soin', price: 7.5 });
    updateService(db, { ...serviceFringe, price: 42.05 });
    insertProduct(db, { ...productSample, id: 'product-new', name: 'Peigne', price: 3.3 });
    completeSale(db, { ...saleStandalone, id: 'sale-new', payment: undefined, items: [{ ...saleStandalone.items[0]!, id: 'sale-new-item-0', unitPrice: 19.99 }] }, [
      { productId: productElastic.id, quantity: 1 },
    ]);

    expect(db.getAllSync('SELECT id, price_cents FROM services ORDER BY rowid')).toEqual([
      { id: 'service-gloss', price_cents: 1250 },
      { id: 'service-fringe', price_cents: 4205 },
      { id: 'service-new', price_cents: 750 },
    ]);
    expect(db.getFirstSync("SELECT price_cents FROM products WHERE id = 'product-new'")).toEqual({ price_cents: 330 });
    expect(db.getFirstSync("SELECT unit_price_cents FROM sale_items WHERE id = 'sale-new-item-0'")).toEqual({ unit_price_cents: 1999 });
    const snapshot = loadSnapshot(db);
    expect(snapshot.services.map((service) => [service.id, service.price])).toEqual([
      ['service-gloss', 12.5],
      ['service-fringe', 42.05],
      ['service-new', 7.5],
    ]);
    expect(snapshot.sales.find((sale) => sale.id === 'sale-new')?.items[0]?.unitPrice).toBe(19.99);
  });
});
