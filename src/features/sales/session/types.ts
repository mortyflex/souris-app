import type { AppointmentProductIdentity } from '@/domain/appointments';
import type {
  Sale,
  SaleAdjustment,
  SaleAdjustmentDraft,
  SaleAdjustmentPreparation,
  SaleCompletionResult,
  SaleDraft,
} from '@/domain/sales';
import type { SaleAdjustmentSyncState } from '@/persistence/sync/sale-adjustment-sync';

/**
 * The smallest in-memory Sale session surface needed by Sales V1: reading
 * completed Sales (Client Profile purchases, Appointment « Produits vendus »),
 * the single atomic completion operation, and the single atomic removal of
 * a Product sold during an Appointment. A completed Sale is never edited or
 * deleted: corrections and refunds are Sale adjustments (SALES.md §15).
 */
/**
 * What the professional confirmed about a SETTLED refund. The id is created
 * once per presentation of the correction screen (a retry never duplicates).
 */
export type SaleAdjustmentReversalRequest =
  /** « Saisi par erreur » — the money never left. */
  | { readonly id: string; readonly reason: 'RECORDED_IN_ERROR'; readonly note?: string }
  /** « L'argent m'a été rendu » — on that day, by those methods. */
  | {
      readonly id: string;
      readonly reason: 'REFUND_RETURNED';
      readonly returnedAt: Date;
      readonly cardCents: number;
      readonly cashCents: number;
      readonly note?: string;
    };

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
  /** Every correction and refund, in recording order. */
  readonly saleAdjustments: readonly SaleAdjustment[];
  /** Whether the stored Appointment of a Revente received its money (refund eligibility). */
  readonly isAppointmentSettled: (appointmentId: string) => boolean;
  /**
   * Records a correction / refund of ONE Sale. Validation issues are returned
   * and nothing changes; a refusal of the STORED rows (a duplicate id, a
   * ceiling another write reached first, a missing Product) throws and
   * nothing changes. Restocked units are reflected in the catalog.
   */
  readonly recordSaleAdjustment: (
    saleId: string,
    draft: Omit<SaleAdjustmentDraft, 'businessId' | 'staffMemberId'>,
  ) => SaleAdjustmentPreparation;
  /** PENDING → SETTLED on the day the money actually left. Throws when refused. */
  readonly settleSaleAdjustment: (adjustmentId: string, refundedAt: Date) => void;
  /** PENDING (or server-refused) → VOIDED; restocked units leave the stock again. Throws when refused. */
  readonly voidSaleAdjustment: (adjustmentId: string) => void;
  /**
   * « L’argent a bien été rendu » for a SETTLED record the server refused: the
   * refused record is voided and ONE exceptional outflow records the money that
   * really left, outside the Sale's ceiling. Idempotent. Throws when refused.
   */
  readonly recordSaleRefundOutflow: (adjustmentId: string) => void;
  /**
   * A compensating record of a SETTLED refund, with its explicit meaning
   * (`SaleAdjustmentReversalRequest`). Throws when refused.
   */
  readonly reverseSaleAdjustment: (adjustmentId: string, input: SaleAdjustmentReversalRequest) => void;
  /** Where each adjustment stands with the remote (never claimed synchronized when refused). */
  readonly getSaleAdjustmentSyncStates: () => ReadonlyMap<string, SaleAdjustmentSyncState>;
}
