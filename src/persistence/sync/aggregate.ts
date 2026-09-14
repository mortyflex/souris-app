// Souris — sync aggregate vocabulary (Cloud Sync V1B)
//
// The five aggregate boundaries of the remote contract
// (docs/architecture/CLOUD_SYNC.md §6). Children never sync on their own: a
// phase, item, or sale line change marks its PARENT aggregate.
//
//   CLIENT        clients
//   SERVICE       services      + service_phases
//   APPOINTMENT   appointments  + appointment_items + appointment_phases
//   PRODUCT       products
//   SALE          sales         + sale_items

import type { SourisDatabase } from '../database';

export const SYNC_AGGREGATE_TYPES = ['CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE'] as const;

export type SyncAggregateType = (typeof SYNC_AGGREGATE_TYPES)[number];

/** The latest local intent for an aggregate: push its current row, or send its tombstone. */
export type SyncOperation = 'UPSERT' | 'DELETE';

export interface SyncAggregateRef {
  readonly aggregateType: SyncAggregateType;
  readonly aggregateId: string;
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
