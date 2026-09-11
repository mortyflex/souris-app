import {
  mapLegacyProductCategory,
  mapLegacyProducts,
  normalizeLegacyProduct,
  type LegacyProduct,
} from '../legacy-products-adapter';

const businessId = 'business-test';

// REAL representative shapes from src/features/products/data/legacy-products.ts
const realLegacyProduct = Object.freeze({
  _id: '6974bff937a5d89c2d9afbd0',
  title: 'Masque réparateur 5 min',
  type: 'hair-care',
  brand: 'Redken',
  line: 'Acidic Bonding Concentrate',
  barcode: '3474637152000',
  capacity: '250 ml',
  price: 50,
});

const realZeroPriceProduct = Object.freeze({
  _id: '5f9573a93276b219de52716e',
  title: 'Poudre blanche',
  type: 'colouring',
  brand: 'Tigi',
  line: 'COPYRIGHT',
  barcode: '0615908431148',
  capacity: '450g',
  price: 0,
});

describe('normalizeLegacyProduct', () => {
  it('maps the real legacy shape to the canonical Product', () => {
    const result = normalizeLegacyProduct(realLegacyProduct, businessId);

    expect(result).toEqual({
      id: '6974bff937a5d89c2d9afbd0',
      businessId,
      name: 'Masque réparateur 5 min',
      brand: 'Redken',
      category: 'Soin',
      barcode: '3474637152000',
      price: 50,
      stockQuantity: 0,
      active: true,
    });
    expect(result?.imageUri).toBeUndefined();
  });

  it('is deterministic, preserves input, and discards legacy-only fields', () => {
    const before = JSON.stringify(realLegacyProduct);
    const first = normalizeLegacyProduct(realLegacyProduct, businessId);
    const second = normalizeLegacyProduct(realLegacyProduct, businessId);

    expect(first).toEqual(second);
    expect(JSON.stringify(realLegacyProduct)).toBe(before);
    expect(first).not.toHaveProperty('line');
    expect(first).not.toHaveProperty('capacity');
    expect(first).not.toHaveProperty('type');
    expect(first).not.toHaveProperty('_id');
    expect(first).not.toHaveProperty('title');
  });

  it('preserves a truthful zero price from the real source', () => {
    const result = normalizeLegacyProduct(realZeroPriceProduct, businessId);

    expect(result?.price).toBe(0);
    expect(result?.category).toBe('Coloration');
  });

  it('excludes records without a usable name or a valid price', () => {
    expect(normalizeLegacyProduct({ ...realLegacyProduct, title: '   ' }, businessId)).toBeNull();
    expect(
      normalizeLegacyProduct({ ...realLegacyProduct, price: NaN }, businessId),
    ).toBeNull();
    expect(
      normalizeLegacyProduct(
        { ...realLegacyProduct, price: 'Multiprix' as unknown as number },
        businessId,
      ),
    ).toBeNull();
  });

  it('seeds missing stock and active state at the boundary defaults', () => {
    const result = normalizeLegacyProduct(realLegacyProduct, businessId);

    expect(result?.stockQuantity).toBe(0);
    expect(result?.active).toBe(true);
    expect(result?.imageUri).toBeUndefined();
  });
});

describe('mapLegacyProductCategory', () => {
  it('maps the real legacy type buckets to French category text', () => {
    expect(mapLegacyProductCategory('hair-care')).toBe('Soin');
    expect(mapLegacyProductCategory('shampoo')).toBe('Shampooing');
    expect(mapLegacyProductCategory('colouring')).toBe('Coloration');
    expect(mapLegacyProductCategory('styling')).toBe('Coiffage');
    expect(mapLegacyProductCategory(undefined)).toBeUndefined();
  });

  it('keeps unknown bucket values truthful', () => {
    expect(mapLegacyProductCategory('accessory')).toBe('accessory');
  });
});

describe('mapLegacyProducts', () => {
  it('normalizes the batch deterministically with diagnostics', () => {
    const result = mapLegacyProducts(
      [
        realLegacyProduct,
        { ...realLegacyProduct, _id: 'bad', title: '   ', price: 10 },
        { ...realLegacyProduct, _id: 'bad-price', title: 'Sans prix', price: NaN },
        { ...realLegacyProduct, _id: 'negative-price', title: 'Prix négatif', price: -1 },
      ],
      businessId,
    );

    expect(result.products).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ reason: 'Missing product name' }),
      expect.objectContaining({ name: 'Sans prix', reason: 'Non-numeric price: NaN' }),
      expect.objectContaining({ name: 'Prix négatif', reason: 'Invalid product price: -1' }),
    ]);
  });

  it('never mutates the source records', () => {
    const legacy: LegacyProduct[] = [realLegacyProduct, realZeroPriceProduct];
    const before = JSON.stringify(legacy);

    mapLegacyProducts(legacy, businessId);

    expect(JSON.stringify(legacy)).toBe(before);
  });
});
