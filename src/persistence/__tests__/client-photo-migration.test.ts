// Souris — schema v13: Client photo reference (docs/architecture/PERSISTENCE.md §4)

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import {
  archiveClient,
  insertClient,
  loadClients,
  restoreClient,
  setClientPhotoPath,
  updateClient,
} from '../stores/clients';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { createTestSeed, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const PHOTO = '11111111-1111-4111-8111-111111111111/clients/client-lea/photo-1.jpg';

/** A database exactly as the previous build (schema v12) leaves it on a device. */
function openSchemaV12Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 12)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 12');
  });
  const insert =
    'INSERT INTO clients (id, first_name, last_name, phone, email, birthday, notes, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insert, ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, '02-29', 'Peau sensible', null]);
  db.runSync(insert, ['client-nadia', 'Nadia', null, null, null, null, null, '2026-09-01T10:00:00.000Z']);
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-remote', 'CLIENT', 'client-lea', 4, '2026-09-18T08:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v13 migration on an existing v12 database', () => {
  it('adds a NULL photo_path and leaves every Client, id and sync row untouched', () => {
    const db = openSchemaV12Database();
    const columns = 'rowid, id, first_name, last_name, phone, email, birthday, notes, archived_at';
    const clientsBefore = db.getAllSync(`SELECT ${columns} FROM clients ORDER BY rowid`);
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id');

    const snapshot = bootstrapPersistence(db, createTestSeed);

    expect(readSchemaVersion(db)).toBe(15);
    expect(CURRENT_SCHEMA_VERSION).toBe(15);
    expect(db.getAllSync(`SELECT ${columns} FROM clients ORDER BY rowid`)).toEqual(clientsBefore);
    expect(db.getAllSync('SELECT photo_path FROM clients')).toEqual([{ photo_path: null }, { photo_path: null }]);
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id')).toEqual(stateBefore);
    // Existing Clients load exactly as before: no photo key invented.
    for (const client of snapshot.clients) {
      expect('photoPath' in client).toBe(false);
    }
    expect(snapshot.clients[0]).toMatchObject({ notes: 'Peau sensible', birthday: { month: 2, day: 29 } });
  });

  it('is idempotent', () => {
    const db = openSchemaV12Database();
    bootstrapPersistence(db, createTestSeed);
    expect(migrateDatabase(db)).toBe(15);
    expect(loadClients(db)).toHaveLength(2);
  });
});

const outbox = (db: ReturnType<typeof openTestDatabase>) =>
  db.getAllSync('SELECT aggregate_type, aggregate_id, operation FROM sync_outbox ORDER BY id');

describe('Client photo reference in the store', () => {
  function openMigrated() {
    const db = openSchemaV12Database();
    bootstrapPersistence(db, createTestSeed);
    // A bound device: every local mutation records its aggregate in the outbox.
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    db.runSync('DELETE FROM sync_outbox');
    return db;
  }

  it('sets and clears ONLY the photo, marking the CLIENT aggregate for sync', () => {
    const db = openMigrated();
    const before = loadClients(db).find((client) => client.id === 'client-lea')!;

    setClientPhotoPath(db, 'client-lea', PHOTO);
    expect(loadClients(db).find((client) => client.id === 'client-lea')).toEqual({ ...before, photoPath: PHOTO });
    expect(outbox(db)).toEqual([{ aggregate_type: 'CLIENT', aggregate_id: 'client-lea', operation: 'UPSERT' }]);

    setClientPhotoPath(db, 'client-lea', undefined);
    const cleared = loadClients(db).find((client) => client.id === 'client-lea')!;
    expect(cleared).toEqual(before);
    expect('photoPath' in cleared).toBe(false);
    expect(db.getFirstSync('SELECT photo_path FROM clients WHERE id = ?', ['client-lea'])).toEqual({ photo_path: null });
  });

  it('refuses an unknown Client and writes nothing', () => {
    const db = openMigrated();
    expect(() => setClientPhotoPath(db, 'client-missing', PHOTO)).toThrow('not found');
    expect(outbox(db)).toEqual([]);
  });

  it('keeps the photo through identity edits, archive and restore', () => {
    const db = openMigrated();
    setClientPhotoPath(db, 'client-lea', PHOTO);
    const lea = loadClients(db).find((client) => client.id === 'client-lea')!;

    // The Client form's record carries no photoPath at all.
    const { photoPath: _photoPath, ...identity } = lea;
    updateClient(db, { ...identity, phone: '07 00 00 00 00' });
    archiveClient(db, 'client-lea', new Date('2026-09-25T08:00:00.000Z'));
    expect(loadClients(db).find((client) => client.id === 'client-lea')).toMatchObject({
      photoPath: PHOTO,
      phone: '07 00 00 00 00',
      archivedAt: new Date('2026-09-25T08:00:00.000Z'),
    });
    restoreClient(db, 'client-lea');
    expect(loadSnapshot(db).clients.find((client) => client.id === 'client-lea')?.photoPath).toBe(PHOTO);
  });

  it('inserts a Client with a photo reference (restore / creation path)', () => {
    const db = openMigrated();
    insertClient(db, { id: 'client-zoe', firstName: 'Zoé', photoPath: PHOTO });
    expect(loadClients(db).find((client) => client.id === 'client-zoe')).toEqual({
      id: 'client-zoe',
      firstName: 'Zoé',
      photoPath: PHOTO,
    });
  });
});
