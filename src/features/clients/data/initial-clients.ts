// Souris — Initial clients source
//
// The ONE approved production Client import: the strictly-mapped legacy
// address book, nothing else. Development clients (referenced by the Agenda
// fixtures) live in development-clients.ts and are added only by the
// development seed, never by the production first-run seed.

import type { Client } from '@/domain/clients';

import { mapLegacyClients } from '../adapters/legacy-clients-adapter';
import { clients_list } from './legacy-clients';

/** Builds the canonical legacy Client import used by the production first-run seed. */
export function createInitialClients(): readonly Client[] {
  return mapLegacyClients(clients_list);
}
