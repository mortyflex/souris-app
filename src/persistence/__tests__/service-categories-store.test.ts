// BeautIzzy — Service category store and the two Service fields (schema v17)

import type { Service } from '@/domain/appointments';
import type { ServiceCategory } from '@/domain/services';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import {
  countServicesInCategory,
  deleteServiceCategory,
  insertServiceCategory,
  loadServiceCategories,
  updateServiceCategory,
  updateServiceCategoryPositions,
} from '../stores/service-categories';
import { insertService, loadServices, updateService } from '../stores/services';
import { readAggregatePayload } from '../sync/aggregate-payload';
import { loadSyncOutbox } from '../sync/outbox';
import { createTestSeed, REMOTE_BUSINESS_ID, remoteBusinessProfile, serviceColor, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const gel: ServiceCategory = { id: 'cat-gel', businessId: REMOTE_BUSINESS_ID, name: 'Extensions et poses en gel', position: 0 };
const feet: ServiceCategory = {
  id: 'cat-feet',
  businessId: REMOTE_BUSINESS_ID,
  name: 'Beauté des pieds',
  description: 'Semi-permanent et soins.',
  position: 1,
};

function openBound() {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

const service = (base: Service, extra: Partial<Service> = {}): Service => ({ ...base, businessId: REMOTE_BUSINESS_ID, ...extra });

describe('Service category store', () => {
  it('persists categories in the professional’s order, description optional', () => {
    const db = openBound();
    insertServiceCategory(db, feet);
    insertServiceCategory(db, gel);
    expect(loadServiceCategories(db)).toEqual([gel, feet]);
    expect(loadSnapshot(db).serviceCategories).toEqual([gel, feet]);
  });

  it('marks one SERVICE_CATEGORY outbox entry per write; a reorder marks only the moved categories', () => {
    const db = openBound();
    insertServiceCategory(db, gel);
    insertServiceCategory(db, feet);
    insertServiceCategory(db, { ...gel, id: 'cat-art', name: 'Nail art', position: 2 });
    db.runSync('DELETE FROM sync_outbox');

    updateServiceCategory(db, { ...gel, name: 'Poses en gel', description: '  ' });
    expect(loadServiceCategories(db)[0]).toEqual({ ...gel, name: 'Poses en gel' });
    updateServiceCategoryPositions(db, [
      { id: 'cat-art', position: 1 },
      { id: 'cat-feet', position: 2 },
    ]);
    expect(loadServiceCategories(db).map((category) => category.id)).toEqual(['cat-gel', 'cat-art', 'cat-feet']);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation])).toEqual([
      ['SERVICE_CATEGORY', 'cat-gel', 'UPSERT'],
      ['SERVICE_CATEGORY', 'cat-art', 'UPSERT'],
      ['SERVICE_CATEGORY', 'cat-feet', 'UPSERT'],
    ]);
    expect(() => updateServiceCategory(db, { ...gel, id: 'nope' })).toThrow(/not found/);
  });

  it('round-trips a Service category and description; blank descriptions are stored as NULL', () => {
    const db = openBound();
    insertServiceCategory(db, gel);
    const described = service(serviceCut, { categoryId: 'cat-gel', description: '  Inclus : limage.\nExclu : nail art.  ' });
    insertService(db, described);
    expect(loadServices(db)[0]).toEqual({ ...described, description: 'Inclus : limage.\nExclu : nail art.' });

    updateService(db, { ...described, description: '   ' });
    expect(db.getFirstSync<{ description: string | null }>('SELECT description FROM services')).toEqual({ description: null });
    expect(loadServices(db)[0]).not.toHaveProperty('description');

    const { categoryId: _categoryId, ...uncategorized } = described;
    updateService(db, uncategorized);
    expect(loadServices(db)[0]).not.toHaveProperty('categoryId');
  });

  it('deleting a category detaches its Services in the same transaction and deletes none', () => {
    const db = openBound();
    insertServiceCategory(db, gel);
    insertServiceCategory(db, feet);
    insertService(db, service(serviceCut, { categoryId: 'cat-gel' }));
    insertService(db, service(serviceColor, { categoryId: 'cat-feet' }));
    db.runSync('DELETE FROM sync_outbox');
    expect(countServicesInCategory(db, 'cat-gel')).toBe(1);

    expect(deleteServiceCategory(db, 'cat-gel')).toEqual([serviceCut.id]);

    expect(loadServiceCategories(db)).toEqual([feet]);
    expect(loadServices(db).map((entry) => [entry.id, entry.categoryId])).toEqual([
      [serviceCut.id, undefined],
      [serviceColor.id, 'cat-feet'],
    ]);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation])).toEqual([
      ['SERVICE', serviceCut.id, 'UPSERT'],
      ['SERVICE_CATEGORY', 'cat-gel', 'DELETE'],
    ]);
    expect(deleteServiceCategory(db, 'unknown')).toEqual([]);
  });

  it('pushes the CURRENT category and Service fields; a row of another Business is refused', () => {
    const db = openBound();
    insertServiceCategory(db, feet);
    insertService(db, service(serviceCut, { categoryId: 'cat-feet', description: 'Pieds.' }));
    expect(readAggregatePayload(db, REMOTE_BUSINESS_ID, { aggregateType: 'SERVICE_CATEGORY', aggregateId: 'cat-feet' })).toEqual({
      name: 'Beauté des pieds',
      description: 'Semi-permanent et soins.',
      position: 1,
    });
    expect(readAggregatePayload(db, REMOTE_BUSINESS_ID, { aggregateType: 'SERVICE', aggregateId: serviceCut.id })).toMatchObject({
      category_id: 'cat-feet',
      description: 'Pieds.',
    });
    insertServiceCategory(db, { ...gel, id: 'foreign', businessId: 'another-business' });
    expect(() =>
      readAggregatePayload(db, REMOTE_BUSINESS_ID, { aggregateType: 'SERVICE_CATEGORY', aggregateId: 'foreign' }),
    ).toThrow(/not scoped/);
  });

  it('refuses a blank category name at the database level', () => {
    const db = openBound();
    expect(() => insertServiceCategory(db, { ...gel, name: '   ' })).toThrow();
    expect(loadServiceCategories(db)).toEqual([]);
  });
});
