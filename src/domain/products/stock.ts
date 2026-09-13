// Souris — Product stock rules
//
// Pure stock decrement / restoration over the canonical Product collection.
// Canonical stock can NEVER become negative: the whole batch is validated
// first and either every change applies to a new array, or nothing is
// returned. Restoration is the exact inverse of a committed decrement (a
// deleted Sale gives back what it sold) and is never clamped by any editor
// display limit — stock is business data.

import type { Product } from './types';

export interface StockDecrement {
  readonly productId: string;
  /** Whole units to remove: integer >= 1. */
  readonly quantity: number;
}

export interface StockRestoration {
  readonly productId: string;
  /** Whole units to give back: integer >= 1. */
  readonly quantity: number;
}

function sumQuantities(
  operation: string,
  changes: readonly { readonly productId: string; readonly quantity: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const change of changes) {
    if (!Number.isInteger(change.quantity) || change.quantity < 1) {
      throw new RangeError(
        `${operation}: invalid quantity ${change.quantity} for "${change.productId}"`,
      );
    }
    totals.set(change.productId, (totals.get(change.productId) ?? 0) + change.quantity);
  }
  return totals;
}

/**
 * Applies every decrement and returns a NEW Product array. Throws (before
 * building anything) when a Product is missing, a quantity is not a positive
 * integer, or any resulting stock would be negative. The source array and its
 * Products are never mutated.
 */
export function applyStockDecrements(
  products: readonly Product[],
  decrements: readonly StockDecrement[],
): readonly Product[] {
  const totals = sumQuantities('applyStockDecrements', decrements);

  for (const [productId, quantity] of totals) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) {
      throw new Error(`applyStockDecrements: product "${productId}" not found`);
    }
    if (product.stockQuantity - quantity < 0) {
      throw new RangeError(
        `applyStockDecrements: stock of "${productId}" would become negative`,
      );
    }
  }

  if (totals.size === 0) return products;

  return products.map((product) => {
    const quantity = totals.get(product.id);
    return quantity === undefined
      ? product
      : { ...product, stockQuantity: product.stockQuantity - quantity };
  });
}

/**
 * Gives back every restoration and returns a NEW Product array. Throws
 * (before building anything) when a Product is missing or a quantity is not
 * a positive integer. Restorations targeting the same Product are summed.
 * The source array and its Products are never mutated.
 */
export function applyStockRestorations(
  products: readonly Product[],
  restorations: readonly StockRestoration[],
): readonly Product[] {
  const totals = sumQuantities('applyStockRestorations', restorations);

  for (const productId of totals.keys()) {
    if (!products.some((candidate) => candidate.id === productId)) {
      throw new Error(`applyStockRestorations: product "${productId}" not found`);
    }
  }

  if (totals.size === 0) return products;

  return products.map((product) => {
    const quantity = totals.get(product.id);
    return quantity === undefined
      ? product
      : { ...product, stockQuantity: product.stockQuantity + quantity };
  });
}
