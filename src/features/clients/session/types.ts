import type { Client, ClientReferences } from '@/domain/clients';

/** Result of the database-backed pre-check run when the professional taps permanent deletion. */
export interface ClientDeletionEligibility {
  readonly deletable: boolean;
  readonly references: ClientReferences;
}

/**
 * The Client session surface: directory/picker reading, id lookup, Client
 * creation, identity editing, and the lifecycle (archive → restore →
 * permanent delete when nothing references the Client).
 *
 * `clients` is the complete source, archived included, so every historical
 * `clientId` keeps resolving. `activeClients` is the ONLY collection new
 * operational flows (Appointment / Sale Client pickers) may select from.
 */
export interface ClientSessionValue {
  readonly clients: readonly Client[];
  /** Clients without `archivedAt` — the selectable directory for new actions. */
  readonly activeClients: readonly Client[];
  readonly archivedClients: readonly Client[];
  readonly getClientById: (clientId: string | undefined) => Client | undefined;
  readonly addClient: (client: Client) => void;
  /** Replaces the identity of the Client with the same id; the id and lifecycle never change. */
  readonly updateClient: (client: Client) => void;
  readonly archiveClient: (clientId: string) => void;
  readonly restoreClient: (clientId: string) => void;
  /** Reads the stored references so the UI never offers a confirmation that cannot succeed. */
  readonly getClientDeletionEligibility: (clientId: string) => ClientDeletionEligibility;
  /** Throws `ClientDeleteConflictError` when history references the Client; nothing changes then. */
  readonly deleteClientPermanently: (clientId: string) => void;
}
