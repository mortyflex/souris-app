import type { Client } from '@/domain/clients';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { archiveClient, insertClient, loadClients, restoreClient, updateClient } from '../stores/clients';
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

  it('stores a multiline note exactly and restores it across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [] }));
    const notes = 'Allergie au PPD.\n\nPréfère le matin\n— cuir chevelu sensible';

    insertClient(db, { id: 'client-new', firstName: 'Nadia', notes });

    expect(
      db.getFirstSync<{ notes: string | null }>("SELECT notes FROM clients WHERE id = 'client-new'")?.notes,
    ).toBe(notes);
    expect(loadSnapshot(db).clients).toEqual([{ id: 'client-new', firstName: 'Nadia', notes }]);
  });

  it('adds, edits and clears a note through identity edits without touching the birthday', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateClient(db, { ...clientLea, notes: 'Peau réactive' });
    expect(loadClients(db)[0]).toEqual({ ...clientLea, notes: 'Peau réactive' });

    updateClient(db, { ...clientLea, notes: 'Peau réactive\nÉviter l’ammoniaque' });
    expect(loadClients(db)[0]?.notes).toBe('Peau réactive\nÉviter l’ammoniaque');

    updateClient(db, clientLea);
    expect(loadClients(db)[0]).toEqual(clientLea);
    expect('notes' in loadClients(db)[0]!).toBe(false);
    expect(
      db.getFirstSync<{ notes: string | null }>("SELECT notes FROM clients WHERE id = 'client-lea'")?.notes,
    ).toBeNull();
  });

  it('never stores a blank note: whitespace resolves to NULL', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [] }));

    insertClient(db, { id: 'client-new', firstName: 'Nadia', notes: '  \n ' });

    expect(
      db.getFirstSync<{ notes: string | null }>("SELECT notes FROM clients WHERE id = 'client-new'")?.notes,
    ).toBeNull();
    expect(loadClients(db)).toEqual([{ id: 'client-new', firstName: 'Nadia' }]);
  });

  it('keeps the note through archive and restore', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    updateClient(db, { ...clientLea, notes: 'Peau réactive' });

    archiveClient(db, clientLea.id, new Date('2026-09-21T10:00:00.000Z'));
    expect(loadClients(db)[0]?.notes).toBe('Peau réactive');
    restoreClient(db, clientLea.id);
    expect(loadClients(db)[0]).toEqual({ ...clientLea, notes: 'Peau réactive' });
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
