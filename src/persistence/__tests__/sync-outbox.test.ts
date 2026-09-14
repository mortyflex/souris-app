// Souris — Cloud Sync V1B: local outbox behavior through the real stores
// (docs/architecture/CLOUD_SYNC.md §10, PERSISTENCE.md §4 / §7c)

import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { clearPersistedDataForDevelopment } from '../development-reset';
import { readSeedVersion } from '../seed';
import {
  checkoutAppointment,
  deleteAppointment,
  insertAppointment,
  removeAppointmentItem,
  reorderAppointmentItems,
  updateAppointment,
  updateAppointmentItemPhaseDurations,
  updateAppointmentPayment,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '../stores/business-profile';
import {
  archiveClient,
  ClientDeleteConflictError,
  deleteClientPermanently,
  insertClient,
  loadClients,
  restoreClient,
  updateClient,
} from '../stores/clients';
import {
  deleteProduct,
  findProduct,
  insertProduct,
  setProductActive,
  setProductStock,
  updateProduct,
} from '../stores/products';
import { completeSale, deleteAppointmentProduct, SaleStockConflictError } from '../stores/sales';
import { deleteService, insertService, setServiceActive, updateService } from '../stores/services';
import {
  countSyncOutboxRows,
  findSyncOutboxEntry,
  loadSyncOutbox,
  recordSyncOutboxFailure,
  settleSyncOutboxEntry,
  type SyncOutboxEntry,
} from '../sync/outbox';
import { loadSyncState } from '../sync/state';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
  serviceColor,
  serviceCut,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

function countRows(db: SourisDatabase, table: string): number {
  return db.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

/** Seeded (while unbound — the seed records no intent) then bound to the remote Business. */
function openBoundDatabase(seed = createTestSeed) {
  const db = openTestDatabase();
  bootstrapPersistence(db, seed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(countSyncOutboxRows(db)).toBe(0);
  return db;
}

function outbox(db: SourisDatabase) {
  return loadSyncOutbox(db, REMOTE_BUSINESS_ID);
}

function summary(entries: readonly SyncOutboxEntry[]) {
  return entries.map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation, entry.revision]);
}

const walkInSale: Sale = {
  id: 'sale-walk-in',
  businessId: REMOTE_BUSINESS_ID,
  completedAt: new Date(2026, 8, 11, 11, 15),
  items: [
    { id: 'sale-walk-in-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
  ],
};

describe('sync outbox — Business scoping', () => {
  it('records no intent while the database is unbound', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    updateService(db, { ...serviceCut, price: 45 });
    setProductStock(db, productMask.id, 9);
    updateAppointment(db, { ...appointmentLea, notes: 'Changé' });
    completeSale(db, { ...walkInSale, businessId: 'business-test' }, [{ productId: productMask.id, quantity: 2 }]);
    deleteService(db, serviceColor.id);

    expect(countSyncOutboxRows(db)).toBe(0);
    expect(loadSnapshot(db).clients[0]?.firstName).toBe('Léa-Marie');
  });

  it('binding by itself records nothing; every later entry carries the bound Business UUID', () => {
    const db = openBoundDatabase();

    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    updateService(db, { ...serviceCut, price: 45 });
    setProductStock(db, productMask.id, 9);
    updateAppointment(db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID, notes: 'Changé' });
    completeSale(db, walkInSale, []);

    const entries = outbox(db);
    expect(entries.map((entry) => entry.businessId)).toEqual(Array(5).fill(REMOTE_BUSINESS_ID));
    expect(entries).toHaveLength(countSyncOutboxRows(db));
    expect(summary(entries)).toEqual([
      ['CLIENT', 'client-lea', 'UPSERT', 1],
      ['SERVICE', 'service-cut', 'UPSERT', 1],
      ['PRODUCT', 'product-mask', 'UPSERT', 1],
      ['APPOINTMENT', 'appointment-lea', 'UPSERT', 1],
      ['SALE', 'sale-walk-in', 'UPSERT', 1],
    ]);
    expect(loadSyncOutbox(db, 'another-business')).toEqual([]);
  });

  it('never writes sync_state from a local mutation', () => {
    const db = openBoundDatabase();

    insertClient(db, { id: 'client-new', firstName: 'Nadia' });
    updateService(db, { ...serviceCut, price: 45 });
    deleteProduct(db, productSerum.id);

    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(countRows(db, 'sync_state')).toBe(0);
  });
});

