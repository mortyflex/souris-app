// Souris — Sale domain public entry point

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
