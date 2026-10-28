// BeautIzzy — Service category store (schema v17)
//
// Every write marks the SERVICE_CATEGORY aggregate in the sync outbox within
// the same transaction. A reorder writes — and marks — only the categories
// whose position changed.
//
// Deleting a category NEVER deletes a Service: in ONE transaction the
// category row is removed (SERVICE_CATEGORY DELETE entry) and every Service
// that referenced it becomes uncategorized (`category_id = NULL`, one SERVICE
// UPSERT entry each), so the remote receives both facts. Appointment
// snapshots are never read or written here.

import { normalizeServiceDescription, type ServiceCategory } from '@/domain/services';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';

interface ServiceCategoryRow {
  readonly id: string;
  readonly business_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
}

function toServiceCategory(row: ServiceCategoryRow): ServiceCategory {
  const description = normalizeServiceDescription(row.description);
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    ...(description !== undefined && { description }),
    position: row.position,
  };
}

/** Every category, in the professional's order (position, then id). */
export function loadServiceCategories(db: SourisDatabase): readonly ServiceCategory[] {
  return db
    .getAllSync<ServiceCategoryRow>(
      'SELECT id, business_id, name, description, position FROM service_categories ORDER BY position, id',
    )
    .map(toServiceCategory);
}

export function insertServiceCategory(db: SourisDatabase, category: ServiceCategory): void {
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO service_categories (id, business_id, name, description, position) VALUES (?, ?, ?, ?, ?)',
      [
        category.id,
        category.businessId,
        category.name,
        normalizeServiceDescription(category.description) ?? null,
        category.position,
      ],
    );
    markAggregateUpserted(db, 'SERVICE_CATEGORY', category.id);
  });
}

/** Rewrites name / description / position; id and businessId never change. */
export function updateServiceCategory(db: SourisDatabase, category: ServiceCategory): void {
  runInTransaction(db, () => {
    const result = db.runSync(
      'UPDATE service_categories SET name = ?, description = ?, position = ? WHERE id = ?',
      [category.name, normalizeServiceDescription(category.description) ?? null, category.position, category.id],
    );
    if (result.changes !== 1) throw new Error(`updateServiceCategory: category "${category.id}" not found`);
    markAggregateUpserted(db, 'SERVICE_CATEGORY', category.id);
  });
}

/** Writes the new positions of several categories atomically (a reorder). */
export function updateServiceCategoryPositions(
  db: SourisDatabase,
  changes: readonly Pick<ServiceCategory, 'id' | 'position'>[],
): void {
  runInTransaction(db, () => {
    for (const change of changes) {
      const result = db.runSync('UPDATE service_categories SET position = ? WHERE id = ?', [
        change.position,
        change.id,
      ]);
      if (result.changes !== 1) throw new Error(`updateServiceCategoryPositions: category "${change.id}" not found`);
      markAggregateUpserted(db, 'SERVICE_CATEGORY', change.id);
    }
  });
}

/** The Services that would become uncategorized if the category were deleted. */
export function countServicesInCategory(db: SourisDatabase, categoryId: string): number {
  return (
    db.getFirstSync<{ readonly count: number }>(
      'SELECT COUNT(*) AS count FROM services WHERE category_id = ?',
      [categoryId],
    )?.count ?? 0
  );
}

/**
 * Removes the category and detaches its Services in ONE transaction. Returns
 * the ids of the Services made uncategorized. Unknown ids change nothing.
 */
export function deleteServiceCategory(db: SourisDatabase, categoryId: string): readonly string[] {
  let detached: readonly string[] = [];
  runInTransaction(db, () => {
    detached = db
      .getAllSync<{ readonly id: string }>('SELECT id FROM services WHERE category_id = ? ORDER BY rowid', [categoryId])
      .map((row) => row.id);
    for (const serviceId of detached) {
      db.runSync('UPDATE services SET category_id = NULL WHERE id = ?', [serviceId]);
      markAggregateUpserted(db, 'SERVICE', serviceId);
    }
    const result = db.runSync('DELETE FROM service_categories WHERE id = ?', [categoryId]);
    if (result.changes === 1) markAggregateDeleted(db, 'SERVICE_CATEGORY', categoryId);
  });
  return detached;
}
