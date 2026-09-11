// Souris — Product domain helpers
//
// Pure validation rules for canonical Product values. The same rules are
// used by the Product form and the legacy import diagnostics.

export function isAcceptableProductName(name: string): boolean {
  return name.trim().length > 0;
}

export function isValidProductPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0;
}

export function isValidStockQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 0;
}

/** Trims optional text; blank strings become undefined. */
export function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** Barcodes are preserved verbatim as text — leading zeroes included. */
export function normalizeBarcode(value: string | undefined): string | undefined {
  return normalizeOptionalText(value);
}
