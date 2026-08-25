// Souris — Normalized clients instance
//
// Loads the real legacy client data and normalizes it into a list of
// canonical Souris client records for use in the Appointment Creation flow.

import { clients_list } from '../data/legacy-clients';
import { normalizeLegacyClients, type NormalizedClient } from '../adapters/legacy-clients-adapter';

/**
 * The normalized list of all legacy clients.
 * Built once at module load time from legacy data.
 */
export const normalizedClients: readonly NormalizedClient[] = normalizeLegacyClients(clients_list);
