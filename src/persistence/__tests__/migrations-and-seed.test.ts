import { bootstrapPersistence } from '../bootstrap';
import { clearPersistedDataForDevelopment } from '../development-reset';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { readSeedVersion, seedDatabaseIfNeeded } from '../seed';
import { createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface CountRow {
  readonly count: number;
}

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

describe('schema migrations', () => {
  it('brings a fresh database to the current schema version', () => {
    const db = openTestDatabase();
    expect(readSchemaVersion(db)).toBe(0);

    expect(migrateDatabase(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(readSchemaVersion(db)).toBe(2);

    const tables = db
      .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'souris_metadata',
        'clients',
        'services',
        'service_phases',
        'appointments',
        'appointment_items',
        'appointment_phases',
        'products',
        'sales',
        'sale_items',
      ]),
    );
  });

  it('is idempotent and keeps existing rows', () => {
    const db = openTestDatabase();
    migrateDatabase(db);
    seedDatabaseIfNeeded(db, createTestSeed);
    const clients = countRows(db, 'clients');

    expect(migrateDatabase(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(countRows(db, 'clients')).toBe(clients);
  });

  it('refuses a database newer than this build instead of wiping it', () => {
    const db = openTestDatabase();
    migrateDatabase(db);
    db.execSync('PRAGMA user_version = 99');

    expect(() => migrateDatabase(db)).toThrow('newer than the supported');
    expect(countRows(db, 'clients')).toBe(0);
  });
});

describe('first-run seed', () => {
  it('seeds exactly once and marks the seed version', () => {
    const db = openTestDatabase();
    migrateDatabase(db);
    const createSeed = jest.fn(createTestSeed);

    expect(readSeedVersion(db)).toBeUndefined();
    expect(seedDatabaseIfNeeded(db, createSeed)).toBe(true);
    expect(readSeedVersion(db)).toBe(1);
    expect(seedDatabaseIfNeeded(db, createSeed)).toBe(false);
    expect(createSeed).toHaveBeenCalledTimes(1);
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'services')).toBe(2);
    expect(countRows(db, 'products')).toBe(2);
    expect(countRows(db, 'appointments')).toBe(1);
  });

  it('never duplicates records across restarts', () => {
    const db = openTestDatabase();
    const first = bootstrapPersistence(db, createTestSeed);
    const second = bootstrapPersistence(db, createTestSeed);

    expect(second.clients).toHaveLength(first.clients.length);
    expect(second.services).toHaveLength(first.services.length);
    expect(second.products).toHaveLength(first.products.length);
    expect(second.appointments).toHaveLength(first.appointments.length);
    expect(countRows(db, 'service_phases')).toBe(4);
    expect(countRows(db, 'appointment_items')).toBe(2);
  });

  it('does not re-seed an initialized database whose records were all deleted', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    db.execSync('DELETE FROM appointments; DELETE FROM products; DELETE FROM services; DELETE FROM clients;');

    const snapshot = bootstrapPersistence(db, createTestSeed);

    expect(snapshot.clients).toEqual([]);
    expect(snapshot.services).toEqual([]);
    expect(snapshot.products).toEqual([]);
    expect(snapshot.appointments).toEqual([]);
    expect(readSeedVersion(db)).toBe(1);
  });

  it('rolls the whole seed back when one record is invalid', () => {
    const db = openTestDatabase();
    migrateDatabase(db);
    const invalidSeed = createTestSeed({
      products: [createTestSeed().products[0]!, { ...createTestSeed().products[0]! }],
    });

    expect(() => seedDatabaseIfNeeded(db, () => invalidSeed)).toThrow();
    expect(readSeedVersion(db)).toBeUndefined();
    expect(countRows(db, 'clients')).toBe(0);
    expect(countRows(db, 'products')).toBe(0);
  });
});

describe('development reset', () => {
  it('clears every record and the seed marker so the next bootstrap seeds again', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    db.runSync("DELETE FROM clients WHERE id = 'client-lea'");

    clearPersistedDataForDevelopment(db);
    expect(readSeedVersion(db)).toBeUndefined();
    expect(readSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(countRows(db, 'appointment_phases')).toBe(0);

    const snapshot = bootstrapPersistence(db, createTestSeed);
    expect(snapshot.clients.map((client) => client.id)).toEqual(['client-lea']);
    expect(readSeedVersion(db)).toBe(1);
  });
});
