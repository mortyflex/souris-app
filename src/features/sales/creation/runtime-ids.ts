let saleSequence = 0;

/**
 * Runtime-only Sale identity for the current in-memory session, mirroring the
 * appointment / client / product runtime-id pattern. ID generation stays at
 * the application boundary — never inside the Sale domain.
 */
export function createSaleId(now = new Date()): string {
  saleSequence += 1;
  return `sale-${now.getTime()}-${saleSequence}`;
}

/** Stable unique SaleItem identity within one Sale draft. */
export function createSaleItemId(saleId: string, sequence: number): string {
  return `${saleId}-item-${sequence}`;
}
