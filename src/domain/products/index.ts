// Souris — Product domain public entry point

export type { Product } from "./types";
export {
  isAcceptableProductName,
  isValidProductPrice,
  isValidStockQuantity,
  normalizeBarcode,
  normalizeOptionalText,
} from "./helpers";
export type { StockDecrement } from "./stock";
export { applyStockDecrements } from "./stock";
