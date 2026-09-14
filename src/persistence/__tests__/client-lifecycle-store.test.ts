import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { readSeedVersion } from '../seed';
import { insertAppointment } from '../stores/appointments';
import {
  ClientDeleteConflictError,
  archiveClient,
  countClientReferences,
  deleteClientPermanently,
  insertClient,
  loadClients,
  restoreClient,
  updateClient,
} from '../stores/clients';
import { completeSale } from '../stores/sales';
import { appointmentLea, clientLea, createTestSeed } from '../testing/fixtures';
import { insertHistoricalAppointment } from '../testing/historical-fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

interface CountRow {
  readonly count: number;
}

function countRows(db: ReturnType<typeof openTestDatabase>, table: string): number {
  return db.getFirstSync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

const saleLea: Sale = {
  id: 'sale-lea',
  businessId: 'business-test',
  clientId: clientLea.id,
  completedAt: new Date(2026, 8, 10, 15),
  items: [{ id: 'sale-lea-item', productId: 'product-serum', productName: 'Sérum', unitPrice: 32, quantity: 1 }],
};

/**
 * A database exactly as Persistence V1 left it on a device: schema v1 only,
 * seeded, with a Client row that has NO archived_at column yet.
 */
function openSchemaV1Database() {
  const db = openTestDatabase();
  const v1 = migrations.find((migration) => migration.version === 1);
  if (!v1) throw new Error('schema v1 migration missing');
  db.withTransactionSync(() => {
    v1.up(db);
    db.execSync('PRAGMA user_version = 1');
  });
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date) VALUES (?, ?, ?, ?, ?, ?)',
    ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, '1990-02-29'],
  );
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date) VALUES (?, ?, ?, ?, ?, ?)',
    ['client-nadia', 'Nadia', null, null, null, null],
  );
  insertHistoricalAppointment(db, appointmentLea);
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v2 migration on an existing v1 database', () => {
  it('adds archived_at as NULL, keeps every Client and related record, and does not re-seed', () => {
    const db = openSchemaV1Database();
    expect(readSchemaVersion(db)).toBe(1);
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(7);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(createSeed).not.toHaveBeenCalled();
    expect(readSeedVersion(db)).toBe(1);
    expect(countRows(db, 'clients')).toBe(2);
    expect(snapshot.clients).toEqual([
      { id: 'client-lea', firstName: 'Léa', lastName: 'Martin', phone: '06 12 34 56 78', birthday: { month: 2, day: 29 } },
      { id: 'client-nadia', firstName: 'Nadia' },
    ]);
    expect(snapshot.clients.every((client) => client.archivedAt === undefined)).toBe(true);
    expect(
      db.getAllSync<{ archived_at: string | null }>('SELECT archived_at FROM clients').map(
        (row) => row.archived_at,
      ),
    ).toEqual([null, null]);
    expect(snapshot.appointments).toHaveLength(1);
    expect(snapshot.appointments[0]?.clientId).toBe('client-lea');
    expect(countRows(db, 'appointment_items')).toBe(2);
  });

  it('is a no-op when run again', () => {
    const db = openSchemaV1Database();
    migrateDatabase(db);

    expect(migrateDatabase(db)).toBe(7);
    expect(countRows(db, 'clients')).toBe(2);
    expect(
      db.getAllSync<{ name: string }>('PRAGMA table_info(clients)').filter(
        (column) => column.name === 'archived_at',
      ),
    ).toHaveLength(1);
  });

  it('lets a migrated Client be archived and restored with an exact Date across restarts', () => {
    const db = openSchemaV1Database();
    bootstrapPersistence(db, createTestSeed);
    const archivedAt = new Date('2026-09-12T08:15:30.123Z');

    archiveClient(db, 'client-nadia', archivedAt);

    const afterRestart = bootstrapPersistence(db, createTestSeed).clients;
    expect(afterRestart.find((client) => client.id === 'client-nadia')?.archivedAt).toEqual(archivedAt);
    expect(afterRestart.find((client) => client.id === 'client-lea')?.archivedAt).toBeUndefined();

    restoreClient(db, 'client-nadia');

    expect(bootstrapPersistence(db, createTestSeed).clients.map((client) => client.archivedAt)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('Client lifecycle store', () => {
  it('stores archivedAt as an ISO instant and restores the same Date', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const archivedAt = new Date(2026, 8, 12, 10, 30, 45, 250);

    archiveClient(db, clientLea.id, archivedAt);

    expect(
      db.getFirstSync<{ archived_at: string }>("SELECT archived_at FROM clients WHERE id = 'client-lea'")
        ?.archived_at,
    ).toBe(archivedAt.toISOString());
    const reloaded = loadSnapshot(db).clients[0];
    expect(reloaded?.archivedAt).toBeInstanceOf(Date);
    expect(reloaded?.archivedAt?.getTime()).toBe(archivedAt.getTime());
    expect(reloaded).toEqual({ ...clientLea, archivedAt });
  });

  it('restores to an active Client with no archivedAt key at all', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    archiveClient(db, clientLea.id, new Date());

    restoreClient(db, clientLea.id);

    const reloaded = loadClients(db)[0];
    expect(reloaded).toEqual(clientLea);
    expect(reloaded && 'archivedAt' in reloaded).toBe(false);
  });

  it('inserts an already-archived Client and keeps identity edits from touching the lifecycle', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [], appointments: [] }));
    const archivedAt = new Date(2026, 0, 5);
    insertClient(db, { id: 'client-old', firstName: 'Ancienne', archivedAt });

    updateClient(db, { id: 'client-old', firstName: 'Renommée', lastName: 'Cliente' });

    expect(loadClients(db)).toEqual([
      { id: 'client-old', firstName: 'Renommée', lastName: 'Cliente', archivedAt },
    ]);
  });

  it('archiving changes nothing else: Appointments, Sales, and other Clients stay intact', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    completeSale(db, saleLea, []);
    const before = loadSnapshot(db);

    archiveClient(db, clientLea.id, new Date());

    const after = loadSnapshot(db);
    expect(after.appointments).toEqual(before.appointments);
    expect(after.sales).toEqual(before.sales);
    expect(after.products).toEqual(before.products);
    expect(after.clients).toHaveLength(before.clients.length);
  });

  it('refuses to archive or restore an unknown Client', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => archiveClient(db, 'client-unknown', new Date())).toThrow('not found');
    expect(() => restoreClient(db, 'client-unknown')).toThrow('not found');
    expect(loadClients(db)).toEqual([clientLea]);
  });

  it('counts references of any status, including terminal outcomes and walk-in exclusion', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointment(db, {
      ...appointmentLea,
      id: 'appointment-lea-cancelled',
      status: 'CANCELLED',
      cancellation: { cancelledAt: new Date(2026, 8, 1), cancelledBy: 'CLIENT' },
    });
    completeSale(db, saleLea, []);
    completeSale(db, { ...saleLea, id: 'sale-walk-in', clientId: undefined }, []);

    expect(countClientReferences(db, clientLea.id)).toEqual({ appointmentCount: 2, saleCount: 1 });
    expect(countClientReferences(db, 'client-nobody')).toEqual({ appointmentCount: 0, saleCount: 0 });
  });

  it('permanently deletes an unreferenced Client and keeps it gone after a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    archiveClient(db, clientLea.id, new Date());

    deleteClientPermanently(db, clientLea.id);

    expect(countRows(db, 'clients')).toBe(0);
    expect(bootstrapPersistence(db, createTestSeed).clients).toEqual([]);
    expect(readSeedVersion(db)).toBe(1);
  });

  it('refuses deletion with a typed conflict when an Appointment references the Client', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    archiveClient(db, clientLea.id, new Date());

    let caught: unknown;
    try {
      deleteClientPermanently(db, clientLea.id);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ClientDeleteConflictError);
    expect((caught as ClientDeleteConflictError).references).toEqual({ appointmentCount: 1, saleCount: 0 });
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'appointments')).toBe(1);
    expect(countRows(db, 'appointment_items')).toBe(2);
    expect(db.isInTransactionSync()).toBe(false);
  });

  it('refuses deletion when a Sale references the Client, and when both do', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ appointments: [] }));
    completeSale(db, saleLea, []);

    expect(() => deleteClientPermanently(db, clientLea.id)).toThrow(ClientDeleteConflictError);
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'sales')).toBe(1);
    expect(countRows(db, 'sale_items')).toBe(1);

    insertAppointment(db, appointmentLea);
    let caught: unknown;
    try {
      deleteClientPermanently(db, clientLea.id);
    } catch (error) {
      caught = error;
    }
    expect((caught as ClientDeleteConflictError).references).toEqual({ appointmentCount: 1, saleCount: 1 });
    expect(countRows(db, 'clients')).toBe(1);
    expect(countRows(db, 'appointments')).toBe(1);
    expect(countRows(db, 'sales')).toBe(1);
    expect(loadSnapshot(db).sales[0]?.clientId).toBe(clientLea.id);
  });

  it('refuses to delete an unknown Client without writing anything', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() => deleteClientPermanently(db, 'client-unknown')).toThrow('not found');
    expect(countRows(db, 'clients')).toBe(1);
  });
});
