// Souris — local cache of the LAST KNOWN server reminder preference
//
// The server preference is authoritative (CLAUDE.md-level rule of Lot B);
// this cache only keeps the Settings screen and the appointment editors
// honest while offline. It is Business-scoped, read only as a fallback, and
// NEVER pushed anywhere: when neither the server nor the cache can answer,
// the UI fails safe and treats reminder automation as disabled.

import { deleteMetadata, readMetadata, writeMetadata } from '@/persistence/metadata';
import type { SourisDatabase } from '@/persistence/database';

import type { CommunicationPreferences } from '../gateway';

const CACHE_KEY = 'communication_preferences_cache';

interface CachedPreferences {
  readonly businessId: string;
  readonly emailRemindersEnabled: boolean;
  /**
   * Deprecated dormant field (retired appointment-SMS preference), kept for
   * cache-shape compatibility. Absent reads as false; nothing displays it.
   */
  readonly smsRemindersEnabled?: boolean;
  readonly replyToEmail: string | null;
  readonly cachedAt: string;
}

export function readCachedCommunicationPreferences(
  db: SourisDatabase,
  businessId: string,
): CommunicationPreferences | undefined {
  const raw = readMetadata(db, CACHE_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedPreferences>;
    if (parsed.businessId !== businessId) return undefined;
    if (typeof parsed.emailRemindersEnabled !== 'boolean') return undefined;
    return {
      emailRemindersEnabled: parsed.emailRemindersEnabled,
      smsRemindersEnabled: parsed.smsRemindersEnabled === true,
      ...(typeof parsed.replyToEmail === 'string' && parsed.replyToEmail.length > 0
        ? { replyToEmail: parsed.replyToEmail }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export function writeCachedCommunicationPreferences(
  db: SourisDatabase,
  businessId: string,
  preferences: CommunicationPreferences,
  now: Date = new Date(),
): void {
  const record: CachedPreferences = {
    businessId,
    emailRemindersEnabled: preferences.emailRemindersEnabled,
    smsRemindersEnabled: preferences.smsRemindersEnabled === true,
    replyToEmail: preferences.replyToEmail ?? null,
    cachedAt: now.toISOString(),
  };
  writeMetadata(db, CACHE_KEY, JSON.stringify(record));
}

export function clearCachedCommunicationPreferences(db: SourisDatabase): void {
  deleteMetadata(db, CACHE_KEY);
}
