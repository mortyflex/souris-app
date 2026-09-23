// Souris — Sale draft rules (pure)
//
// The creation screen owns ONE draft: ordered lines keyed by Product. Adding a
// Product already present increments its quantity instead of creating a
// duplicate row. Stock is only READ here to bound quantities; canonical stock
// changes only through Sale completion. Nothing here mutates its input.

import type { Product } from '@/domain/products';
import type { SaleDraftLine } from '@/domain/sales';

export type AddProductOutcome = 'added' | 'incremented' | 'inactive' | 'out-of-stock';

export interface AddProductResult {
  readonly lines: readonly SaleDraftLine[];
  readonly outcome: AddProductOutcome;
}

/** How many more units of this Product the draft may still request. */
export function getRemainingStock(
  lines: readonly SaleDraftLine[],
  product: Pick<Product, 'id' | 'stockQuantity'>,
): number {
  const requested = lines
    .filter((line) => line.productId === product.id)
    .reduce((total, line) => total + line.quantity, 0);
  return product.stockQuantity - requested;
}

/**
 * Why one more unit of the Product cannot join the draft — inactive, or no
 * remaining stock — or `undefined` when it can. THE rule of `addProductToDraft`,
 * also read by entry points that offer to sell a Product (Product details).
 */
export function getAddProductRefusal(
  lines: readonly SaleDraftLine[],
  product: Pick<Product, 'id' | 'stockQuantity' | 'active'>,
): 'inactive' | 'out-of-stock' | undefined {
  if (!product.active) return 'inactive';
  if (getRemainingStock(lines, product) < 1) return 'out-of-stock';
  return undefined;
}

/**
 * Adds one unit of the Product: a new line the first time, an increment
 * afterwards. Inactive Products and Products without remaining stock leave
 * the draft unchanged with an explicit outcome.
 */
export function addProductToDraft(
  lines: readonly SaleDraftLine[],
  product: Pick<Product, 'id' | 'stockQuantity' | 'active'>,
  createLineId: () => string,
): AddProductResult {
  const refusal = getAddProductRefusal(lines, product);
  if (refusal) {
    return { lines, outcome: refusal };
  }

  const existing = lines.find((line) => line.productId === product.id);
  if (existing) {
    return {
      lines: lines.map((line) =>
        line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line,
      ),
      outcome: 'incremented',
    };
  }

  return {
    lines: [...lines, { id: createLineId(), productId: product.id, quantity: 1 }],
    outcome: 'added',
  };
}

/** Sets an explicit quantity (integer >= 1); other values leave the draft unchanged. */
export function setDraftLineQuantity(
  lines: readonly SaleDraftLine[],
  lineId: string,
  quantity: number,
): readonly SaleDraftLine[] {
  if (!Number.isInteger(quantity) || quantity < 1) return lines;
  return lines.map((line) => (line.id === lineId ? { ...line, quantity } : line));
}

export function removeDraftLine(
  lines: readonly SaleDraftLine[],
  lineId: string,
): readonly SaleDraftLine[] {
  return lines.filter((line) => line.id !== lineId);
}

/** Total requested units for one Product across the draft. */
export function getDraftQuantity(lines: readonly SaleDraftLine[], productId: string): number {
  return lines
    .filter((line) => line.productId === productId)
    .reduce((total, line) => total + line.quantity, 0);
}
