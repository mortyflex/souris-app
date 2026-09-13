// Souris — Sale completion (pure)
//
// Source: docs/domain/SALES.md §4–§6
//
// Turns a Sale draft plus the CURRENT canonical Product state into either a
// complete, immutable Sale snapshot together with the exact stock decrements
// to apply, or a list of issues explaining why nothing may change.
//
// This function never mutates its inputs and never applies anything: the
// session boundary applies the Sale and the stock decrements together as one
// coherent operation, or applies nothing at all.

import { eurosToCents } from '../appointments/payment';
import type { Product } from '../products';
import { isSalePaymentAcceptable, type SalePaymentAmounts } from './payment';
import { createSaleItemSnapshot, getSaleTotal, isValidSaleQuantity } from './sale';
import type { Sale } from './types';

/** The Product fields Sale completion reads. */
export type SaleStockSource = Pick<
  Product,
  'id' | 'name' | 'price' | 'stockQuantity' | 'active'
>;

/** One requested line of a Sale draft; the SaleItem id is caller-generated. */
export interface SaleDraftLine {
  readonly id: string;
  readonly productId: string;
  readonly quantity: number;
}

export interface SaleDraft {
  readonly id: string;
  readonly businessId: string;
  readonly clientId?: string;
  /** The Appointment the Sale is sold during (Revente); absent for a standalone Sale. */
  readonly appointmentId?: string;
  /** Card / cash received — standalone Sales only; never together with `appointmentId`. */
  readonly payment?: SalePaymentAmounts;
  readonly completedAt: Date;
  readonly lines: readonly SaleDraftLine[];
}

export interface ProductStockDecrement {
  readonly productId: string;
  readonly quantity: number;
}

export type SaleCompletionIssue =
  | { readonly kind: 'EMPTY_SALE' }
  /** Negative / fractional cents, or nothing received while the Sale total is positive. */
  | { readonly kind: 'INVALID_PAYMENT' }
  /** A Sale sold during an Appointment records no payment of its own. */
  | { readonly kind: 'LINKED_SALE_PAYMENT'; readonly appointmentId: string }
  | { readonly kind: 'INVALID_QUANTITY'; readonly productId: string; readonly quantity: number }
  | { readonly kind: 'PRODUCT_MISSING'; readonly productId: string }
  | { readonly kind: 'PRODUCT_INACTIVE'; readonly productId: string; readonly productName: string }
  | {
      readonly kind: 'INSUFFICIENT_STOCK';
      readonly productId: string;
      readonly productName: string;
      readonly requested: number;
      readonly available: number;
    };

export type SaleCompletionResult =
  | {
      readonly ok: true;
      readonly sale: Sale;
      readonly stockDecrements: readonly ProductStockDecrement[];
    }
  | { readonly ok: false; readonly issues: readonly SaleCompletionIssue[] };

/**
 * Validates the WHOLE draft against the current Products and, only when every
 * line is valid, builds the Sale snapshot and the stock decrements.
 *
 * Lines referencing the same Product are merged into one requested quantity
 * for the stock check, so a draft can never pass line by line while failing
 * as a whole.
 */
export function prepareSaleCompletion(
  draft: SaleDraft,
  products: readonly SaleStockSource[],
): SaleCompletionResult {
  if (draft.lines.length === 0) {
    return { ok: false, issues: [{ kind: 'EMPTY_SALE' }] };
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const issues: SaleCompletionIssue[] = [];
  const requestedByProduct = new Map<string, number>();

  for (const line of draft.lines) {
    if (!isValidSaleQuantity(line.quantity)) {
      issues.push({ kind: 'INVALID_QUANTITY', productId: line.productId, quantity: line.quantity });
      continue;
    }
    requestedByProduct.set(
      line.productId,
      (requestedByProduct.get(line.productId) ?? 0) + line.quantity,
    );
  }

  for (const [productId, requested] of requestedByProduct) {
    const product = productsById.get(productId);
    if (!product) {
      issues.push({ kind: 'PRODUCT_MISSING', productId });
    } else if (!product.active) {
      issues.push({ kind: 'PRODUCT_INACTIVE', productId, productName: product.name });
    } else if (requested > product.stockQuantity) {
      issues.push({
        kind: 'INSUFFICIENT_STOCK',
        productId,
        productName: product.name,
        requested,
        available: product.stockQuantity,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const items = draft.lines.map((line) => {
    const product = productsById.get(line.productId);
    if (!product) {
      throw new Error(`prepareSaleCompletion: product "${line.productId}" vanished`);
    }
    return createSaleItemSnapshot({ id: line.id, product, quantity: line.quantity });
  });

  if (draft.payment !== undefined) {
    if (draft.appointmentId !== undefined) {
      return { ok: false, issues: [{ kind: 'LINKED_SALE_PAYMENT', appointmentId: draft.appointmentId }] };
    }
    if (!isSalePaymentAcceptable(eurosToCents(getSaleTotal({ items })), draft.payment)) {
      return { ok: false, issues: [{ kind: 'INVALID_PAYMENT' }] };
    }
  }

  const sale: Sale = {
    id: draft.id,
    businessId: draft.businessId,
    clientId: draft.clientId,
    ...(draft.appointmentId !== undefined ? { appointmentId: draft.appointmentId } : {}),
    completedAt: new Date(draft.completedAt.getTime()),
    items,
    ...(draft.payment !== undefined
      ? {
          payment: {
            paidAt: new Date(draft.completedAt.getTime()),
            cardAmountCents: draft.payment.cardAmountCents,
            cashAmountCents: draft.payment.cashAmountCents,
          },
        }
      : {}),
  };

  const stockDecrements = [...requestedByProduct].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  return { ok: true, sale, stockDecrements };
}
