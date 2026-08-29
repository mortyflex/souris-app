// Souris — Client domain types
//
// Source: docs/domain/CLIENTS.md, docs/product/PRODUCT.md §11
//
// Framework-independent canonical Client identity.
// No React, React Native, Expo, or persistence imports.
//
// Relationships from other domains (e.g. Appointments) use clientId only.
// Commercial history, notes, formulas, photos, statistics, and product
// purchases are separate future concerns and are intentionally absent from
// the canonical model. Activity statistics are always DERIVED from Souris
// Appointment state — never stored on the Client.

export interface Client {
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
  /**
   * Civil calendar date of birth in canonical YYYY-MM-DD form.
   * NOT a timestamp — never a Date at local midnight. Optional.
   */
  readonly birthDate?: string;
}
