// Souris — Product form rules (create + edit)
//
// Fast entry: Nom required; Marque / Catégorie / Code-barres optional;
// Prix required (finite >= 0, French decimal input); Stock required
// (integer >= 0, defaults to 0 for a new product).
//
// Stock is chosen with a selector (0–30 for normal use) rather than typed.
// The form value stays a plain integer: a Product that already holds more
// than 30 units keeps its exact quantity through hydration and save until the
// professional intentionally changes it (see STOCK_SELECTOR_MAX).

import type { Product } from '@/domain/products';
import {
  normalizeBarcode,
  normalizeOptionalText,
} from '@/domain/products';
import {
  formatServicePriceInput,
  parseServicePriceInput,
} from '@/features/services/editor/service-form';

/** Largest quantity the stock selector offers for normal Souris use. */
export const STOCK_SELECTOR_MAX = 30;
export const STOCK_SELECTOR_MIN = 0;

export interface ProductFormValues {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly barcode: string;
  readonly imageUri?: string;
  readonly price: string;
  readonly stockQuantity: number;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  brand: '',
  category: '',
  barcode: '',
  imageUri: undefined,
  price: '',
  stockQuantity: 0,
};

export interface ProductFormValidation {
  readonly nameValid: boolean;
  readonly priceValid: boolean;
  readonly stockValid: boolean;
  readonly valid: boolean;
}

export function toProductFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    brand: product.brand ?? '',
    category: product.category ?? '',
    barcode: product.barcode ?? '',
    imageUri: product.imageUri,
    stockQuantity: product.stockQuantity,
    price: formatServicePriceInput(product.price),
  };
}

/** Whole, non-negative units. No upper bound: legacy quantities above 30 stay valid. */
export function isValidStockQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The next selector value for a step. Increments stop at the selector
 * maximum; a quantity already above it can only be lowered, one unit at a
 * time, so nothing is ever clamped behind the professional's back.
 */
export function stepStockQuantity(current: number, delta: 1 | -1): number {
  const next = current + delta;
  if (delta > 0 && next > STOCK_SELECTOR_MAX) return current;
  return Math.max(STOCK_SELECTOR_MIN, next);
}

export function validateProductForm(values: ProductFormValues): ProductFormValidation {
  const nameValid = values.name.trim().length > 0;
  const priceValid = parseServicePriceInput(values.price) !== undefined;
  const stockValid = isValidStockQuantity(values.stockQuantity);

  return {
    nameValid,
    priceValid,
    stockValid,
    valid: nameValid && priceValid && stockValid,
  };
}

export interface BuildProductFromFormInput {
  readonly id: string;
  readonly businessId: string;
  readonly active: boolean;
  readonly values: ProductFormValues;
}

export function buildProductFromForm(input: BuildProductFromFormInput): Product {
  const validation = validateProductForm(input.values);
  if (!validation.valid) {
    throw new Error('Invalid product form');
  }

  const price = parseServicePriceInput(input.values.price);
  if (price === undefined) {
    throw new Error('Invalid product form values');
  }

  return {
    id: input.id,
    businessId: input.businessId,
    name: input.values.name.trim(),
    brand: normalizeOptionalText(input.values.brand),
    category: normalizeOptionalText(input.values.category),
    barcode: normalizeBarcode(input.values.barcode),
    imageUri: normalizeOptionalText(input.values.imageUri),
    price,
    stockQuantity: input.values.stockQuantity,
    active: input.active,
  };
}
