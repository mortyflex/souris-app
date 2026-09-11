// Souris — Product catalog store
//
// barcode is TEXT (leading zeroes preserved); stock_quantity is an integer
// with a >= 0 CHECK, so the database itself refuses negative stock.

import type { Product } from '@/domain/products';

import type { SourisDatabase } from '../database';
import { fromSqlBoolean, fromSqlOptional, toSqlBoolean, toSqlOptional } from '../values';

interface ProductRow {
  readonly id: string;
  readonly business_id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly barcode: string | null;
  readonly image_uri: string | null;
  readonly price: number;
  readonly stock_quantity: number;
  readonly active: number;
}

function toProduct(row: ProductRow): Product {
  const brand = fromSqlOptional(row.brand);
  const category = fromSqlOptional(row.category);
  const barcode = fromSqlOptional(row.barcode);
  const imageUri = fromSqlOptional(row.image_uri);
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    ...(brand !== undefined ? { brand } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(barcode !== undefined ? { barcode } : {}),
    ...(imageUri !== undefined ? { imageUri } : {}),
    price: row.price,
    stockQuantity: row.stock_quantity,
    active: fromSqlBoolean(row.active),
  };
}

const SELECT_PRODUCT =
  'SELECT id, business_id, name, brand, category, barcode, image_uri, price, stock_quantity, active FROM products';

export function loadProducts(db: SourisDatabase): readonly Product[] {
  return db.getAllSync<ProductRow>(`${SELECT_PRODUCT} ORDER BY rowid`).map(toProduct);
}

export function findProduct(db: SourisDatabase, productId: string): Product | undefined {
  const row = db.getFirstSync<ProductRow>(`${SELECT_PRODUCT} WHERE id = ?`, [productId]);
  return row ? toProduct(row) : undefined;
}

export function insertProduct(db: SourisDatabase, product: Product): void {
  db.runSync(
    'INSERT INTO products (id, business_id, name, brand, category, barcode, image_uri, price, stock_quantity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      product.id,
      product.businessId,
      product.name,
      toSqlOptional(product.brand),
      toSqlOptional(product.category),
      toSqlOptional(product.barcode),
      toSqlOptional(product.imageUri),
      product.price,
      product.stockQuantity,
      toSqlBoolean(product.active),
    ],
  );
}

/** Replaces every editable field of the Product with the same id; id/businessId never change. */
export function updateProduct(db: SourisDatabase, product: Product): void {
  const result = db.runSync(
    'UPDATE products SET name = ?, brand = ?, category = ?, barcode = ?, image_uri = ?, price = ?, stock_quantity = ?, active = ? WHERE id = ?',
    [
      product.name,
      toSqlOptional(product.brand),
      toSqlOptional(product.category),
      toSqlOptional(product.barcode),
      toSqlOptional(product.imageUri),
      product.price,
      product.stockQuantity,
      toSqlBoolean(product.active),
      product.id,
    ],
  );
  if (result.changes !== 1) {
    throw new Error(`updateProduct: Product "${product.id}" not found`);
  }
}

export function setProductActive(db: SourisDatabase, productId: string, active: boolean): void {
  db.runSync('UPDATE products SET active = ? WHERE id = ?', [toSqlBoolean(active), productId]);
}

export function setProductStock(
  db: SourisDatabase,
  productId: string,
  stockQuantity: number,
): void {
  db.runSync('UPDATE products SET stock_quantity = ? WHERE id = ?', [stockQuantity, productId]);
}

/** Removes the catalog record; Sale item snapshots are untouched. */
export function deleteProduct(db: SourisDatabase, productId: string): void {
  db.runSync('DELETE FROM products WHERE id = ?', [productId]);
}
