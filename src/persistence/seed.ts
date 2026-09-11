// Souris — first-run seed
//
// The legacy adapters feed the database exactly ONCE. The `seed_version`
// metadata marker (distinct from the schema version) records that the seed
// ran; it is never inferred from row counts, so a professional who deletes
// every record is not re-seeded on the next launch.

import type { Appointment, Service } from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import type { Product } from '@/domain/products';
import type { Sale } from '@/domain/sales';

import type { SourisDatabase } from './database';
import { readMetadata, writeMetadata } from './metadata';
import { insertAppointment } from './stores/appointments';
import { insertClient } from './stores/clients';
import { insertProduct } from './stores/products';
import { completeSale } from './stores/sales';
import { insertService } from './stores/services';

export const SEED_VERSION_KEY = 'seed_version';
export const CURRENT_SEED_VERSION = 1;

export interface FirstRunSeed {
  readonly clients: readonly Client[];
  readonly services: readonly Service[];
  readonly products: readonly Product[];
  readonly appointments: readonly Appointment[];
  /** No real Sale source exists today; kept explicit so the contract is visible. */
  readonly sales: readonly Sale[];
}

export function readSeedVersion(db: SourisDatabase): number | undefined {
  const value = readMetadata(db, SEED_VERSION_KEY);
  return value === undefined ? undefined : Number(value);
}

/**
 * Seeds an initialized-but-never-seeded database in one transaction and
 * marks it. Returns whether the seed ran. Seeded databases are left alone.
 */
export function seedDatabaseIfNeeded(
  db: SourisDatabase,
  createSeed: () => FirstRunSeed,
): boolean {
  if (readSeedVersion(db) !== undefined) return false;

  const seed = createSeed();
  db.withTransactionSync(() => {
    for (const client of seed.clients) insertClient(db, client);
    for (const service of seed.services) insertService(db, service);
    for (const product of seed.products) insertProduct(db, product);
    for (const appointment of seed.appointments) insertAppointment(db, appointment);
    for (const sale of seed.sales) completeSale(db, sale, []);
    writeMetadata(db, SEED_VERSION_KEY, String(CURRENT_SEED_VERSION));
  });
  return true;
}
