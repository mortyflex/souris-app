// Souris — Business session boundary
//
// Answers: which Souris Business does the signed-in user own, is onboarding
// completed, and is the local database bound to it? It follows the Auth
// state (idle while nobody is signed in) and runs the pure resolution in
// resolve-business-session.ts. Creation is idempotent: a remote Business
// that already exists is looked up and bound instead of duplicated.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { BusinessProfile, BusinessSetupInput } from '@/domain/business';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { usePersistence } from '@/providers/PersistenceProvider';

import { BusinessGatewayError, type BusinessGateway } from '../gateway';
import {
  bindRemoteBusiness,
  resolveBusinessSession,
  toBusinessSessionFailure,
  type BusinessSessionFailure,
} from './resolve-business-session';

export type BusinessSessionState =
  /** Nobody is signed in. */
  | { readonly status: 'idle' }
  | { readonly status: 'resolving' }
  | { readonly status: 'setup-required' }
  | { readonly status: 'ready'; readonly business: BusinessProfile }
  /** The device's data belongs to another account (V1 single-business limit). */
  | { readonly status: 'device-account-conflict'; readonly business: BusinessProfile }
  | { readonly status: 'error'; readonly failure: BusinessSessionFailure };

export type CreateBusinessOutcome =
  | { readonly kind: 'created'; readonly business: BusinessProfile }
  | { readonly kind: 'failed'; readonly failure: BusinessSessionFailure };

export interface BusinessSessionValue {
  readonly state: BusinessSessionState;
  readonly createBusiness: (input: BusinessSetupInput) => Promise<CreateBusinessOutcome>;
  /** Re-runs resolution after an error. */
  readonly retry: () => void;
}

const BusinessSessionContext = createContext<BusinessSessionValue | null>(null);

interface BusinessSessionProviderProps {
  readonly gateway: BusinessGateway;
}

export function BusinessSessionProvider({
  gateway,
  children,
}: PropsWithChildren<BusinessSessionProviderProps>) {
  const { database } = usePersistence();
  const { state: auth } = useAuth();
  const ownerUserId = auth.status === 'authenticated' ? auth.user.id : undefined;
  const offline = auth.status === 'authenticated' && auth.session === 'offline';

  // The stored resolution is keyed by owner: while the signed-in owner differs
  // from it (sign-in, account change, sign-out) the state is derived — idle
  // without an owner, resolving otherwise — so no effect ever sets state
  // synchronously.
  const [resolution, setResolution] = useState<{
    readonly ownerUserId: string | undefined;
    readonly state: BusinessSessionState;
  }>({ ownerUserId: undefined, state: { status: 'idle' } });
  const generation = useRef(0);

  const state: BusinessSessionState =
    ownerUserId === undefined
      ? { status: 'idle' }
      : resolution.ownerUserId === ownerUserId
        ? resolution.state
        : { status: 'resolving' };

  const setState = useCallback(
    (next: BusinessSessionState) => setResolution({ ownerUserId, state: next }),
    [ownerUserId],
  );

  const resolve = useCallback(async () => {
    if (!ownerUserId) return;
    generation.current += 1;
    const current = generation.current;
    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId, offline });
    if (current === generation.current) setState(resolved);
  }, [database, gateway, ownerUserId, offline, setState]);

  useEffect(() => {
    if (!ownerUserId) {
      generation.current += 1;
      return;
    }
    void resolve();
    return () => {
      generation.current += 1;
    };
  }, [ownerUserId, resolve]);

  const createBusiness = useCallback(
    async (input: BusinessSetupInput): Promise<CreateBusinessOutcome> => {
      if (!ownerUserId) return { kind: 'failed', failure: { code: 'UNKNOWN' } };
      generation.current += 1;
      const current = generation.current;

      let remote: BusinessProfile;
      try {
        remote = await gateway.createBusiness(ownerUserId, input);
      } catch (error) {
        if (error instanceof BusinessGatewayError && error.code === 'ALREADY_EXISTS') {
          // A previous attempt created it (e.g. local binding failed): reuse it.
          const resolved = await resolveBusinessSession({ database, gateway, ownerUserId, offline });
          if (current !== generation.current) return { kind: 'failed', failure: { code: 'UNKNOWN' } };
          setState(resolved);
          return resolved.status === 'ready'
            ? { kind: 'created', business: resolved.business }
            : { kind: 'failed', failure: resolved.status === 'error' ? resolved.failure : { code: 'UNKNOWN' } };
        }
        // Remote creation failed: nothing was bound; the form keeps its draft.
        return { kind: 'failed', failure: toBusinessSessionFailure(error) };
      }

      const bound = bindRemoteBusiness(database, ownerUserId, remote);
      if (current !== generation.current) return { kind: 'failed', failure: { code: 'UNKNOWN' } };
      setState(bound);
      return bound.status === 'ready'
        ? { kind: 'created', business: bound.business }
        : { kind: 'failed', failure: bound.status === 'error' ? bound.failure : { code: 'UNKNOWN' } };
    },
    [database, gateway, offline, ownerUserId, setState],
  );

  const retry = useCallback(() => {
    setState({ status: 'resolving' });
    void resolve();
  }, [resolve, setState]);

  return (
    <BusinessSessionContext.Provider value={{ state, createBusiness, retry }}>
      {children}
    </BusinessSessionContext.Provider>
  );
}

export function useBusinessSession(): BusinessSessionValue {
  const value = useContext(BusinessSessionContext);
  if (!value) {
    throw new Error('useBusinessSession must be used inside BusinessSessionProvider');
  }
  return value;
}
