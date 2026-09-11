import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Client } from '@/domain/clients';
import { insertClient, updateClient as persistClient } from '@/persistence/stores/clients';
import { usePersistence } from '@/providers/PersistenceProvider';

import type { ClientSessionValue } from './types';

const ClientSessionContext = createContext<ClientSessionValue | null>(null);

/**
 * The single Client source shared by the Clientes directory, the
 * Appointment Creation picker, Agenda, Appointment Details/Editing, and the
 * Client Profile. Hydrated once from the persisted snapshot; every mutation
 * is written to SQLite first and reflected in state only after success.
 */
export function ClientSessionProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const [clients, setClients] = useState<readonly Client[]>(snapshot.clients);

  const getClientById = (clientId: string | undefined) => {
    if (!clientId) return undefined;
    return clients.find((client) => client.id === clientId);
  };

  const addClient = (client: Client) => {
    insertClient(database, client);
    setClients((current) => [...current, client]);
  };

  const updateClient = (client: Client) => {
    persistClient(database, client);
    setClients((current) =>
      current.map((currentClient) =>
        currentClient.id === client.id ? client : currentClient,
      ),
    );
  };

  return (
    <ClientSessionContext.Provider
      value={{ clients, getClientById, addClient, updateClient }}
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
