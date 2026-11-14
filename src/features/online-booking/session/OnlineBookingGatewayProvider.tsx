// BeautIzzy — the ONE online booking gateway of the session tree
//
// Mounted at the account root beside the other gateways. Undefined when
// Supabase is not configured (and in the Playground demo): the settings
// screen then reads as unavailable.

import { createContext, useContext, type PropsWithChildren } from 'react';

import type { OnlineBookingGateway } from '../gateway';

const OnlineBookingGatewayContext = createContext<OnlineBookingGateway | undefined>(undefined);

interface OnlineBookingGatewayProviderProps {
  readonly gateway: OnlineBookingGateway | undefined;
}

export function OnlineBookingGatewayProvider({
  gateway,
  children,
}: PropsWithChildren<OnlineBookingGatewayProviderProps>) {
  return (
    <OnlineBookingGatewayContext.Provider value={gateway}>
      {children}
    </OnlineBookingGatewayContext.Provider>
  );
}

/** Undefined while Supabase is not configured. */
export function useOnlineBookingGateway(): OnlineBookingGateway | undefined {
  return useContext(OnlineBookingGatewayContext);
}
