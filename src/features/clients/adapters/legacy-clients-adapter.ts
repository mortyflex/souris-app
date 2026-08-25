// Souris — Legacy clients adapter
//
// Source: src/features/clients/data/legacy-clients.ts
// Target: Canonical Souris client identity (docs/product/PRODUCT.md §11)
//
// This adapter transforms the legacy MongoDB export format into
// normalized Souris client records. Only approved identity/contact
// fields are mapped; commercial history is intentionally excluded.

export interface NormalizedClient {
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
}

interface LegacyClient {
  readonly _id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly telephone?: string;
  readonly email?: string;
}

/**
 * Transforms a legacy client record into a normalized Souris client.
 *
 * Mapping rules:
 * - _id → id (stable identifier)
 * - firstName → firstName
 * - lastName → lastName (optional)
 * - telephone → phone (optional, may be empty string)
 * - email → email (optional, may be empty string)
 *
 * Excluded fields (per docs/product/PRODUCT.md §11):
 * - onlineBooking, gender, shopID, shortLinkCode
 * - pictures, importedVisitNotes
 * - createdAt, updatedAt, __v
 * - stats (all commercial history)
 * - tmp
 *
 * Empty strings are converted to undefined to match the optional
 * contract in NormalizedClient.
 */
export function normalizeLegacyClient(legacy: LegacyClient): NormalizedClient {
  const phone = legacy.telephone?.trim() || undefined;
  const email = legacy.email?.trim() || undefined;

  return {
    id: legacy._id,
    firstName: legacy.firstName,
    lastName: legacy.lastName,
    phone,
    email,
  };
}

/**
 * Batch-normalizes an array of legacy clients.
 * Convenience wrapper for normalizeLegacyClient.
 */
export function normalizeLegacyClients(
  legacyClients: readonly LegacyClient[],
): readonly NormalizedClient[] {
  return legacyClients.map(normalizeLegacyClient);
}
