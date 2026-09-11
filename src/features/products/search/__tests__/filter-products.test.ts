import type { Product } from '@/domain/products';

import {
  filterProducts,
  findProductsByBarcode,
  prepareProductDirectory,
  sortProductsByName,
} from '../filter-products';

function product(id: string, fields: Partial<Product> = {}): Product {
  return {
    id,
    businessId: 'business-test',
    name: id,
    price: 10,
    stockQuantity: 0,
    active: true,
    ...fields,
  };
}

const catalog: readonly Product[] = [
  product('a', { name: 'Shampooing Éclat', brand: 'Redken', category: 'Shampooing', barcode: '0884486532879' }),
  product('b', { name: 'Masque réparateur', brand: 'Tigi', category: 'Soin', barcode: '3474637152000' }),
  product('c', { name: 'Gel coiffant', brand: 'Crazy Color', category: 'Coiffage', barcode: '0001234567890' }),
];

describe('filterProducts', () => {
  it('matches names case-insensitively', () => {
    expect(filterProducts(catalog, 'SHAMPOOING').map((p) => p.id)).toEqual(['a']);
  });

  it('matches names accent-insensitively', () => {
    expect(filterProducts(catalog, 'eclat').map((p) => p.id)).toEqual(['a']);
  });

  it('matches brand', () => {
    expect(filterProducts(catalog, 'redken').map((p) => p.id)).toEqual(['a']);
  });

  it('matches category', () => {
    expect(filterProducts(catalog, 'coiffage').map((p) => p.id)).toEqual(['c']);
  });

  it('matches barcode exactly as entered, preserving leading zeroes', () => {
    expect(filterProducts(catalog, '0884486532879').map((p) => p.id)).toEqual(['a']);
    expect(filterProducts(catalog, '0001234567890').map((p) => p.id)).toEqual(['c']);
    expect(filterProducts(catalog, '884486532879')).toEqual([]);
    expect(filterProducts(catalog, '0884486')).toEqual([]);
  });

  it('returns no matches for a blank query and never mutates the source', () => {
    const before = JSON.stringify(catalog);
    expect(filterProducts(catalog, '   ')).toEqual([]);
    expect(JSON.stringify(catalog)).toBe(before);
  });
});

describe('sortProductsByName', () => {
  it('orders products by French alphabetical name without mutation', () => {
    const unordered = [
      product('z', { name: 'Gel coiffant' }),
      product('y', { name: 'Éclat shampooing' }),
      product('x', { name: 'Masque' }),
    ];
    const before = JSON.stringify(unordered);

    expect(sortProductsByName(unordered).map((p) => p.name)).toEqual([
      'Éclat shampooing',
      'Gel coiffant',
      'Masque',
    ]);
    expect(JSON.stringify(unordered)).toBe(before);
  });
});

describe('prepareProductDirectory', () => {
  it('filters by query and sorts deterministically', () => {
    expect(prepareProductDirectory(catalog, 'reparateur').map((p) => p.id)).toEqual(['b']);
    expect(prepareProductDirectory(catalog, '').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('findProductsByBarcode', () => {
  it('matches the exact trimmed string while preserving leading zeroes', () => {
    expect(findProductsByBarcode(catalog, ' 0884486532879 ').map((p) => p.id)).toEqual(['a']);
    expect(findProductsByBarcode(catalog, '884486532879')).toEqual([]);
  });

  it('returns every duplicate match without mutating the source', () => {
    const duplicated = [
      ...catalog,
      product('duplicate', { barcode: '0884486532879' }),
    ];
    const before = JSON.stringify(duplicated);

    expect(findProductsByBarcode(duplicated, '0884486532879').map((p) => p.id)).toEqual([
      'a',
      'duplicate',
    ]);
    expect(JSON.stringify(duplicated)).toBe(before);
  });

  it('returns no match for unknown or blank barcodes', () => {
    expect(findProductsByBarcode(catalog, '9999999999999')).toEqual([]);
    expect(findProductsByBarcode(catalog, '   ')).toEqual([]);
  });
});
