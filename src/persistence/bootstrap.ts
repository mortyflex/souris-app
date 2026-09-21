// Souris — persistence bootstrap
//
// The single startup sequence, run before any feature provider renders:
//
//   migrate schema → first-run seed (once) → load the canonical snapshot
//
// The snapshot hydrates the feature providers. Derived values (totals,
// activity, purchase history, Agenda layout) are never stored — they are
// recomputed from these source entities.

import type { Appointment, Service } from '@/domain/appointments';
import type { CalendarBlock } from '@/domain/calendar-blocks';
import type { Client } from '@/domain/clients';
import type { Product } from '@/domain/products';
import type { Sale } from '@/domain/sales';

import type { SourisDatabase } from './database';
import { migrateDatabase } from './migrations';
import { seedDatabaseIfNeeded, type FirstRunSeed } from './seed';
import { loadAppointments } from './stores/appointments';
import { loadCalendarBlocks } from './stores/calendar-blocks';
import { loadClients } from './stores/clients';
import { loadProducts } from './stores/products';
import { loadSales } from './stores/sales';
import { loadServices } from './stores/services';

export interface PersistedSnapshot {
  readonly clients: readonly Client[];
  readonly services: readonly Service[];
  readonly products: readonly Product[];
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
  /** Personal unavailability. Never part of any client or financial derivation. */
  readonly calendarBlocks: readonly CalendarBlock[];
}

export function loadSnapshot(db: SourisDatabase): PersistedSnapshot {
  return {
    clients: loadClients(db),
    services: loadServices(db),
    products: loadProducts(db),
    appointments: loadAppointments(db),
    sales: loadSales(db),
    calendarBlocks: loadCalendarBlocks(db),
  };
}

export function bootstrapPersistence(
  db: SourisDatabase,
  createSeed: () => FirstRunSeed,
): PersistedSnapshot {
  migrateDatabase(db);
  seedDatabaseIfNeeded(db, createSeed);
  return loadSnapshot(db);
}
