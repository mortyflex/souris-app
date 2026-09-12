// Souris — schema v3 + local account binding
//
// A genuine schema-v2 database (as Persistence V2 left it on a device) is
// migrated to v3 and then bound to a remote Business. Every operational row
// must survive both steps untouched except for the business ownership column.

import type { BusinessProfile } from '@/domain/business';
import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import {
  bindLocalDatabaseToBusiness,
  listLocalBusinessIds,
  LocalAccountBindingError,
  readBusinessProfile,
} from '../stores/business-profile';
import { insertAppointment } from '../stores/appointments';
import { insertClient } from '../stores/clients';
import { insertProduct } from '../stores/products';
import { completeSale } from '../stores/sales';
import { insertService } from '../stores/services';
import {
  appointmentLea,
  BUSINESS_ID,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  serviceColor,
  serviceCut,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface CountRow {
  readonly count: number;
}

function countRows(db: SourisDatabase, table: string): number {
  return db.getFirstSync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

const saleLea: Sale = {
  id: 'sale-lea',
  businessId: BUSINESS_ID,
  clientId: clientLea.id,
  completedAt: new Date(2026, 8, 10, 15),
  items: [
    { id: 'sale-lea-item', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
  ],
};

const REMOTE_BUSINESS_ID = '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f';
const OWNER_USER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const remoteProfile: BusinessProfile = {
  id: REMOTE_BUSINESS_ID,
  ownerUserId: OWNER_USER_ID,
  ownerFirstName: 'Léa',
  ownerLastName: 'Martin',
  name: 'Maison Léa',
  activityType: 'HAIRDRESSING',
  phone: '06 12 34 56 78',
  createdAt: new Date('2026-09-12T10:00:00.000Z'),
  updatedAt: new Date('2026-09-12T10:00:00.000Z'),
};

/**
 * A database exactly as Persistence V2 left it on a device: schema v1 + v2
 * only, seeded and marked, with real Clients, Services, Appointments,
 * Products, and a Sale — and NO business_profile table yet.
 */
function openSchemaV2Database(): SourisDatabase {
  const db = openTestDatabase();
  for (const version of [1, 2]) {
    const migration = migrations.find((candidate) => candidate.version === version);
    if (!migration) throw new Error(`schema v${version} migration missing`);
    db.withTransactionSync(() => {
      migration.up(db);
      db.execSync(`PRAGMA user_version = ${version}`);
    });
  }
  const seed = createTestSeed();
  db.withTransactionSync(() => {
    for (const client of seed.clients) insertClient(db, client);
    for (const service of seed.services) insertService(db, service);
    for (const product of seed.products) insertProduct(db, product);
    for (const appointment of seed.appointments) insertAppointment(db, appointment);
    completeSale(db, saleLea, []);
    db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  });
  return db;
}

function snapshotWithoutBusinessIds(db: SourisDatabase) {
  const snapshot = loadSnapshot(db);
  const strip = <T extends { readonly businessId?: string }>(record: T) => {
    const { businessId: _ignored, ...rest } = record;
    return rest;
  };
  return {
    clients: snapshot.clients,
    services: snapshot.services.map(strip),
    products: snapshot.products.map(strip),
    appointments: snapshot.appointments.map(strip),
    sales: snapshot.sales.map(strip),
  };
}

describe('schema v3 migration on an existing v2 database', () => {
  it('adds business_profile, keeps every record, has no binding, and reruns as a no-op', () => {
    const db = openSchemaV2Database();
    const before = snapshotWithoutBusinessIds(db);
    expect(readSchemaVersion(db)).toBe(2);

    expect(migrateDatabase(db)).toBe(3);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);

    expect(snapshotWithoutBusinessIds(db)).toEqual(before);
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'services')).toBe(2);
    expect(countRows(db, 'service_phases')).toBe(4);
    expect(countRows(db, 'appointments')).toBe(1);
    expect(countRows(db, 'appointment_items')).toBe(2);
    expect(countRows(db, 'products')).toBe(2);
    expect(countRows(db, 'sales')).toBe(1);
    expect(countRows(db, 'sale_items')).toBe(1);
    expect(readSeedVersion(db)).toBe(1);
    expect(readBusinessProfile(db)).toBeUndefined();
    expect(listLocalBusinessIds(db)).toEqual([BUSINESS_ID]);

    expect(migrateDatabase(db)).toBe(3);
    expect(countRows(db, 'business_profile')).toBe(0);
    expect(snapshotWithoutBusinessIds(db)).toEqual(before);
  });

  it('does not re-seed a migrated database through the normal bootstrap', () => {
    const db = openSchemaV2Database();
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(createSeed).not.toHaveBeenCalled();
    expect(snapshot.clients).toHaveLength(1);
    expect(readSchemaVersion(db)).toBe(3);
  });
});

