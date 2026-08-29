import type { Client } from '@/domain/clients';

/**
 * The smallest in-memory Client session surface currently needed:
 * directory/picker reading, id lookup, Client creation, and identity
 * editing. No delete API yet — deletion is a future Client-specific
 * increment with relationship/history consequences.
 */
export interface ClientSessionValue {
  readonly clients: readonly Client[];
  readonly getClientById: (clientId: string | undefined) => Client | undefined;
  readonly addClient: (client: Client) => void;
  /** Replaces the Client with the same id; the id never changes. */
  readonly updateClient: (client: Client) => void;
}
