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

import type { ClientBirthday } from './birthday';

export interface Client {
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
  /**
   * Birthday as a day + month only (see birthday.ts). Souris never stores,
   * asks for, or invents a birth year. Optional.
   */
  readonly birthday?: ClientBirthday;
  /**
   * Lifecycle marker. Absent for an active Client; the exact instant of the
   * archive otherwise. Archiving never deletes anything and never touches
   * Appointments, Sales, or derived metrics (see lifecycle.ts).
   */
  readonly archivedAt?: Date;
}
