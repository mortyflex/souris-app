// Souris — Client lifecycle rules
//
// Archive is the normal removal mechanism: a reversible state change that
// keeps every historical relationship intact. Active state is derived —
// there is no status enum and no boolean flag:
//
//   active   = archivedAt == null
//   archived = archivedAt != null
//
// Permanent deletion is a different, destructive operation allowed ONLY
// when nothing references the Client. That rule is expressed here and
// re-verified transactionally by persistence before any DELETE.

import type { Client } from './types';

export function isClientArchived(client: Pick<Client, 'archivedAt'>): boolean {
  return client.archivedAt !== undefined;
}

export function isClientActive(client: Pick<Client, 'archivedAt'>): boolean {
  return !isClientArchived(client);
}

/** Returns an archived copy; an already archived Client is returned unchanged. */
export function archiveClient(client: Client, archivedAt: Date): Client {
  if (isClientArchived(client)) return client;
  if (Number.isNaN(archivedAt.getTime())) {
    throw new RangeError('archiveClient: invalid archive instant');
  }
  return { ...client, archivedAt };
}

/** Returns an active copy (archivedAt removed); an active Client is returned unchanged. */
export function restoreClient(client: Client): Client {
  if (isClientActive(client)) return client;
  const { archivedAt: _archivedAt, ...restored } = client;
  return restored;
}

/** Every record type that may reference a Client through `clientId`. */
export interface ClientReferences {
  readonly appointmentCount: number;
  readonly saleCount: number;
}

/**
 * Permanent deletion is allowed only when NO Appointment and NO Sale
 * references the Client — whatever their status. Historical integrity
 * always wins: there is no cascade and no anonymization.
 */
export function canDeleteClientPermanently(references: ClientReferences): boolean {
  return references.appointmentCount === 0 && references.saleCount === 0;
}
