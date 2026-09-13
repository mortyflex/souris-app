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
      { id: 'client-lea', firstName: 'Léa', lastName: 'Martin-Durand', email: 'lea@example.com', birthday: { month: 2, day: 29 } },
    ]);
  });

  it('stores the birthday as the MM-DD key without any year, and restores day + month', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    const stored = db.getFirstSync<{ birthday: string; birth_date: string | null }>(
      "SELECT birthday, birth_date FROM clients WHERE id = 'client-lea'",
    );
    expect(stored?.birthday).toBe('02-29');
    expect(stored?.birth_date).toBeNull();
    expect(loadClients(db)[0]?.birthday).toEqual({ month: 2, day: 29 });
  });

  it('clears the birthday when an edit removes it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateClient(db, { ...clientLea, birthday: undefined });

    expect(loadClients(db)[0]?.birthday).toBeUndefined();
    expect(
      db.getFirstSync<{ birthday: string | null }>("SELECT birthday FROM clients WHERE id = 'client-lea'")
        ?.birthday,
    ).toBeNull();
  });

  it('refuses to update an unknown Client', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => updateClient(db, { id: 'client-unknown', firstName: 'X' })).toThrow('not found');
  });
});
