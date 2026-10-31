// BeautIzzy — sync aggregate vocabulary (Cloud Sync V1B)
//
// The eight aggregate boundaries of the remote contract
// (docs/architecture/CLOUD_SYNC.md §6). Children never sync on their own: a
// phase, item, or sale line change marks its PARENT aggregate.
//
//   CLIENT        clients
//   SERVICE       services      + service_phases
//   APPOINTMENT   appointments  + appointment_items + appointment_phases
//   PRODUCT       products
//   SALE            sales         + sale_items
//   CALENDAR_BLOCK  calendar_blocks               (CLOUD_SYNC.md §20)
//   APPOINTMENT_DEPOSIT appointment_deposits      (CLOUD_SYNC.md §21)
//   SERVICE_CATEGORY    service_categories        (CLOUD_SYNC.md §27)
//   SALE_ADJUSTMENT     sale_adjustments + sale_adjustment_items (CLOUD_SYNC.md §28)

import type { SourisDatabase } from '../database';

export const SYNC_AGGREGATE_TYPES = [
  'CLIENT',
  'SERVICE',
  'APPOINTMENT',
  'PRODUCT',
  'SALE',
  'CALENDAR_BLOCK',
  'APPOINTMENT_DEPOSIT',
  'SERVICE_CATEGORY',
  'SALE_ADJUSTMENT',
] as const;

export type SyncAggregateType = (typeof SYNC_AGGREGATE_TYPES)[number];

/** The latest local intent for an aggregate: push its current row, or send its tombstone. */
export type SyncOperation = 'UPSERT' | 'DELETE';

export interface SyncAggregateRef {
  readonly aggregateType: SyncAggregateType;
  readonly aggregateId: string;
}

/**
 * A remote revision this device never acknowledged met a local change (push:
 * the remote refused the write; pull: the aggregate has a pending outbox
 * entry). Neither side was overwritten (CLOUD_SYNC.md §9).
 */
export interface SyncConflict extends SyncAggregateRef {
  /** The pending local intent. */
  readonly operation: SyncOperation;
  /** The version this device had acknowledged (undefined = never). */
  readonly acknowledgedVersion: number | undefined;
  /** The version the remote reported (undefined = the remote holds no such row). */
  readonly remoteVersion: number | undefined;
}

/**
 * The remote refused a financial write because it would leave an Appointment
 * with more ACTIVE deposits than its expected total (CLOUD_SYNC.md §21.2).
 * Neither side was overwritten: the local record stays, its outbox entry stays
 * pending, and the Appointment shows a financial conflict to resolve.
 */
export interface SyncFinancialConflict extends SyncAggregateRef {
  /** The Appointment whose invariant is broken (undefined only if the remote did not name it). */
  readonly appointmentId: string | undefined;
  readonly expectedTotalCents: number;
  readonly activeDepositTotalCents: number;
}

/**
 * The remote refused a Sale adjustment: it would give back more money or
 * units than the Sale allows, change a settled record, or reverse a refund
 * twice (CLOUD_SYNC.md §28). Neither side was overwritten.
 */
export interface SyncAdjustmentConflict extends SyncAggregateRef {
  readonly saleId: string | undefined;
  /** Stable machine code from the remote (`CEILING`, `UNITS`, `IMMUTABLE`, `REVERSAL`…). */
  readonly reason: string;
}

/**
 * The Business UUID this device is bound to (`business_profile.id`), or
 * undefined while the database is unbound. Every sync row is scoped to it:
 * an unbound database records no sync intent at all (PERSISTENCE.md §4b —
 * binding is the prerequisite for sync; data present before binding is
 * covered by the V1C bootstrap decision, not by the outbox).
 */
export function readBoundBusinessId(db: SourisDatabase): string | undefined {
  return db.getFirstSync<{ readonly id: string }>(
    'SELECT id FROM business_profile WHERE singleton = 1',
  )?.id;
}
