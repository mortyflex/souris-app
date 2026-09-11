import type { Client } from '@/domain/clients';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { insertClient, loadClients, updateClient } from '../stores/clients';
import { clientLea, createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

describe('Client store', () => {
  it('keeps a created Client across a restart, with optional fields absent rather than null', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [] }));
    const created: Client = { id: 'client-new', firstName: 'Nadia' };

    insertClient(db, created);

    const reloaded = loadSnapshot(db).clients;
    expect(reloaded).toEqual([created]);
    expect(Object.keys(reloaded[0]!)).toEqual(['id', 'firstName']);
  });

  it('keeps identity edits across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const edited: Client = {
      ...clientLea,
      lastName: 'Martin-Durand',
      phone: undefined,
      email: 'lea@example.com',
    };

    updateClient(db, edited);

    expect(loadClients(db)).toEqual([
      { id: 'client-lea', firstName: 'Léa', lastName: 'Martin-Durand', email: 'lea@example.com', birthDate: '1990-02-29' },
    ]);
  });

  it('stores birthDate as the exact civil string, never as an instant', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    const stored = db.getFirstSync<{ birth_date: string }>(
      "SELECT birth_date FROM clients WHERE id = 'client-lea'",
    );
    expect(stored?.birth_date).toBe('1990-02-29');
    expect(loadClients(db)[0]?.birthDate).toBe('1990-02-29');
  });

  it('refuses to update an unknown Client', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => updateClient(db, { id: 'client-unknown', firstName: 'X' })).toThrow('not found');
  });
});
