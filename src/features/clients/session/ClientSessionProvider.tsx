import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Client } from '@/domain/clients';

import { createInitialClients } from '../data/initial-clients';
import type { ClientSessionValue } from './types';

const ClientSessionContext = createContext<ClientSessionValue | null>(null);

/**
 * The single in-memory Client source shared by the Clientes directory, the
 * Appointment Creation picker, Agenda, Appointment Details/Editing, and the
 * Client Profile. Session only — no persistence yet.
 */
export function ClientSessionProvider({ children }: PropsWithChildren) {
  const [clients, setClients] = useState<readonly Client[]>(() => createInitialClients());

  const getClientById = (clientId: string | undefined) => {
    if (!clientId) return undefined;
    return clients.find((client) => client.id === clientId);
  };

  const addClient = (client: Client) => {
    setClients((current) => [...current, client]);
  };

  const updateClient = (client: Client) => {
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
