// Souris — the ONE communications gateway of the session tree
//
// Mounted at the account root (like the other gateways) so both onboarding
// (which saves the opt-in right after the Business is created) and the
// signed-in app reach the same instance. Undefined when Supabase is not
// configured: everything reminder-related then fails safe as disabled.

import { createContext, useContext, type PropsWithChildren } from 'react';

import type { CommunicationsGateway } from '../gateway';

const CommunicationsGatewayContext = createContext<CommunicationsGateway | undefined>(undefined);

interface CommunicationsGatewayProviderProps {
  readonly gateway: CommunicationsGateway | undefined;
}

export function CommunicationsGatewayProvider({
  gateway,
  children,
}: PropsWithChildren<CommunicationsGatewayProviderProps>) {
  return (
    <CommunicationsGatewayContext.Provider value={gateway}>
      {children}
    </CommunicationsGatewayContext.Provider>
  );
}

/** Undefined while Supabase is not configured. */
export function useCommunicationsGateway(): CommunicationsGateway | undefined {
  return useContext(CommunicationsGatewayContext);
}
