// BeautIzzy — confirmed client import run (chunked)
//
// Writes the confirmed Clients in CHUNKS, one SQLite transaction each
// (`ClientSessionValue.addClients`), yielding to the UI between two chunks
// so the progress can render during a large import (500+ clients).
//
// A chunk commits entirely or not at all. The first failing chunk stops the
// run: the chunks already committed stay (a partial import is acceptable and
// never rolled back), and the failing chunk and the ones after it are
// returned as `remaining`, with the SAME ids, for « Réessayer ». Retrying is
// idempotent: the store skips an id that is already stored.
//
// Failures surface as stable presentation codes only — never a SQLite or
// outbox message, never a client's data.

import type { Client } from '@/domain/clients';
import { ClientBulkInsertUnboundError } from '@/persistence/stores/clients';

/**
 * Clients per transaction. An implementation constant, NOT a product rule and
 * NOT benchmarked: small enough for the UI to breathe between chunks, large
 * enough to keep the transaction count low. Tune freely.
 */
export const CLIENT_IMPORT_CHUNK_SIZE = 100;

export type ClientImportFailureCode = 'NOT_BOUND' | 'WRITE_FAILED';

export interface ClientImportRunOutcome {
  /** Clients of the committed chunks (inserted now, or already stored by an earlier attempt). */
  readonly completed: readonly Client[];
  /** The failing chunk and every chunk after it — empty when the run finished. */
  readonly remaining: readonly Client[];
  readonly failure?: ClientImportFailureCode;
}

interface RunOptions {
  readonly chunkSize?: number;
  readonly onProgress?: (completedCount: number, totalCount: number) => void;
  /** Lets the UI render between two chunks; injectable for tests. */
  readonly yieldToUi?: () => Promise<void>;
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function runClientImport(
  clients: readonly Client[],
  writeChunk: (chunk: readonly Client[]) => unknown,
  { chunkSize = CLIENT_IMPORT_CHUNK_SIZE, onProgress, yieldToUi = nextFrame }: RunOptions = {},
): Promise<ClientImportRunOutcome> {
  const size = Math.max(1, Math.floor(chunkSize));
  const completed: Client[] = [];
  for (let start = 0; start < clients.length; start += size) {
    const chunk = clients.slice(start, start + size);
    try {
      writeChunk(chunk);
    } catch (error) {
      return {
        completed,
        remaining: clients.slice(start),
        failure: error instanceof ClientBulkInsertUnboundError ? 'NOT_BOUND' : 'WRITE_FAILED',
      };
    }
    completed.push(...chunk);
    onProgress?.(completed.length, clients.length);
    if (start + size < clients.length) await yieldToUi();
  }
  return { completed, remaining: [] };
}
