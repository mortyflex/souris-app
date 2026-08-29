// Souris — Client presentation helpers
//
// Small pure helpers shared by every surface that displays a Client.
// No honorifics, titles, or person abstractions: identity stays first name
// + optional last name.

import type { Client } from './types';

/** `firstName + lastName` when present, trimmed. */
export function getClientDisplayName(
  client: Pick<Client, 'firstName' | 'lastName'>,
): string {
  return `${client.firstName.trim()} ${client.lastName?.trim() ?? ''}`.trim();
}

/** Single initial used by restrained client avatar treatments. */
export function getClientInitial(client: Pick<Client, 'firstName'>): string {
  const trimmed = client.firstName.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '';
}
