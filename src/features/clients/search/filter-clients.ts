// Souris — Client search helper
//
// Filters normalized clients based on a query string.
// Searches across firstName, lastName, full name, and phone.
// Case-insensitive and accent-insensitive.

import type { NormalizedClient } from '../adapters/legacy-clients-adapter';

/**
 * Normalizes a string for comparison:
 * - trim whitespace
 * - convert to lowercase
 * - remove accents (NFD normalization + strip combining marks)
 */
function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filters clients based on a query string.
 *
 * Matches against:
 * - firstName
 * - lastName
 * - full name (firstName + lastName)
 * - phone
 *
 * Matching is:
 * - case-insensitive
 * - accent-insensitive (é matches e, etc.)
 * - substring match (query can appear anywhere in the field)
 *
 * Empty query returns all clients.
 */
export function filterClients(
  clients: readonly NormalizedClient[],
  query: string,
): readonly NormalizedClient[] {
  const normalizedQuery = normalizeForSearch(query);

  if (normalizedQuery.length === 0) {
    return clients;
  }

  return clients.filter((client) => {
    const firstName = normalizeForSearch(client.firstName);
    const lastName = normalizeForSearch(client.lastName ?? '');
    const fullName = normalizeForSearch(
      `${client.firstName} ${client.lastName ?? ''}`.trim(),
    );
    const phone = normalizeForSearch(client.phone ?? '');

    return (
      firstName.includes(normalizedQuery) ||
      lastName.includes(normalizedQuery) ||
      fullName.includes(normalizedQuery) ||
      phone.includes(normalizedQuery)
    );
  });
}
