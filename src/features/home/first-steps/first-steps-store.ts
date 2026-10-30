// BeautIzzy — « Premiers pas »: the device-local guidance flag
//
// Whether the first-use guidance of Accueil is offered for a Business on
// THIS installation. A UI preference, not business data: it lives in the
// local `souris_metadata` key/value table (never synced — no aggregate reads
// it — and no schema change).
//
//   absent     never offered: every Business that did not finish onboarding
//              on this device — the established ones above all
//   active     written ONLY when the onboarding of a NEW Business enters the app
//   dismissed  the professional closed it
//   completed  every required first step was observed done
//
// Only `active` shows the card; nothing ever turns a closed guidance back on.

import type { SourisDatabase } from '@/persistence/database';
import { readMetadata, writeMetadata } from '@/persistence/metadata';

export type FirstStepsStatus = 'active' | 'dismissed' | 'completed';

/** `souris_metadata` key of the flag, scoped to the Business. */
export function firstStepsKey(businessId: string): string {
  return `first_steps:${businessId}`;
}

export function readFirstStepsStatus(db: SourisDatabase, businessId: string): FirstStepsStatus | undefined {
  const value = readMetadata(db, firstStepsKey(businessId));
  return value === 'active' || value === 'dismissed' || value === 'completed' ? value : undefined;
}

/** Onboarding only: the guidance is offered to the Business it just created. */
export function startFirstSteps(db: SourisDatabase, businessId: string): void {
  if (readFirstStepsStatus(db, businessId) !== undefined) return;
  writeMetadata(db, firstStepsKey(businessId), 'active');
}

export function closeFirstSteps(
  db: SourisDatabase,
  businessId: string,
  status: Exclude<FirstStepsStatus, 'active'>,
): void {
  writeMetadata(db, firstStepsKey(businessId), status);
}
