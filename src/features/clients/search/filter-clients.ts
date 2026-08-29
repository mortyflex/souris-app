// Souris — Client search helper
//
// Filters canonical Clients by first name, last name, full name, and phone.
// Matching is case-insensitive, accent-insensitive, and tolerant of ordinary
// phone formatting differences. Substring matching only — no fuzzy matching.

import { getClientDisplayName, type Client } from '@/domain/clients';

/**
 * Normalizes a string for text comparison:
 * trim → lowercase → strip accents (NFD + combining marks).
 */
export function normalizeClientSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Keeps only digits so "06 12 34 56 78" and "0612345678" compare equal. */
function normalizePhoneSearch(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Filters clients for `query`.
 *
 * - names match against the normalized firstName, lastName, and full name;
 * - phone matches when every digit of the query appears, in order, inside
 *   the digit-normalized phone;
 * - an empty or whitespace query returns the input list unchanged.
 */
export function filterClients(
  clients: readonly Client[],
  query: string,
): readonly Client[] {
  const textQuery = normalizeClientSearch(query);
  const phoneQuery = normalizePhoneSearch(query);

  if (textQuery.length === 0 && phoneQuery.length === 0) {
    return clients;
  }

  return clients.filter((client) => {
    const nameMatches =
      textQuery.length > 0 &&
      (normalizeClientSearch(client.firstName).includes(textQuery) ||
        normalizeClientSearch(client.lastName ?? '').includes(textQuery) ||
        normalizeClientSearch(getClientDisplayName(client)).includes(textQuery));

    const phoneMatches =
      phoneQuery.length > 0 &&
      normalizePhoneSearch(client.phone ?? '').includes(phoneQuery);

    return nameMatches || phoneMatches;
  });
}
