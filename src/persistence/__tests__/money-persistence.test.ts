// Souris — monetary persistence (schema v8): integer cents in SQLite, euro numbers in the domain

import { getAppointmentExpectedTotal, type Appointment, type Service } from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';
import type { Product } from '@/domain/products';
import { getSaleTotal, type Sale } from '@/domain/sales';
import { formatEuros } from '@/shared/lib/money';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { checkoutAppointment, insertAppointment, loadAppointments } from '../stores/appointments';
import { findProduct, insertProduct, updateProduct } from '../stores/products';
import { AppointmentProductDeleteConflictError, completeSale, deleteAppointmentProduct, loadSales } from '../stores/sales';
import { insertService, loadServices, updateService } from '../stores/services';
import { appointmentLea, clientLea, createTestSeed, productMask, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';
import { fromSqlPriceCents, toSqlPriceCents } from '../values';

function columnNames(db: SourisDatabase, table: string): readonly string[] {
  return db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name);
}

const serviceGloss: Service = {
  ...serviceCut,
  id: 'service-gloss',
  name: 'Gloss',
  price: 12.5,
};

const productElastic: Product = {
  ...productMask,
  id: 'product-elastic',
  name: 'Élastique',
  price: 0.29,
  stockQuantity: 40,
};

const appointment: Appointment = {
  ...appointmentLea,
  id: 'appointment-money',
  items: [
    { ...appointmentLea.items[0]!, id: 'appointment-money-item-0', price: 12.5 },
    { ...appointmentLea.items[1]!, id: 'appointment-money-item-1', price: 0.29 },
  ],
};

const sale: Sale = {
  id: 'sale-money',
  businessId: 'business-test',
  clientId: clientLea.id,
  appointmentId: appointment.id,
  completedAt: new Date(2026, 8, 11, 11, 0),
  items: [
    { id: 'sale-money-item-0', productId: productElastic.id, productName: 'Élastique', unitPrice: 0.99, quantity: 3 },
    { id: 'sale-money-item-1', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 19.99, quantity: 1 },
  ],
};

function openDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ services: [], products: [productMask, productElastic], appointments: [] }));
  return db;
}

describe('price cents conversion (values.ts)', () => {
  it.each([
    [12.5, 1250],
    [0.99, 99],
    [0.29, 29],
    [42, 4200],
    [0, 0],
    [1234.56, 123456],
    [19.99, 1999],
    [1.005, 101],
  ])('writes %p € as %p cents', (euros, cents) => {
    expect(toSqlPriceCents(euros, 'test')).toBe(cents);
  });

  it.each([
    [1250, 12.5],
    [99, 0.99],
    [29, 0.29],
    [0, 0],
    [123456, 1234.56],
  ])('reads %p cents as %p €', (cents, euros) => {
    expect(fromSqlPriceCents(cents)).toBe(euros);
  });

  it('round-trips every integer cents value exactly', () => {
    for (let cents = 0; cents <= 200_000; cents += 7) {
      expect(toSqlPriceCents(fromSqlPriceCents(cents), 'test')).toBe(cents);
    }
    expect(toSqlPriceCents(fromSqlPriceCents(99_999_999), 'test')).toBe(99_999_999);
  });

  it('refuses negative, non-finite and non-integer stored values', () => {
    expect(() => toSqlPriceCents(-0.01, 'services.price_cents')).toThrow(RangeError);
    expect(() => toSqlPriceCents(Number.NaN, 'services.price_cents')).toThrow(RangeError);
    expect(() => toSqlPriceCents(Number.POSITIVE_INFINITY, 'services.price_cents')).toThrow(RangeError);
    expect(() => fromSqlPriceCents(12.5)).toThrow(RangeError);
    expect(() => fromSqlPriceCents(-1)).toThrow(RangeError);
  });
});

