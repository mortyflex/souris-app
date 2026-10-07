// BeautIzzy — chunked client import run over the real SQLite store (fictional data)

import type { Client } from '@/domain/clients';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { insertClients, loadClients } from '@/persistence/stores/clients';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createTestSeed, remoteBusinessProfile } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { CLIENT_IMPORT_CHUNK_SIZE, runClientImport } from '../run-client-import';

function openDatabase({ bound }: { readonly bound: boolean }): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ clients: [], appointments: [] }));
  if (bound) bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

function plan(count: number): Client[] {
  return Array.from({ length: count }, (_, index) => ({ id: `plan-${index}`, firstName: `Prénom${index}` }));
}

const immediately = () => Promise.resolve();

describe('runClientImport', () => {
  it('keeps the chunk size a tunable implementation constant', () => {
    expect(CLIENT_IMPORT_CHUNK_SIZE).toBe(100);
  });

  it('writes 500 Clients in chunks, reporting progress and yielding between chunks', async () => {
    const db = openDatabase({ bound: true });
    const chunks: number[] = [];
    const progress: number[] = [];
    const yieldToUi = jest.fn(immediately);

    const outcome = await runClientImport(
      plan(500),
      (chunk) => {
        chunks.push(chunk.length);
        return insertClients(db, chunk);
      },
      { onProgress: (done) => progress.push(done), yieldToUi },
    );

    expect(chunks).toEqual([100, 100, 100, 100, 100]);
    expect(progress).toEqual([100, 200, 300, 400, 500]);
    expect(yieldToUi).toHaveBeenCalledTimes(4);
    expect(outcome).toEqual({ completed: plan(500), remaining: [] });
    expect(loadClients(db)).toHaveLength(500);
    expect(countSyncOutboxRows(db)).toBe(500);
  });

  it('keeps committed chunks when a later one fails, then retries the rest without duplicates', async () => {
    const db = openDatabase({ bound: true });
    const clients = plan(250);
    let failNext = true;

    const first = await runClientImport(
      clients,
      (chunk) => {
        if (chunk[0]?.id === 'plan-100' && failNext) {
          failNext = false;
          throw new Error('SQLITE_FULL: database or disk is full');
        }
        return insertClients(db, chunk);
      },
      { yieldToUi: immediately },
    );

    expect(first.completed).toHaveLength(100);
    expect(first.remaining.map((client) => client.id)).toEqual(clients.slice(100).map((client) => client.id));
    // A stable presentation code — never the SQLite message.
    expect(first.failure).toBe('WRITE_FAILED');
    expect(loadClients(db)).toHaveLength(100);

    // Retry the SAME remaining Clients (same ids), one of them written meanwhile.
    insertClients(db, [clients[100]!]);
    const retry = await runClientImport(first.remaining, (chunk) => insertClients(db, chunk), {
      yieldToUi: immediately,
    });

    expect(retry).toEqual({ completed: first.remaining, remaining: [] });
    expect(loadClients(db).map((client) => client.id)).toEqual(clients.map((client) => client.id));
    expect(countSyncOutboxRows(db)).toBe(250);
  });

  it('fails safely with NOT_BOUND on an unbound database, writing nothing', async () => {
    const db = openDatabase({ bound: false });

    const outcome = await runClientImport(plan(3), (chunk) => insertClients(db, chunk), {
      yieldToUi: immediately,
    });

    expect(outcome.failure).toBe('NOT_BOUND');
    expect(outcome.completed).toEqual([]);
    expect(outcome.remaining).toHaveLength(3);
    expect(loadClients(db)).toEqual([]);
  });
});
