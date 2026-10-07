// BeautIzzy — Caisse heatmap hint: the device-local « seen » flag
//
// Whether the explanation of the month calendar's revenue halos was
// understood on THIS installation. A UI preference, not business data: it
// lives in the local `souris_metadata` key/value table (never synced — no
// aggregate reads it — and no schema change), is written ONLY when the
// professional taps « Compris », and never reset by a manual reopening.

import type { SourisDatabase } from '@/persistence/database';
import { readMetadata, writeMetadata } from '@/persistence/metadata';

/** `souris_metadata` key of the flag. */
export const CASH_REGISTER_HEATMAP_HINT_SEEN_KEY = 'cash_register_heatmap_hint_seen';

export function hasSeenCashRegisterHeatmapHint(db: SourisDatabase): boolean {
  return readMetadata(db, CASH_REGISTER_HEATMAP_HINT_SEEN_KEY) === '1';
}

export function markCashRegisterHeatmapHintSeen(db: SourisDatabase): void {
  writeMetadata(db, CASH_REGISTER_HEATMAP_HINT_SEEN_KEY, '1');
}