describe('monetary persistence', () => {
  it('creates a fresh database without any euro REAL column', () => {
    const db = openDatabase();

    expect(columnNames(db, 'services')).toEqual(expect.arrayContaining(['price_cents']));
    expect(columnNames(db, 'services')).not.toContain('price');
    expect(columnNames(db, 'appointment_items')).toEqual(expect.arrayContaining(['price_cents']));
    expect(columnNames(db, 'appointment_items')).not.toContain('price');
    expect(columnNames(db, 'products')).toEqual(expect.arrayContaining(['price_cents']));
    expect(columnNames(db, 'products')).not.toContain('price');
    expect(columnNames(db, 'sale_items')).toEqual(expect.arrayContaining(['unit_price_cents']));
    expect(columnNames(db, 'sale_items')).not.toContain('unit_price');
  });

  it('round-trips Service, Product, Appointment snapshot and Sale prices exactly, stored as integer cents', () => {
    const db = openDatabase();

    insertService(db, serviceGloss);
    insertAppointment(db, appointment);
    completeSale(db, sale, [
      { productId: productElastic.id, quantity: 3 },
      { productId: productMask.id, quantity: 1 },
    ]);

    const snapshot = loadSnapshot(db);
    expect(snapshot.services).toEqual([serviceGloss]);
    expect(snapshot.products.map((product) => [product.id, product.price])).toEqual([
      ['product-mask', 50],
      ['product-elastic', 0.29],
    ]);
    expect(snapshot.appointments).toEqual([appointment]);
    expect(snapshot.sales).toEqual([sale]);
    expect(db.getFirstSync("SELECT price_cents, typeof(price_cents) AS kind FROM services WHERE id = 'service-gloss'")).toEqual({
      price_cents: 1250,
      kind: 'integer',
    });
    expect(db.getAllSync('SELECT id, price_cents, typeof(price_cents) AS kind FROM products ORDER BY rowid')).toEqual([
      { id: 'product-mask', price_cents: 5000, kind: 'integer' },
      { id: 'product-elastic', price_cents: 29, kind: 'integer' },
    ]);
    expect(db.getAllSync('SELECT id, price_cents FROM appointment_items ORDER BY item_order')).toEqual([
      { id: 'appointment-money-item-0', price_cents: 1250 },
      { id: 'appointment-money-item-1', price_cents: 29 },
    ]);
    expect(db.getAllSync('SELECT id, unit_price_cents, typeof(unit_price_cents) AS kind FROM sale_items ORDER BY position')).toEqual([
      { id: 'sale-money-item-0', unit_price_cents: 99, kind: 'integer' },
      { id: 'sale-money-item-1', unit_price_cents: 1999, kind: 'integer' },
    ]);
  });

  it('keeps edited catalog prices exact', () => {
    const db = openDatabase();
    insertService(db, serviceGloss);

    updateService(db, { ...serviceGloss, price: 42.05 });
    updateProduct(db, { ...productElastic, price: 0.3 });

    expect(loadServices(db)[0]?.price).toBe(42.05);
    expect(findProduct(db, productElastic.id)?.price).toBe(0.3);
    expect(db.getFirstSync("SELECT price_cents FROM services WHERE id = 'service-gloss'")).toEqual({ price_cents: 4205 });
    expect(db.getFirstSync("SELECT price_cents FROM products WHERE id = 'product-elastic'")).toEqual({ price_cents: 30 });
  });

  it('leaves the expected total, the Sale total, the Cash Register and the displayed euros unchanged after a restart', () => {
    const db = openDatabase();
    insertAppointment(db, appointment);
    completeSale(db, sale, [
      { productId: productElastic.id, quantity: 3 },
      { productId: productMask.id, quantity: 1 },
    ]);
    const paidAt = new Date(2026, 8, 11, 12, 0);
    checkoutAppointment(db, appointment.id, { paidAt, cardAmountCents: 2000, cashAmountCents: 1575 });
    const sources = { appointments: [{ ...appointment, status: 'COMPLETED' as const, payment: { paidAt, cardAmountCents: 2000, cashAmountCents: 1575 } }], sales: [sale] };

    const snapshot = loadSnapshot(db);

    expect(getAppointmentExpectedTotal(snapshot.appointments[0]!, snapshot.sales)).toEqual(
      getAppointmentExpectedTotal(sources.appointments[0]!, sources.sales),
    );
    expect(getAppointmentExpectedTotal(snapshot.appointments[0]!, snapshot.sales)).toEqual({
      servicesCents: 1279,
      productsCents: 2296,
      expectedTotalCents: 3575,
    });
    expect(getSaleTotal(snapshot.sales[0]!)).toBe(getSaleTotal(sale));
    expect(getCashRegisterDaySummary(snapshot, paidAt)).toEqual(getCashRegisterDaySummary(sources, paidAt));
    expect(getCashRegisterDaySummary(snapshot, paidAt)).toEqual({ totalCents: 3575, cardCents: 2000, cashCents: 1575, checkoutCount: 1 });
    expect(snapshot.appointments[0]?.items.map((item) => formatEuros(item.price))).toEqual(
      appointment.items.map((item) => formatEuros(item.price)),
    );
    expect(snapshot.sales[0]?.items.map((item) => formatEuros(item.unitPrice))).toEqual(
      sale.items.map((item) => formatEuros(item.unitPrice)),
    );
  });

  it('matches an Appointment-linked Product by its stored cents when removing it', () => {
    const db = openDatabase();
    insertAppointment(db, appointment);
    completeSale(db, sale, [
      { productId: productElastic.id, quantity: 3 },
      { productId: productMask.id, quantity: 1 },
    ]);

    expect(() =>
      deleteAppointmentProduct(db, appointment.id, { productId: productElastic.id, productName: 'Élastique', unitPrice: 0.98 }),
    ).toThrow(AppointmentProductDeleteConflictError);
    deleteAppointmentProduct(db, appointment.id, { productId: productElastic.id, productName: 'Élastique', unitPrice: 0.99 });

    expect(findProduct(db, productElastic.id)?.stockQuantity).toBe(40);
    expect(loadSales(db)[0]?.items.map((item) => item.id)).toEqual(['sale-money-item-1']);
    expect(loadAppointments(db)).toHaveLength(1);
  });

  it('refuses a negative or non-finite price before anything is written', () => {
    const db = openDatabase();

    expect(() => insertService(db, { ...serviceGloss, price: -1 })).toThrow(RangeError);
    expect(() => insertProduct(db, { ...productElastic, id: 'product-nan', price: Number.NaN })).toThrow(RangeError);

    expect(loadServices(db)).toEqual([]);
    expect(findProduct(db, 'product-nan')).toBeUndefined();
  });
});
