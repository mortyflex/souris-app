// Souris — Sale domain public entry point

export type { Sale, SaleItem } from './types';
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
