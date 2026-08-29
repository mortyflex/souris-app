// Souris — Initial clients source
//
// The ONE coherent Client source for the current in-memory session:
// strictly-mapped legacy address book + the development clients referenced
// by the Agenda appointment fixtures. No other client-name mapping exists
// in the application.

import type { Client } from '@/domain/clients';

import { mapLegacyClients } from '../adapters/legacy-clients-adapter';
import { clients_list } from './legacy-clients';
import { developmentClients } from './development-clients';

/** Builds the complete initial in-memory Client collection. */
export function createInitialClients(): readonly Client[] {
  return [...mapLegacyClients(clients_list), ...developmentClients];
}