describe('sync outbox — one mutation, one entry', () => {
  it('creates exactly one UPSERT entry per created aggregate, with no attempt history', () => {
    const db = openBoundDatabase(() => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));

    insertClient(db, clientLea);
    insertService(db, { ...serviceCut, businessId: REMOTE_BUSINESS_ID });
    insertProduct(db, { ...productMask, businessId: REMOTE_BUSINESS_ID });
    insertAppointment(db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID });
    completeSale(db, walkInSale, [{ productId: productMask.id, quantity: 2 }]);

    const entries = outbox(db);
    expect(summary(entries)).toEqual([
      ['CLIENT', 'client-lea', 'UPSERT', 1],
      ['SERVICE', 'service-cut', 'UPSERT', 1],
      ['PRODUCT', 'product-mask', 'UPSERT', 2],
      ['APPOINTMENT', 'appointment-lea', 'UPSERT', 1],
      ['SALE', 'sale-walk-in', 'UPSERT', 1],
    ]);
    for (const entry of entries) {
      expect(entry.attemptCount).toBe(0);
      expect('lastError' in entry).toBe(false);
      expect('nextAttemptAt' in entry).toBe(false);
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt.getTime()).toBeGreaterThanOrEqual(entry.createdAt.getTime());
    }
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(5);
  });

  it('marks the Client on identity edits, archive and restore', () => {
    const db = openBoundDatabase();

    updateClient(db, { ...clientLea, phone: '07 00 00 00 00' });
    expect(summary(outbox(db))).toEqual([['CLIENT', 'client-lea', 'UPSERT', 1]]);
    archiveClient(db, clientLea.id, new Date());
    restoreClient(db, clientLea.id);
    expect(summary(outbox(db))).toEqual([['CLIENT', 'client-lea', 'UPSERT', 3]]);
  });

  it('marks the Product on catalog edits, activation and stock changes', () => {
    const db = openBoundDatabase();

    updateProduct(db, { ...productMask, businessId: REMOTE_BUSINESS_ID, price: 55 });
    setProductActive(db, productMask.id, false);
    setProductStock(db, productSerum.id, 4);

    expect(summary(outbox(db))).toEqual([
      ['PRODUCT', 'product-mask', 'UPSERT', 2],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
    ]);
  });

  it('writes no entry when a single-statement change matches no row', () => {
    const db = openBoundDatabase();

    setProductStock(db, 'product-unknown', 4);
    setProductActive(db, 'product-unknown', false);
    setServiceActive(db, 'service-unknown', false);
    deleteProduct(db, 'product-unknown');
    deleteService(db, 'service-unknown');

    expect(countSyncOutboxRows(db)).toBe(0);
  });
});

describe('sync outbox — coalescing', () => {
  it('collapses repeated edits of one aggregate into one entry that keeps its id and created_at', () => {
    const db = openBoundDatabase();

    updateClient(db, { ...clientLea, firstName: 'A' });
    const [first] = outbox(db);
    updateClient(db, { ...clientLea, firstName: 'B' });
    updateClient(db, { ...clientLea, firstName: 'C' });

    const entries = outbox(db);
    expect(entries).toHaveLength(1);
    expect(countSyncOutboxRows(db)).toBe(1);
    const [entry] = entries;
    expect(entry?.id).toBe(first?.id);
    expect(entry?.createdAt).toEqual(first?.createdAt);
    expect(entry?.revision).toBe(3);
    expect(entry?.operation).toBe('UPSERT');
    expect(entry?.updatedAt.getTime()).toBeGreaterThanOrEqual(first?.updatedAt.getTime() ?? Infinity);
    expect(loadClients(db)[0]?.firstName).toBe('C');
  });

});

