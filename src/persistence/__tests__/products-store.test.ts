import type { Product } from '@/domain/products';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import {
  deleteProduct,
  findProduct,
  insertProduct,
  loadProducts,
  setProductActive,
  setProductStock,
  updateProduct,
} from '../stores/products';
import { createTestSeed, productMask, productSerum } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

describe('Product store', () => {
  it('keeps a created Product, its durable image URI, and its exact barcode across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ products: [] }));
    const created: Product = { ...productMask, barcode: '0123456789' };

    insertProduct(db, created);

    const reloaded = loadSnapshot(db).products;
    expect(reloaded).toEqual([created]);
    expect(reloaded[0]?.barcode).toBe('0123456789');
    expect(reloaded[0]?.imageUri).toBe('file:///app/Documents/products/product-mask-1.jpg');
    expect(
      db.getFirstSync<{ barcode: unknown }>("SELECT barcode FROM products WHERE id = 'product-mask'")?.barcode,
    ).toBe('0123456789');
  });

  it('keeps stock and activation changes across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    setProductStock(db, productMask.id, 12);
    setProductActive(db, productSerum.id, false);

    expect(loadProducts(db).map((product) => [product.id, product.stockQuantity, product.active])).toEqual([
      ['product-mask', 12, true],
      ['product-serum', 1, false],
    ]);
  });

  it('keeps edits with stable identity and drops removed optional fields', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const edited: Product = {
      id: productMask.id,
      businessId: productMask.businessId,
      name: 'Masque premium',
      price: 55,
      stockQuantity: 3,
      active: true,
    };

    updateProduct(db, edited);

    expect(findProduct(db, productMask.id)).toEqual(edited);
    expect(Object.keys(findProduct(db, productMask.id) ?? {})).not.toContain('imageUri');
  });

  it('refuses negative stock at the database level', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => setProductStock(db, productMask.id, -1)).toThrow();
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
  });

  it('keeps a deletion across a restart and treats unknown ids as a no-op', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    deleteProduct(db, productMask.id);
    deleteProduct(db, 'product-unknown');

    expect(loadProducts(db).map((product) => product.id)).toEqual(['product-serum']);
  });
});
