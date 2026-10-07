// BeautIzzy — Initial clients source
//
// The development address book: a SYNTHETIC legacy-shaped dataset
// (synthetic-legacy-clients.ts — no real person) strictly mapped through the
// legacy import boundary, nothing else. Reached only by the development seed
// and tests; the production first-run seed is empty. Development clients
// referenced by the Agenda fixtures live in development-clients.ts.
//
// No real client address book is ever tracked in this repository.

import type { Client } from '@/domain/clients';

import { mapLegacyClients } from '../adapters/legacy-clients-adapter';
import { syntheticLegacyClients } from './synthetic-legacy-clients';

/** Builds the synthetic address book used by the development seed and tests. */
export function createInitialClients(): readonly Client[] {
  return mapLegacyClients(syntheticLegacyClients);
}
