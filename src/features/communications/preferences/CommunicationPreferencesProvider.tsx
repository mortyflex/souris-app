// BeautIzzy — the global reminder preference, as the app knows it
//
// The SERVER preference is authoritative; this provider holds the latest
// known copy for the signed-in Business. On mount it asks the server once,
// refreshes the Business-scoped local cache on success, and falls back to
// that cache when the server cannot answer. With neither, the value fails
// safe: reminder automation reads as DISABLED in every screen, and the
// Settings screen says why.
//
// Updating goes to the server FIRST (the server reconciles the queue), then
// mirrors the accepted state here and in the cache. Nothing is ever queued
// from the device.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { usePersistence } from '@/providers/PersistenceProvider';

import type { CommunicationPreferences, UpdateCommunicationPreferencesResult } from '../gateway';
import { useCommunicationsGateway } from '../session/CommunicationsGatewayProvider';
import {
  readCachedCommunicationPreferences,
  writeCachedCommunicationPreferences,
} from './preferences-cache';

export type CommunicationPreferencesState =
  /** First server answer (or cache fallback) still pending. */
  | { readonly status: 'loading'; readonly preferences: CommunicationPreferences | undefined }
  /** The server answered; `preferences` is the authoritative state. */
  | { readonly status: 'ready'; readonly preferences: CommunicationPreferences }
  /** Server unreachable; `preferences` is the last cached copy, or undefined. */
  | { readonly status: 'offline'; readonly preferences: CommunicationPreferences | undefined };

export interface CommunicationPreferencesValue {
  readonly state: CommunicationPreferencesState;
  /**
   * The fail-safe reading every screen uses: reminders count as enabled only
   * when the latest known preference says so.
   */
  readonly emailRemindersEnabled: boolean;
  /** Persists on the server (which reconciles), then mirrors locally. */
  readonly update: (preferences: {
    readonly emailRemindersEnabled: boolean;
    readonly replyToEmail?: string;
  }) => Promise<UpdateCommunicationPreferencesResult>;
  readonly refresh: () => void;
}

const CommunicationPreferencesContext = createContext<CommunicationPreferencesValue | null>(null);

/**
 * One load: the server answer (cache refreshed), or the offline fallback —
 * the Business-scoped cached copy, or nothing (which every reader treats as
 * disabled).
 */
async function resolvePreferencesState(
  gateway: ReturnType<typeof useCommunicationsGateway>,
  database: ReturnType<typeof usePersistence>['database'],
  businessId: string,
): Promise<CommunicationPreferencesState> {
  const cached = readCachedCommunicationPreferences(database, businessId);
  if (!gateway) {
    return { status: 'offline', preferences: cached };
  }
  try {
    const preferences = await gateway.readPreferences(businessId);
    writeCachedCommunicationPreferences(database, businessId, preferences);
    return { status: 'ready', preferences };
  } catch {
    return { status: 'offline', preferences: cached };
  }
}

export function CommunicationPreferencesProvider({ children }: PropsWithChildren) {
  const gateway = useCommunicationsGateway();
  const business = useCurrentBusiness();
  const { database } = usePersistence();
  const [state, setState] = useState<CommunicationPreferencesState>(() => ({
    status: 'loading',
    preferences: readCachedCommunicationPreferences(database, business.id),
  }));
  const generation = useRef(0);

  const load = useCallback(async () => {
    generation.current += 1;
    const current = generation.current;
    const next = await resolvePreferencesState(gateway, database, business.id);
    if (current !== generation.current) return;
    setState(next);
  }, [business.id, database, gateway]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const update = useCallback<CommunicationPreferencesValue['update']>(
    async (preferences) => {
      if (!gateway) throw new Error('communications gateway unavailable');
      const result = await gateway.updatePreferences(business.id, preferences);
      if (result.status === 'UPDATED') {
        writeCachedCommunicationPreferences(database, business.id, result.preferences);
        setState({ status: 'ready', preferences: result.preferences });
      }
      return result;
    },
    [business.id, database, gateway],
  );

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const value: CommunicationPreferencesValue = {
    state,
    emailRemindersEnabled: state.preferences?.emailRemindersEnabled ?? false,
    update,
    refresh,
  };

  return (
    <CommunicationPreferencesContext.Provider value={value}>
      {children}
    </CommunicationPreferencesContext.Provider>
  );
}

export function useCommunicationPreferences(): CommunicationPreferencesValue {
  const value = useContext(CommunicationPreferencesContext);
  if (!value) {
    throw new Error(
      'useCommunicationPreferences must be used inside CommunicationPreferencesProvider',
    );
  }
  return value;
}

/**
 * Null outside the provider (isolated screen tests): reminder UI then reads
 * as disabled, which is exactly the fail-safe reading.
 */
export function useOptionalCommunicationPreferences(): CommunicationPreferencesValue | null {
  return useContext(CommunicationPreferencesContext);
}