describe('sync outbox — retry metadata belongs to the failed revision', () => {
  const failedAt = new Date('2026-09-15T00:00:00.000Z');

  function failOnce(db: SourisDatabase, entry: SyncOutboxEntry) {
    recordSyncOutboxFailure(db, entry.id, 'network unreachable', failedAt);
    expect(outbox(db)[0]).toMatchObject({
      id: entry.id,
      attemptCount: 1,
      lastError: 'network unreachable',
      nextAttemptAt: failedAt,
    });
  }

  function expectReset(db: SourisDatabase, before: SyncOutboxEntry, operation: 'UPSERT' | 'DELETE') {
    const entries = outbox(db);
    expect(entries).toHaveLength(1);
    const [after] = entries;
    expect(after).toMatchObject({
      id: before.id,
      createdAt: before.createdAt,
      revision: before.revision + 1,
      operation,
      attemptCount: 0,
    });
    expect('lastError' in after!).toBe(false);
    expect('nextAttemptAt' in after!).toBe(false);
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  }

  it('failed UPSERT → local edit: same row, revision + 1, retry state reset', () => {
    const db = openBoundDatabase();
    updateService(db, { ...serviceCut, businessId: REMOTE_BUSINESS_ID, price: 45 });
    const [entry] = outbox(db);
    failOnce(db, entry!);

    setServiceActive(db, serviceCut.id, false);

    expectReset(db, entry!, 'UPSERT');
  });

  it('failed UPSERT → DELETE: same row becomes DELETE with retry state reset', () => {
    const db = openBoundDatabase(() => createTestSeed({ appointments: [] }));
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    const [entry] = outbox(db);
    failOnce(db, entry!);

    deleteClientPermanently(db, clientLea.id);

    expectReset(db, entry!, 'DELETE');
    expect(countRows(db, 'clients')).toBe(0);
  });

  it('failed DELETE → recreate: same row becomes UPSERT with retry state reset', () => {
    const db = openBoundDatabase(() => createTestSeed({ appointments: [] }));
    deleteClientPermanently(db, clientLea.id);
    const [entry] = outbox(db);
    expect(entry?.operation).toBe('DELETE');
    failOnce(db, entry!);

    insertClient(db, clientLea);

    expectReset(db, entry!, 'UPSERT');
    expect(loadClients(db)).toEqual([clientLea]);
  });

  it('a failure recorded against the current revision is still settled only at that revision', () => {
    const db = openBoundDatabase();
    updateClient(db, { ...clientLea, firstName: 'A' });
    const [entry] = outbox(db);
    failOnce(db, entry!);
    updateClient(db, { ...clientLea, firstName: 'B' });

    expect(settleSyncOutboxEntry(db, entry!.id, entry!.revision)).toBe(false);
    expect(settleSyncOutboxEntry(db, entry!.id, entry!.revision + 1)).toBe(true);
    expect(countSyncOutboxRows(db)).toBe(0);
  });
});