describe('account binding', () => {
  it('persists the profile and rewrites every business_id column to the remote Business id', () => {
    const db = openSchemaV2Database();
    migrateDatabase(db);
    const before = snapshotWithoutBusinessIds(db);

    bindLocalDatabaseToBusiness(db, remoteProfile);

    expect(readBusinessProfile(db)).toEqual(remoteProfile);
    expect(listLocalBusinessIds(db)).toEqual([REMOTE_BUSINESS_ID]);
    const after = loadSnapshot(db);
    expect(after.services.every((service) => service.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    expect(after.products.every((product) => product.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    expect(after.appointments.every((entry) => entry.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    expect(after.sales.every((sale) => sale.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    // Identities, snapshots, and relationships are exactly what they were.
    expect(snapshotWithoutBusinessIds(db)).toEqual(before);
    expect(after.appointments[0]?.clientId).toBe(clientLea.id);
    expect(after.appointments[0]?.items.map((item) => item.serviceId)).toEqual([
      serviceColor.id,
      serviceCut.id,
    ]);
    expect(after.sales[0]?.items[0]?.productId).toBe(productSerum.id);
    expect(after.products.map((product) => product.id)).toEqual([productMask.id, productSerum.id]);
    expect(after.appointments[0]?.id).toBe(appointmentLea.id);
  });

  it('restores the binding on the next bootstrap without touching data', () => {
    const db = openSchemaV2Database();
    migrateDatabase(db);
    bindLocalDatabaseToBusiness(db, remoteProfile);

    const snapshot = bootstrapPersistence(db, createTestSeed);

    expect(readBusinessProfile(db)).toEqual(remoteProfile);
    expect(snapshot.clients).toHaveLength(1);
    expect(snapshot.services.every((service) => service.businessId === REMOTE_BUSINESS_ID)).toBe(true);
  });

  it('binds an empty (fresh) database with no rows to rewrite', () => {
    const db = openTestDatabase();
    migrateDatabase(db);

    bindLocalDatabaseToBusiness(db, remoteProfile);

    expect(readBusinessProfile(db)).toEqual(remoteProfile);
    expect(listLocalBusinessIds(db)).toEqual([]);
  });

  it('re-binding the same owner and Business refreshes the cached profile', () => {
    const db = openSchemaV2Database();
    migrateDatabase(db);
    bindLocalDatabaseToBusiness(db, remoteProfile);

    const renamed = { ...remoteProfile, name: 'Atelier Léa', updatedAt: new Date('2026-09-13T08:00:00.000Z') };
    bindLocalDatabaseToBusiness(db, renamed);

    expect(readBusinessProfile(db)).toEqual(renamed);
    expect(countRows(db, 'business_profile')).toBe(1);
    expect(listLocalBusinessIds(db)).toEqual([REMOTE_BUSINESS_ID]);
  });

  it('refuses to attach a database bound to one owner to another account', () => {
    const db = openSchemaV2Database();
    migrateDatabase(db);
    bindLocalDatabaseToBusiness(db, remoteProfile);
    const before = loadSnapshot(db);

    const other: BusinessProfile = {
      ...remoteProfile,
      id: 'other-business',
      ownerUserId: 'other-user',
      name: 'Studio B',
    };
    expect(() => bindLocalDatabaseToBusiness(db, other)).toThrow(LocalAccountBindingError);
    try {
      bindLocalDatabaseToBusiness(db, other);
    } catch (error) {
      expect((error as LocalAccountBindingError).code).toBe('ALREADY_BOUND_TO_OTHER_ACCOUNT');
    }

    expect(readBusinessProfile(db)).toEqual(remoteProfile);
    expect(loadSnapshot(db)).toEqual(before);
  });

  it('refuses to merge operational rows that reference several business ids', () => {
    const db = openSchemaV2Database();
    migrateDatabase(db);
    insertProduct(db, { ...productSerum, id: 'product-foreign', businessId: 'another-business' });
    const before = loadSnapshot(db);

    expect(() => bindLocalDatabaseToBusiness(db, remoteProfile)).toThrow(LocalAccountBindingError);
    try {
      bindLocalDatabaseToBusiness(db, remoteProfile);
    } catch (error) {
      expect((error as LocalAccountBindingError).code).toBe('MULTIPLE_LOCAL_BUSINESS_IDS');
    }

    expect(readBusinessProfile(db)).toBeUndefined();
    expect(loadSnapshot(db)).toEqual(before);
    expect(listLocalBusinessIds(db)).toEqual(['another-business', BUSINESS_ID]);
  });

  it('rolls everything back when a rewrite fails midway', () => {
    const inner = openSchemaV2Database();
    migrateDatabase(inner);
    const before = loadSnapshot(inner);
    const failing: SourisDatabase = {
      ...inner,
      runSync: (sql, params) => {
        if (sql.startsWith('UPDATE sales')) {
          throw new Error('disk I/O error');
        }
        return inner.runSync(sql, params);
      },
    };

    expect(() => bindLocalDatabaseToBusiness(failing, remoteProfile)).toThrow('disk I/O error');

    expect(readBusinessProfile(inner)).toBeUndefined();
    expect(listLocalBusinessIds(inner)).toEqual([BUSINESS_ID]);
    expect(loadSnapshot(inner)).toEqual(before);
    expect(inner.isInTransactionSync()).toBe(false);
  });
});
