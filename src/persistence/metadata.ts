// Souris — key/value metadata (seed marker and future flags)

import type { SourisDatabase } from './database';

interface MetadataRow {
  readonly value: string;
}

export function readMetadata(db: SourisDatabase, key: string): string | undefined {
  return db.getFirstSync<MetadataRow>('SELECT value FROM souris_metadata WHERE key = ?', [key])
    ?.value;
}

export function writeMetadata(db: SourisDatabase, key: string, value: string): void {
  db.runSync(
    'INSERT INTO souris_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export function deleteMetadata(db: SourisDatabase, key: string): void {
  db.runSync('DELETE FROM souris_metadata WHERE key = ?', [key]);
}
