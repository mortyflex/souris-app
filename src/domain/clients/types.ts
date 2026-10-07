// BeautIzzy — Client domain types
//
// Source: docs/domain/CLIENTS.md, docs/product/PRODUCT.md §11
//
// Framework-independent canonical Client identity.
// No React, React Native, Expo, or persistence imports.
//
// Relationships from other domains (e.g. Appointments) use clientId only.
// Commercial history, formulas, statistics, and product purchases are
// separate concerns and are intentionally absent from the canonical model. Activity statistics are always DERIVED from BeautIzzy
// Appointment state — never stored on the Client.

import type { ClientBirthday } from './birthday';
import type { ClientSmsMarketingConsent } from './sms-consent';

export interface Client {
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
  /**
   * Birthday as a day + month only (see birthday.ts). BeautIzzy never stores,
   * asks for, or invents a birth year. Optional.
   */
  readonly birthday?: ClientBirthday;
  /**
   * Free-text professional note written in BeautIzzy (see notes.ts): trimmed,
   * line breaks preserved, absent when blank. Never imported from legacy data.
   */
  readonly notes?: string;
  /**
   * Explicit promotional SMS consent (see sms-consent.ts). Absent = UNKNOWN:
   * never asked or never recorded — and never eligible for lifecycle SMS.
   * A phone number by itself is never consent.
   */
  readonly smsMarketingConsent?: ClientSmsMarketingConsent;
  /**
   * Stable reference of the Client photo in the Business media storage (an
   * opaque object path). Absent when the Client has no photo. Never a device
   * file URI, a signed URL or image bytes: presentation resolves it.
   */
  readonly photoPath?: string;
  /**
   * Lifecycle marker. Absent for an active Client; the exact instant of the
   * archive otherwise. Archiving never deletes anything and never touches
   * Appointments, Sales, or derived metrics (see lifecycle.ts).
   */
  readonly archivedAt?: Date;
}
