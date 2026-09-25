// Souris — schema v9: Client notes (docs/architecture/PERSISTENCE.md §4)

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { loadClients, updateClient } from '../stores/clients';
import { createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface RawClientRow {
  readonly rowid: number;
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birth_date: string | null;
  readonly birthday: string | null;
  readonly archived_at: string | null;
}

const RAW_CLIENT_COLUMNS =
  'rowid, id, first_name, last_name, phone, email, birth_date, birthday, archived_at';

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

/**
 * A database exactly as the current TestFlight build (schema v8) leaves it on
 * a device: real Clients without any `notes` column, one of them already
 * acknowledged by the remote and one with a pending local edit.
 */
function openSchemaV8Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 8)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 8');
  });
  const insert =
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insert, ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, '1990-02-29', null, '02-29']);
  db.runSync(insert, ['client-felix', 'Félix', 'Rouge', null, 'felix@example.com', null, null, null]);
  db.runSync(insert, ['client-nadia', 'Nadia', null, null, null, null, '2026-09-01T10:00:00.000Z', '10-12']);
  db.runSync(
    "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-remote', 'CLIENT', 'client-lea', 4, '2026-09-18T08:00:00.000Z')",
  );
  db.runSync(
    "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at) VALUES ('business-remote', 'CLIENT', 'client-felix', 'UPSERT', 2, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v9 migration on an existing v8 database', () => {
  it('adds a NULL notes column and leaves every Client, id, order and sync row untouched', () => {
    const db = openSchemaV8Database();
    const clientsBefore = db.getAllSync<RawClientRow>(`SELECT ${RAW_CLIENT_COLUMNS} FROM clients ORDER BY rowid`);
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(15);
    expect(CURRENT_SCHEMA_VERSION).toBe(15);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);

    expect(db.getAllSync<RawClientRow>(`SELECT ${RAW_CLIENT_COLUMNS} FROM clients ORDER BY rowid`)).toEqual(
      clientsBefore,
    );
    expect(countRows(db, 'clients')).toBe(3);
    expect(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM clients WHERE notes IS NOT NULL')?.count).toBe(0);
    // The migration changed nothing the remote should hear about.
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state ORDER BY aggregate_id')).toEqual(stateBefore);

    // Clients written by the previous build load normally: no birthday lost, no `notes` key invented.
    expect(snapshot.clients).toEqual([
      {
        id: 'client-lea',
        firstName: 'Léa',
        lastName: 'Martin',
        phone: '06 12 34 56 78',
        birthday: { month: 2, day: 29 },
      },
      { id: 'client-felix', firstName: 'Félix', lastName: 'Rouge', email: 'felix@example.com' },
      {
        id: 'client-nadia',
        firstName: 'Nadia',
        birthday: { month: 10, day: 12 },
        archivedAt: new Date('2026-09-01T10:00:00.000Z'),
      },
    ]);
    for (const client of snapshot.clients) {
      expect('notes' in client).toBe(false);
    }
  });

  it('is idempotent and lets a migrated Client receive a note afterwards', () => {
    const db = openSchemaV8Database();
    bootstrapPersistence(db, createTestSeed);

    expect(migrateDatabase(db)).toBe(15);
    expect(countRows(db, 'clients')).toBe(3);

    const felix = loadClients(db).find((client) => client.id === 'client-felix');
    updateClient(db, { ...felix!, notes: 'Allergie au PPD.\nPréfère le matin' });

    expect(loadSnapshot(db).clients.find((client) => client.id === 'client-felix')).toEqual({
      id: 'client-felix',
      firstName: 'Félix',
      lastName: 'Rouge',
      email: 'felix@example.com',
      notes: 'Allergie au PPD.\nPréfère le matin',
    });
    // The other Clients are still exactly what the previous build stored.
    expect(loadClients(db).find((client) => client.id === 'client-lea')?.birthday).toEqual({ month: 2, day: 29 });
  });

  // `appointments` is left out as well: the bootstrap runs every later
  // migration too, and schema v10 adds the discount columns to it (covered by
  // appointment-discount-migration.test.ts); schema v11 creates
  // `calendar_blocks` and rebuilds the two sync bookkeeping tables
  // (calendar-blocks-migration.test.ts); schema v14 adds `products.photo_path`
  // (product-photo-migration.test.ts).
  it('changes no other table definition', () => {
    const db = openSchemaV8Database();
    const tablesBefore = db.getAllSync<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('clients', 'appointments', 'calendar_blocks', 'appointment_deposits', 'sync_outbox', 'sync_state', 'products') ORDER BY name",
    );

    bootstrapPersistence(db, createTestSeed);

    expect(
      db.getAllSync<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT IN ('clients', 'appointments', 'calendar_blocks', 'appointment_deposits', 'sync_outbox', 'sync_state', 'products') ORDER BY name",
      ),
    ).toEqual(tablesBefore);
  });
});
