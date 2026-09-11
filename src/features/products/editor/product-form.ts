// Souris — Product form rules (create + edit)
//
// Fast entry: Nom required; Marque / Catégorie / Code-barres optional;
// Prix required (finite >= 0, French decimal input); Stock required
// (integer >= 0, defaults to 0 for a new product).

import type { Product } from '@/domain/products';
import {
  normalizeBarcode,
  normalizeOptionalText,
} from '@/domain/products';
import {
  formatServicePriceInput,
  parseServicePriceInput,
} from '@/features/services/editor/service-form';

export interface ProductFormValues {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly barcode: string;
  readonly imageUri?: string;
  readonly price: string;
  readonly stockQuantity: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  brand: '',
  category: '',
  barcode: '',
  imageUri: undefined,
  price: '',
  stockQuantity: '0',
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
    price: formatServicePriceInput(product.price),
    stockQuantity: String(product.stockQuantity),
  };
}

export function parseStockInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function validateProductForm(values: ProductFormValues): ProductFormValidation {
  const nameValid = values.name.trim().length > 0;
  const priceValid = parseServicePriceInput(values.price) !== undefined;
  const stockValid = parseStockInput(values.stockQuantity) !== undefined;

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
  const stockQuantity = parseStockInput(input.values.stockQuantity);
  if (price === undefined || stockQuantity === undefined) {
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
    stockQuantity,
    active: input.active,
  };
}
