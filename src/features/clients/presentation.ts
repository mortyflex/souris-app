// Souris — Client presentation at application level
//
// Resolution of appointment clientIds against the coherent Client source.
// The fallback reveals data inconsistency without inventing an identity.

import { getClientDisplayName, type Client } from '@/domain/clients';

export const UNKNOWN_CLIENT_LABEL = 'Cliente inconnue';
/** Subtle lifecycle indicator shown on archived Clients (directory row, profile). */
export const ARCHIVED_CLIENT_LABEL = 'Archivée';

export function getResolvedClientDisplayName(client: Client | undefined): string {
  return client ? getClientDisplayName(client) : UNKNOWN_CLIENT_LABEL;
}
