import {
  isAcceptableProductName,
  isValidProductPrice,
  isValidStockQuantity,
  normalizeBarcode,
  normalizeOptionalText,
} from '../helpers';
import type { Product } from '../types';

describe('Product domain helpers', () => {
  it('requires a non-blank name', () => {
    expect(isAcceptableProductName('Shampooing')).toBe(true);
    expect(isAcceptableProductName('   ')).toBe(false);
    expect(isAcceptableProductName('')).toBe(false);
  });

  it('accepts only finite non-negative prices', () => {
    expect(isValidProductPrice(25)).toBe(true);
    expect(isValidProductPrice(0)).toBe(true);
    expect(isValidProductPrice(25.9)).toBe(true);
    expect(isValidProductPrice(-1)).toBe(false);
    expect(isValidProductPrice(NaN)).toBe(false);
    expect(isValidProductPrice(Infinity)).toBe(false);
  });

  it('accepts only integer stock >= 0', () => {
    expect(isValidStockQuantity(0)).toBe(true);
    expect(isValidStockQuantity(12)).toBe(true);
    expect(isValidStockQuantity(-1)).toBe(false);
    expect(isValidStockQuantity(1.5)).toBe(false);
    expect(isValidStockQuantity(NaN)).toBe(false);
  });

  it('trims optional text and preserves barcode leading zeroes verbatim', () => {
    expect(normalizeOptionalText('  Redken  ')).toBe('Redken');
    expect(normalizeOptionalText('   ')).toBeUndefined();
    expect(normalizeOptionalText(undefined)).toBeUndefined();
    expect(normalizeBarcode('0884486532879')).toBe('0884486532879');
    expect(normalizeBarcode('')).toBeUndefined();
  });

  it('supports one optional image without changing canonical validation rules', () => {
    const legacyProduct: Product = {
      id: 'product-legacy',
      businessId: 'business-1',
      name: 'Shampooing',
      price: 20,
      stockQuantity: 0,
      active: true,
    };
    const photographedProduct: Product = {
      ...legacyProduct,
      imageUri: 'file:///products/shampooing.png',
    };

    expect(legacyProduct.imageUri).toBeUndefined();
    expect(photographedProduct.imageUri).toBe('file:///products/shampooing.png');
    expect(isAcceptableProductName(photographedProduct.name)).toBe(true);
    expect(isValidProductPrice(photographedProduct.price)).toBe(true);
    expect(isValidStockQuantity(photographedProduct.stockQuantity)).toBe(true);
  });
});
