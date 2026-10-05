import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import {
  archiveClient as archiveClientRecord,
  canDeleteClientPermanently,
  isClientArchived,
  restoreClient as restoreClientRecord,
  type Client,
} from '@/domain/clients';
import {
  archiveClient as persistArchive,
  countClientReferences,
  deleteClientPermanently as persistDelete,
  insertClient,
  insertClients,
  restoreClient as persistRestore,
  setClientPhotoPath as persistPhotoPath,
  updateClient as persistClient,
} from '@/persistence/stores/clients';
import { usePersistence, useSnapshotRefresh } from '@/providers/PersistenceProvider';

import type { ClientSessionValue } from './types';

const ClientSessionContext = createContext<ClientSessionValue | null>(null);

/**
 * The single Client source shared by the Clientes directory, the
 * Appointment Creation picker, Agenda, Appointment Details/Editing, and the
 * Client Profile. Hydrated once from the persisted snapshot; every mutation
 * is written to SQLite first and reflected in state only after success.
 *
 * Archived Clients stay in `clients` (history keeps resolving them) and are
 * simply excluded from `activeClients`, the only selectable collection.
 */
export function ClientSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const [clients, setClients] = useState<readonly Client[]>(snapshot.clients);
  // Remote changes applied by the sync runner, adopted in place.
  useSnapshotRefresh((fresh) => setClients(fresh.clients));

  const activeClients = useMemo(
    () => clients.filter((client) => !isClientArchived(client)),
    [clients],
  );
  const archivedClients = useMemo(
    () => clients.filter((client) => isClientArchived(client)),
    [clients],
  );

  const getClientById = (clientId: string | undefined) => {
    if (!clientId) return undefined;
    return clients.find((client) => client.id === clientId);
  };

  const replaceClient = (clientId: string, next: (current: Client) => Client) => {
    setClients((current) =>
      current.map((currentClient) =>
        currentClient.id === clientId ? next(currentClient) : currentClient,
      ),
    );
  };

  const addClient = (client: Client) => {
    insertClient(database, client);
    setClients((current) => [...current, client]);
  };

  const addClients = (batch: readonly Client[]) => {
    const inserted = insertClients(database, batch);
    if (inserted.length > 0) {
      // ONE state update per batch; an id already in the session (a retried
      // batch) is never listed twice.
      setClients((current) => {
        const known = new Set(current.map((client) => client.id));
        return [...current, ...inserted.filter((client) => !known.has(client.id))];
      });
    }
    return inserted;
  };

  const updateClient = (client: Client) => {
    persistClient(database, client);
    // Identity edits never touch the lifecycle nor the photo: the stored
    // archived_at and photo_path are left as-is, so the in-memory record
    // keeps its current values too.
    replaceClient(client.id, (current) => {
      const { archivedAt: _archivedAt, photoPath: _photoPath, ...identity } = client;
      return {
        ...identity,
        ...(current.photoPath !== undefined ? { photoPath: current.photoPath } : {}),
        ...(current.archivedAt !== undefined ? { archivedAt: current.archivedAt } : {}),
      };
    });
  };

  const setClientPhoto = (clientId: string, photoPath: string | undefined) => {
    persistPhotoPath(database, clientId, photoPath);
    replaceClient(clientId, (current) => {
      const { photoPath: _previous, ...rest } = current;
      return photoPath === undefined ? rest : { ...rest, photoPath };
    });
  };

  const archiveClient = (clientId: string) => {
    const archivedAt = new Date();
    persistArchive(database, clientId, archivedAt);
    replaceClient(clientId, (current) => archiveClientRecord(current, archivedAt));
  };

  const restoreClient = (clientId: string) => {
    persistRestore(database, clientId);
    replaceClient(clientId, restoreClientRecord);
  };

  const getClientDeletionEligibility = (clientId: string) => {
    const references = countClientReferences(database, clientId);
    return { deletable: canDeleteClientPermanently(references), references };
  };

  const deleteClientPermanently = (clientId: string) => {
    persistDelete(database, clientId);
    setClients((current) => current.filter((client) => client.id !== clientId));
  };

  return (
    <ClientSessionContext.Provider
      value={{
        clients,
        activeClients,
        archivedClients,
        getClientById,
        addClient,
        addClients,
        updateClient,
        setClientPhoto,
        archiveClient,
        restoreClient,
        getClientDeletionEligibility,
        deleteClientPermanently,
      }}
    >
      {children}
    </ClientSessionContext.Provider>
  );
}

export function useClientSession(): ClientSessionValue {
  const value = useContext(ClientSessionContext);
  if (!value) {
    throw new Error('useClientSession must be used inside ClientSessionProvider');
  }
  return value;
}