describe('sync outbox — children mark the parent aggregate', () => {
  it('a phase-only Service edit marks the SERVICE', () => {
    const db = openBoundDatabase();

    updateService(db, {
      ...serviceColor,
      businessId: REMOTE_BUSINESS_ID,
      phases: serviceColor.phases.map((phase) =>
        phase.id === 'color-processing' ? { ...phase, durationMinutes: 40 } : phase,
      ),
    });
    setServiceActive(db, serviceColor.id, false);

    expect(summary(outbox(db))).toEqual([['SERVICE', 'service-color', 'UPSERT', 2]]);
  });

  it('timing, reorder, item removal, checkout and payment correction all mark the APPOINTMENT', () => {
    const db = openBoundDatabase();

    updateAppointmentItemPhaseDurations(db, appointmentLea.id, 'appointment-lea-item-0', [
      { phaseId: 'color-processing', durationMinutes: 40 },
    ]);
    reorderAppointmentItems(db, appointmentLea.id, ['appointment-lea-item-1', 'appointment-lea-item-0']);
    removeAppointmentItem(db, appointmentLea.id, 'appointment-lea-item-1');
    checkoutAppointment(db, appointmentLea.id, {
      paidAt: new Date(2026, 8, 11, 11),
      cardAmountCents: 9500,
      cashAmountCents: 0,
    });
    updateAppointmentPayment(db, appointmentLea.id, { cardAmountCents: 5000, cashAmountCents: 4500 });

    expect(summary(outbox(db))).toEqual([['APPOINTMENT', 'appointment-lea', 'UPSERT', 5]]);
    expect(countRows(db, 'appointment_items')).toBe(1);
  });

  it('Sale completion marks the SALE and every decremented PRODUCT', () => {
    const db = openBoundDatabase();
    const sale: Sale = {
      ...walkInSale,
      items: [
        ...walkInSale.items,
        { id: 'sale-walk-in-item-1', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
      ],
    };

    completeSale(db, sale, [
      { productId: productMask.id, quantity: 2 },
      { productId: productSerum.id, quantity: 1 },
    ]);

    expect(summary(outbox(db))).toEqual([
      ['PRODUCT', 'product-mask', 'UPSERT', 1],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
      ['SALE', 'sale-walk-in', 'UPSERT', 1],
    ]);
  });

  it('removing a sold Product marks the restored PRODUCT, UPSERTs the trimmed Sale and DELETEs the emptied one', () => {
    const db = openBoundDatabase();
    const mixed: Sale = {
      id: 'sale-mixed',
      businessId: REMOTE_BUSINESS_ID,
      clientId: clientLea.id,
      appointmentId: appointmentLea.id,
      completedAt: new Date(2026, 8, 11, 10),
      items: [
        { id: 'sale-mixed-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
        { id: 'sale-mixed-item-1', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
      ],
    };
    const maskOnly: Sale = {
      ...mixed,
      id: 'sale-mask-only',
      items: [
        { id: 'sale-mask-only-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 },
      ],
    };
    completeSale(db, mixed, [
      { productId: productMask.id, quantity: 2 },
      { productId: productSerum.id, quantity: 1 },
    ]);
    completeSale(db, maskOnly, [{ productId: productMask.id, quantity: 1 }]);
    expect(summary(outbox(db))).toEqual([
      ['PRODUCT', 'product-mask', 'UPSERT', 2],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
      ['SALE', 'sale-mixed', 'UPSERT', 1],
      ['SALE', 'sale-mask-only', 'UPSERT', 1],
    ]);

    deleteAppointmentProduct(db, appointmentLea.id, {
      productId: productMask.id,
      productName: 'Masque réparateur',
      unitPrice: 50,
    });

    expect(summary(outbox(db))).toEqual([
      ['PRODUCT', 'product-mask', 'UPSERT', 3],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
      ['SALE', 'sale-mixed', 'UPSERT', 2],
      ['SALE', 'sale-mask-only', 'DELETE', 2],
    ]);
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
    expect(countRows(db, 'sales')).toBe(1);
  });
});

describe('sync outbox — DELETE semantics', () => {
  it('a DELETE entry survives the local Client row and holds only the identity', () => {
    const db = openBoundDatabase(() => createTestSeed({ appointments: [] }));

    deleteClientPermanently(db, clientLea.id);

    expect(countRows(db, 'clients')).toBe(0);
    expect(summary(outbox(db))).toEqual([['CLIENT', 'client-lea', 'DELETE', 1]]);
    const columns = db
      .getAllSync<{ name: string }>('PRAGMA table_info(sync_outbox)')
      .map((column) => column.name);
    expect(columns).toEqual([
      'id',
      'business_id',
      'aggregate_type',
      'aggregate_id',
      'operation',
      'revision',
      'created_at',
      'updated_at',
      'attempt_count',
      'last_error',
      'next_attempt_at',
    ]);
  });

  it('Service, Product and Appointment deletions leave DELETE entries after their rows are gone', () => {
    const db = openBoundDatabase();

    deleteService(db, serviceColor.id);
    deleteProduct(db, productSerum.id);
    deleteAppointment(db, appointmentLea.id);

    expect(countRows(db, 'services')).toBe(1);
    expect(countRows(db, 'service_phases')).toBe(1);
    expect(countRows(db, 'products')).toBe(1);
    expect(countRows(db, 'appointments')).toBe(0);
    expect(countRows(db, 'appointment_phases')).toBe(0);
    expect(summary(outbox(db))).toEqual([
      ['SERVICE', 'service-color', 'DELETE', 1],
      ['PRODUCT', 'product-serum', 'DELETE', 1],
      ['APPOINTMENT', 'appointment-lea', 'DELETE', 1],
    ]);
  });

  it('DELETE overrides a pending UPSERT in the same entry', () => {
    const db = openBoundDatabase(() => createTestSeed({ clients: [], appointments: [] }));
    insertClient(db, clientLea);
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    const [pending] = outbox(db);
    expect(pending).toMatchObject({ operation: 'UPSERT', revision: 2 });

    deleteClientPermanently(db, clientLea.id);

    const entries = outbox(db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: pending!.id,
      aggregateType: 'CLIENT',
      aggregateId: 'client-lea',
      operation: 'DELETE',
      revision: 3,
      createdAt: pending!.createdAt,
    });
  });

  it('recreating a deleted aggregate with the same id turns the entry back into UPSERT', () => {
    const db = openBoundDatabase(() => createTestSeed({ appointments: [] }));
    deleteClientPermanently(db, clientLea.id);
    const [deleted] = outbox(db);
    expect(deleted?.operation).toBe('DELETE');

    insertClient(db, { ...clientLea, firstName: 'Léa (recréée)' });

    const entries = outbox(db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: deleted!.id, operation: 'UPSERT', revision: 2 });
    expect(loadClients(db)).toEqual([{ ...clientLea, firstName: 'Léa (recréée)' }]);
  });

  it('a refused deletion writes no entry', () => {
    const db = openBoundDatabase();

    expect(() => deleteClientPermanently(db, clientLea.id)).toThrow(ClientDeleteConflictError);
    expect(() => deleteAppointment(db, 'appointment-unknown')).not.toThrow();

    expect(countSyncOutboxRows(db)).toBe(0);
    expect(countRows(db, 'clients')).toBe(1);
  });
});

describe('sync outbox — atomicity', () => {
  it('a failing outbox write rolls the business mutation back', () => {
    const inner = openBoundDatabase();
    const failing: SourisDatabase = {
      ...inner,
      runSync: (sql, params) => {
        if (sql.startsWith('INSERT INTO sync_outbox')) throw new Error('disk I/O error');
        return inner.runSync(sql, params);
      },
    };

    expect(() => updateClient(failing, { ...clientLea, firstName: 'Perdue' })).toThrow('disk I/O error');
    expect(() => updateService(failing, { ...serviceCut, businessId: REMOTE_BUSINESS_ID, price: 1 })).toThrow('disk I/O error');
    expect(() => deleteProduct(failing, productSerum.id)).toThrow('disk I/O error');
    expect(() => completeSale(failing, walkInSale, [{ productId: productMask.id, quantity: 2 }])).toThrow('disk I/O error');

    expect(inner.isInTransactionSync()).toBe(false);
    expect(countSyncOutboxRows(inner)).toBe(0);
    const snapshot = loadSnapshot(inner);
    expect(snapshot.clients[0]?.firstName).toBe('Léa');
    expect(snapshot.services.find((service) => service.id === serviceCut.id)?.price).toBe(42);
    expect(snapshot.products.map((product) => [product.id, product.stockQuantity])).toEqual([
      ['product-mask', 5],
      ['product-serum', 1],
    ]);
    expect(snapshot.sales).toEqual([]);
  });

  it('a failing business write leaves no outbox entry', () => {
    const inner = openBoundDatabase();
    const failing: SourisDatabase = {
      ...inner,
      runSync: (sql, params) => {
        if (sql.startsWith('INSERT INTO sale_items')) throw new Error('disk I/O error');
        return inner.runSync(sql, params);
      },
    };

    expect(() => completeSale(failing, walkInSale, [{ productId: productMask.id, quantity: 2 }])).toThrow('disk I/O error');
    expect(() => completeSale(inner, walkInSale, [{ productId: productSerum.id, quantity: 5 }])).toThrow(SaleStockConflictError);

    expect(countSyncOutboxRows(inner)).toBe(0);
    expect(findProduct(inner, productMask.id)?.stockQuantity).toBe(5);
    expect(countRows(inner, 'sales')).toBe(0);
  });
});

describe('sync outbox — restart, settle, development reset', () => {
  it('keeps every entry across a restart and out of the hydrated snapshot', () => {
    const db = openBoundDatabase();
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    deleteService(db, serviceColor.id);
    const before = outbox(db);

    const snapshot = bootstrapPersistence(db, createTestSeed);

    expect(outbox(db)).toEqual(before);
    expect(Object.keys(snapshot).sort()).toEqual(['appointments', 'clients', 'products', 'sales', 'services']);
    expect(readSeedVersion(db)).toBe(1);
    expect(readBusinessProfile(db)?.id).toBe(REMOTE_BUSINESS_ID);
  });

  it('settles an entry only at the revision the worker observed', () => {
    const db = openBoundDatabase();
    updateClient(db, { ...clientLea, firstName: 'A' });
    const observed = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: 'client-lea' })!;
    updateClient(db, { ...clientLea, firstName: 'B' });

    expect(settleSyncOutboxEntry(db, observed.id, observed.revision)).toBe(false);
    expect(summary(outbox(db))).toEqual([['CLIENT', 'client-lea', 'UPSERT', 2]]);

    expect(settleSyncOutboxEntry(db, observed.id, 2)).toBe(true);
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: 'client-lea' })).toBeUndefined();
  });

  it('the development reset clears the outbox and the acknowledged state but keeps the binding', () => {
    const db = openBoundDatabase();
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    db.runSync(
      "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'CLIENT', 'client-lea', 3, '2026-09-14T10:00:00.000Z')",
      [REMOTE_BUSINESS_ID],
    );

    clearPersistedDataForDevelopment(db);

    expect(countSyncOutboxRows(db)).toBe(0);
    expect(countRows(db, 'sync_state')).toBe(0);
    expect(readBusinessProfile(db)).toEqual(remoteBusinessProfile);
    expect(readSeedVersion(db)).toBeUndefined();
  });
});
