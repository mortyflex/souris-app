// Souris — the Business the protected app runs for
//
// Provided by the protected route group once the session is `ready`, so
// every operational screen stamps new records with the real Business id
// without knowing anything about Auth or resolution states. Tests provide a
// fixture Business through TestPersistenceProvider.

import { createContext, useContext, type PropsWithChildren } from 'react';

import type { BusinessProfile } from '@/domain/business';

const CurrentBusinessContext = createContext<BusinessProfile | null>(null);

interface CurrentBusinessProviderProps {
  readonly business: BusinessProfile;
}

export function CurrentBusinessProvider({
  business,
  children,
}: PropsWithChildren<CurrentBusinessProviderProps>) {
  return (
    <CurrentBusinessContext.Provider value={business}>{children}</CurrentBusinessContext.Provider>
  );
}

export function useCurrentBusiness(): BusinessProfile {
  const value = useContext(CurrentBusinessContext);
  if (!value) {
    throw new Error('useCurrentBusiness must be used inside CurrentBusinessProvider');
  }
  return value;
}
