// Souris — schema v4: Client birthday as day + month (docs/architecture/PERSISTENCE.md §4)

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { insertAppointment } from '../stores/appointments';
import { insertClient, loadClients, updateClient } from '../stores/clients';
import { appointmentLea, createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface CountRow {
  readonly count: number;
}

interface BirthdayRow {
  readonly id: string;
  readonly birth_date: string | null;
  readonly birthday: string | null;
}

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

/**
 * A database exactly as Account & Onboarding V1 left it on a device: schema
 * v3, seeded, with full historical `birth_date` values and no `birthday`
 * column yet.
 */
function openSchemaV3Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 3)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 3');
  });
  const insert =
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insert, ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, '1990-02-29', null]);
  db.runSync(insert, ['client-felix', 'Félix', 'Rouge', null, null, '1994-10-12', null]);
  db.runSync(insert, ['client-nadia', 'Nadia', null, null, null, null, '2026-09-01T10:00:00.000Z']);
  db.runSync(insert, ['client-odd', 'Odile', null, null, null, 'inconnu', null]);
  insertAppointment(db, appointmentLea);
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v4 migration on an existing v3 database', () => {
  it('keeps every Client birthday as day + month, drops the year, and touches nothing else', () => {
    const db = openSchemaV3Database();
    expect(readSchemaVersion(db)).toBe(3);
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(4);
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(countRows(db, 'clients')).toBe(4);
    expect(countRows(db, 'appointments')).toBe(1);
    expect(countRows(db, 'appointment_items')).toBe(2);

    expect(snapshot.clients).toEqual([
      {
        id: 'client-lea',
        firstName: 'Léa',
        lastName: 'Martin',
        phone: '06 12 34 56 78',
        birthday: { month: 2, day: 29 },
      },
      { id: 'client-felix', firstName: 'Félix', lastName: 'Rouge', birthday: { month: 10, day: 12 } },
      { id: 'client-nadia', firstName: 'Nadia', archivedAt: new Date('2026-09-01T10:00:00.000Z') },
      { id: 'client-odd', firstName: 'Odile' },
    ]);
    // No hydrated Client pretends the historical year was meaningful.
    for (const client of snapshot.clients) {
      expect('birthDate' in client).toBe(false);
    }
  });

  it('stores the MM-DD key and retains the legacy birth_date column untouched', () => {
    const db = openSchemaV3Database();
    migrateDatabase(db);

    const rows = db.getAllSync<BirthdayRow>(
      'SELECT id, birth_date, birthday FROM clients ORDER BY rowid',
    );
    expect(rows).toEqual([
      { id: 'client-lea', birth_date: '1990-02-29', birthday: '02-29' },
      { id: 'client-felix', birth_date: '1994-10-12', birthday: '10-12' },
      { id: 'client-nadia', birth_date: null, birthday: null },
      { id: 'client-odd', birth_date: 'inconnu', birthday: null },
    ]);
  });

  it('is a no-op when run again and keeps identity edits on the new column only', () => {
    const db = openSchemaV3Database();
    migrateDatabase(db);

    expect(migrateDatabase(db)).toBe(4);
    const felix = loadClients(db).find((client) => client.id === 'client-felix');
    expect(felix).toBeDefined();
    updateClient(db, { ...felix!, birthday: { month: 7, day: 21 } });

    const stored = db.getFirstSync<BirthdayRow>(
      "SELECT id, birth_date, birthday FROM clients WHERE id = 'client-felix'",
    );
    expect(stored).toEqual({ id: 'client-felix', birth_date: '1994-10-12', birthday: '07-21' });
    expect(loadSnapshot(db).clients.find((client) => client.id === 'client-felix')?.birthday).toEqual({
      month: 7,
      day: 21,
    });
  });

  it('never writes the legacy column for new Clients', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [] }));

    insertClient(db, { id: 'client-new', firstName: 'Nour', birthday: { month: 12, day: 1 } });

    expect(
      db.getFirstSync<BirthdayRow>("SELECT id, birth_date, birthday FROM clients WHERE id = 'client-new'"),
    ).toEqual({ id: 'client-new', birth_date: null, birthday: '12-01' });
  });
});
