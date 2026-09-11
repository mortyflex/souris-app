import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';

import { createInitialProductCatalog, createInitialProductImport } from '../initial-products';

describe('initial Product catalog', () => {
  it('composes the real legacy source deterministically', () => {
    const first = createInitialProductCatalog();
    const second = createInitialProductCatalog();

    expect(first).toHaveLength(50);
    expect(first.map((product) => product.id)).toEqual(
      second.map((product) => product.id),
    );
    expect(first.every((product) => product.businessId === DEVELOPMENT_BUSINESS_ID)).toBe(
      true,
    );
  });

  it('contains no duplicate product identity or equivalent source record', () => {
    const products = createInitialProductCatalog();
    const ids = products.map((product) => product.id);
    const equivalents = products.map((product) => `${product.name}:${product.barcode}`);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(equivalents).size).toBe(equivalents.length);
  });

  it('seeds the real data truthfully (barcodes as strings, zero prices kept)', () => {
    const products = createInitialProductCatalog();

    expect(products.every((product) => typeof product.barcode === 'string')).toBe(true);
    expect(products.some((product) => product.barcode === '0884486532879')).toBe(true);
    expect(products.some((product) => product.price === 0)).toBe(true);
    expect(products.every((product) => product.stockQuantity === 0)).toBe(true);
    expect(products.every((product) => product.active)).toBe(true);
    expect(products.every((product) => product.imageUri === undefined)).toBe(true);
  });

  it('reports a clean import for the real dataset', () => {
    expect(createInitialProductImport().diagnostics).toEqual([]);
  });
});
