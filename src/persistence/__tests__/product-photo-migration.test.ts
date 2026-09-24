// Souris — schema v14: Product photo reference (docs/architecture/PERSISTENCE.md §4)

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { findProduct, loadProducts, setProductStock, updateProduct } from '../stores/products';
import { createTestSeed, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const LEGACY_IMAGE = 'file:///app/Documents/products/product-mask-1700000000000-1.jpg';
const PHOTO = '11111111-1111-4111-8111-111111111111/products/product-mask/photo-1.jpg';

/** A database exactly as the previous build (schema v13) leaves it: one Product with a legacy local image. */
function openSchemaV13Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 13)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 13');
  });
  const insert =
    'INSERT INTO products (id, business_id, name, brand, category, barcode, image_uri, price_cents, stock_quantity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insert, ['product-mask', 'business-remote', 'Masque', 'Redken', 'Soin', '0088', LEGACY_IMAGE, 5000, 5, 1]);
  db.runSync(insert, ['product-serum', 'business-remote', 'Sérum', null, null, null, null, 3200, 0, 0]);
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-remote', 'PRODUCT', 'product-mask', 3, '2026-09-18T08:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

const COLUMNS = 'rowid, id, business_id, name, brand, category, barcode, image_uri, price_cents, stock_quantity, active';

describe('schema v14 migration on an existing v13 database', () => {
  it('adds a NULL photo_path and keeps every Product — legacy image_uri included — untouched', () => {
    const db = openSchemaV13Database();
    const productsBefore = db.getAllSync(`SELECT ${COLUMNS} FROM products ORDER BY rowid`);
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id');

    const snapshot = bootstrapPersistence(db, createTestSeed);

    expect(readSchemaVersion(db)).toBe(14);
    expect(CURRENT_SCHEMA_VERSION).toBe(14);
    expect(db.getAllSync(`SELECT ${COLUMNS} FROM products ORDER BY rowid`)).toEqual(productsBefore);
    expect(db.getAllSync('SELECT photo_path FROM products')).toEqual([{ photo_path: null }, { photo_path: null }]);
    // Nothing is queued: no legacy image is ever promoted by the migration.
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id')).toEqual(stateBefore);
    expect(snapshot.products.find((product) => product.id === 'product-mask')).toMatchObject({ imageUri: LEGACY_IMAGE });
    for (const product of snapshot.products) {
      expect('photoPath' in product).toBe(false);
    }
  });

  it('is idempotent', () => {
    const db = openSchemaV13Database();
    bootstrapPersistence(db, createTestSeed);
    expect(migrateDatabase(db)).toBe(14);
    expect(loadProducts(db)).toHaveLength(2);
  });
});

describe('Product photo reference in the store', () => {
  function openMigrated() {
    const db = openSchemaV13Database();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    db.runSync('DELETE FROM sync_outbox');
    return db;
  }

  it('persists photoPath next to the legacy image and marks the PRODUCT aggregate for sync', () => {
    const db = openMigrated();
    const mask = findProduct(db, 'product-mask')!;

    updateProduct(db, { ...mask, photoPath: PHOTO });
    expect(findProduct(db, 'product-mask')).toEqual({ ...mask, photoPath: PHOTO });
    expect(db.getAllSync('SELECT aggregate_type, aggregate_id FROM sync_outbox')).toEqual([
      { aggregate_type: 'PRODUCT', aggregate_id: 'product-mask' },
    ]);
  });

  it('keeps photoPath through a stock change', () => {
    const db = openMigrated();
    updateProduct(db, { ...findProduct(db, 'product-mask')!, photoPath: PHOTO });
    setProductStock(db, 'product-mask', 2);
    expect(loadSnapshot(db).products.find((product) => product.id === 'product-mask')).toMatchObject({
      photoPath: PHOTO,
      stockQuantity: 2,
    });
  });
});
