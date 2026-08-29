// Souris — Client directory ordering
//
// Deterministic human-friendly alphabetical order:
//   firstName → lastName → id
//
// French-aware Intl.Collator with base sensitivity so accents and case do
// not disturb ordering ("Élodie" sorts near "Elodie"). The input array is
// never mutated and input/seed order never defines directory order.

import type { Client } from '@/domain/clients';

import { filterClients } from '../search/filter-clients';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

export function sortClients(clients: readonly Client[]): readonly Client[] {
  return [...clients].sort((a, b) => {
    const byFirstName = collator.compare(a.firstName, b.firstName);
    if (byFirstName !== 0) return byFirstName;

    const byLastName = collator.compare(a.lastName ?? '', b.lastName ?? '');
    if (byLastName !== 0) return byLastName;

    return a.id.localeCompare(b.id);
  });
}

/**
 * The complete directory pipeline: deterministic alphabetical sort, then
 * search filtering (filter preserves order). Empty query returns the full
 * sorted directory.
 */
export function prepareClientDirectory(
  clients: readonly Client[],
  query: string,
): readonly Client[] {
  return filterClients(sortClients(clients), query);
}
