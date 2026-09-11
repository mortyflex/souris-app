import type { Sale, SaleCompletionResult, SaleDraft } from '@/domain/sales';

/**
 * The smallest in-memory Sale session surface needed by Sales V1: reading
 * completed Sales (Client Profile purchases, future history) and the single
 * atomic completion operation. Completed Sales are immutable — no edit,
 * delete, or refund API exists yet.
 */
export interface SaleSessionValue {
  /** Completed Sales of the current session, in completion order. */
  readonly sales: readonly Sale[];
  readonly getSaleById: (saleId: string | undefined) => Sale | undefined;
  /**
   * Validates the whole draft against the CURRENT Product catalog, then adds
   * the immutable Sale and decrements every involved Product stock as one
   * coherent operation. On failure nothing changes — neither the Sale session
   * nor the Product catalog — and the issues explain why.
   */
  readonly completeSale: (draft: SaleDraft) => SaleCompletionResult;
}
