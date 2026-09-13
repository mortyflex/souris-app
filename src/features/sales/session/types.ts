import type { AppointmentProductIdentity } from '@/domain/appointments';
import type { Sale, SaleCompletionResult, SaleDraft } from '@/domain/sales';

/**
 * The smallest in-memory Sale session surface needed by Sales V1: reading
 * completed Sales (Client Profile purchases, Appointment « Produits vendus »),
 * the single atomic completion operation, and the single atomic removal of
 * a Product sold during an Appointment. There is no line editing, refund,
 * or deletion of a standalone paid Sale.
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
  /**
   * Removes ONE displayed Product row of an Appointment — every matching
   * SaleItem snapshot across the Sales sold during it — and gives the summed
   * quantity back to the Product, as one coherent operation: ONE SQLite
   * transaction first, state only after the commit. A parent Sale is dropped
   * only once it holds no line; Sales keeping other Products stay. Throws —
   * and changes nothing — when nothing matches, when a matching Sale carries
   * its own payment, or when the Product no longer exists. Never touches the
   * Appointment or its recorded payment.
   */
  readonly deleteAppointmentProduct: (
    appointmentId: string,
    identity: AppointmentProductIdentity,
  ) => void;
}
