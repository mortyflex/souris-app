// Souris — Client directory grouping
//
// The Clientes tab groups the complete Client source into:
//
//   Actives    every Client without archivedAt
//   Archivées  every archived Client, visually secondary
//
// Search applies to BOTH groups with the existing normalization (the
// professional can still find an archived Client to reactivate her); the
// grouping is preserved and empty groups are omitted. This is a
// presentation split only — Client selection for NEW Appointments/Sales
// reads `activeClients` from the session, never this grouping.

import { isClientArchived, type Client } from '@/domain/clients';

import { prepareClientDirectory } from './sort-clients';

export type ClientDirectoryGroup = 'ACTIVE' | 'ARCHIVED';

export interface ClientDirectorySection {
  readonly key: ClientDirectoryGroup;
  readonly title: 'Actives' | 'Archivées';
  readonly data: readonly Client[];
}

export function buildClientDirectorySections(
  clients: readonly Client[],
  query: string,
): readonly ClientDirectorySection[] {
  const visible = prepareClientDirectory(clients, query);
  const actives = visible.filter((client) => !isClientArchived(client));
  const archived = visible.filter((client) => isClientArchived(client));

  const sections: ClientDirectorySection[] = [];
  if (actives.length > 0) sections.push({ key: 'ACTIVE', title: 'Actives', data: actives });
  if (archived.length > 0) sections.push({ key: 'ARCHIVED', title: 'Archivées', data: archived });
  return sections;
}
