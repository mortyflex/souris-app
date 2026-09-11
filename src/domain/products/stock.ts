// Souris — Product stock rules
//
// Pure stock decrement over the canonical Product collection. Canonical stock
// can NEVER become negative: the whole batch is validated first and either
// every decrement applies to a new array, or nothing is returned.

import type { Product } from './types';

export interface StockDecrement {
  readonly productId: string;
  /** Whole units to remove: integer >= 1. */
  readonly quantity: number;
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
  const totals = new Map<string, number>();
  for (const decrement of decrements) {
    if (!Number.isInteger(decrement.quantity) || decrement.quantity < 1) {
      throw new RangeError(
        `applyStockDecrements: invalid quantity ${decrement.quantity} for "${decrement.productId}"`,
      );
    }
    totals.set(decrement.productId, (totals.get(decrement.productId) ?? 0) + decrement.quantity);
  }

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
