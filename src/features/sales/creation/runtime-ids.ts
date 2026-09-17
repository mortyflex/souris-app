import { createUuidV4 } from '@/shared/lib/uuid';

/**
 * Identity of a NEW Sale: a globally unique UUID v4, safe for creation on
 * several devices of the same Business. ID generation stays at the
 * application boundary — never inside the Sale domain. Existing Sale ids
 * are never rewritten.
 */
export function createSaleId(): string {
  return createUuidV4();
}

/** Stable unique SaleItem identity within one Sale draft, derived from the parent id. */
export function createSaleItemId(saleId: string, sequence: number): string {
  return `${saleId}-item-${sequence}`;
}
