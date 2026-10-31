// BeautIzzy — Sale domain public entry point

export type { Sale, SaleItem } from './types';
export type { SalePayment, SalePaymentAmounts } from './payment';
export {
  areValidSalePaymentAmounts,
  getSalePaymentTotalCents,
  isSalePaymentAcceptable,
} from './payment';
export type { CreateSaleItemSnapshotInput, SaleItemSnapshotSource } from './sale';
export {
  createSaleItemSnapshot,
  getSaleItemTotal,
  getSaleTotal,
  getSaleUnitCount,
  isValidSaleQuantity,
} from './sale';
export type {
  ProductStockDecrement,
  SaleCompletionIssue,
  SaleCompletionResult,
  SaleDraft,
  SaleDraftLine,
  SaleStockSource,
} from './completion';
export { prepareSaleCompletion } from './completion';
export type {
  AppointmentProductRemoval,
  AppointmentProductRemovalIssue,
  AppointmentProductRemovalResult,
  ProductStockRestoration,
} from './deletion';
export { isAppointmentLinkedSale, removeAppointmentProduct } from './deletion';
export type {
  SaleChannel,
  SaleHistoryEntry,
  SaleHistoryInterval,
  SaleHistorySummary,
  SalePaymentRecord,
} from './history';
export {
  describeSaleHistoryEntry,
  findSaleHistoryEntry,
  getSaleChannel,
  getSalePaymentRecord,
  listSaleHistory,
  summarizeSaleHistory,
} from './history';
export type {
  SaleAdjustment,
  SaleAdjustmentCashMovement,
  SaleAdjustmentContext,
  SaleAdjustmentDraft,
  SaleAdjustmentDraftLine,
  SaleAdjustmentEligibility,
  SaleAdjustmentIssue,
  SaleAdjustmentItem,
  SaleAdjustmentKind,
  SaleAdjustmentLinePosition,
  SaleAdjustmentPosition,
  SaleAdjustmentPreparation,
  SaleAdjustmentReason,
  SaleAdjustmentReversalInput,
  SaleAdjustmentReversalReason,
  SaleAdjustmentStatus,
  SaleAdjustmentStockChange,
  SaleAdjustmentTransition,
  SaleAdjustmentTransitionIssue,
  SaleAdjustmentTransitionKind,
  SaleAdjustmentTransitionResult,
  SaleRefundOutflowIssue,
  SaleRefundOutflowPreparation,
} from './adjustment';
export {
  SALE_ADJUSTMENT_REASONS,
  SALE_REFUND_OUTFLOW_ID_SUFFIX,
  SaleAdjustmentInvalidError,
  canReverseSaleAdjustment,
  createSaleAdjustment,
  createSaleAdjustmentItemId,
  findSaleAdjustmentReversal,
  findSaleRefundOutflow,
  getSaleRefundOutflowId,
  getSaleRefundOutflowSourceId,
  isSaleRefundOutflow,
  prepareSaleRefundOutflow,
  getSaleAdjustmentAmountCents,
  getSaleAdjustmentCashMovement,
  getSaleAdjustmentEligibility,
  getSaleAdjustmentHistory,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  getSaleRefundableBaseCents,
  isEffectiveSaleRefund,
  isSaleAdjustmentReason,
  isSaleAdjustmentReversalReason,
  prepareSaleAdjustment,
  prepareSaleAdjustmentReversal,
  settleSaleAdjustment,
  validateSaleAdjustmentDraft,
  voidSaleAdjustment,
} from './adjustment';
