// BeautIzzy — Supabase wiring for the application root
//
// Builds the domain-facing gateways from the single client. When the
// environment is incomplete, the Auth gateway reports NOT_CONFIGURED as a
// controlled outcome instead of crashing the root render.

import { AuthGatewayError, type AuthGateway } from '@/features/auth/gateway';
import { BusinessGatewayError, type BusinessGateway } from '@/features/business/gateway';
import type { CommunicationsGateway } from '@/features/communications/gateway';
import type { BusinessMediaRemote } from '@/persistence/media/business-media';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';

import { createSupabaseAuthGateway } from './auth-gateway';
import { createSupabaseBusinessGateway } from './business-gateway';
import { createSupabaseBusinessMediaGateway } from './business-media-gateway';
import { createSupabaseCommunicationsGateway } from './communications-gateway';
import { getSupabaseClient } from './client';
import { SupabaseConfigurationError } from './config';
import { expoPhotoFileIO } from './photo-file-io';
import { createSupabaseSyncGateway } from './sync-gateway';

export interface AccountGateways {
  readonly auth: AuthGateway;
  readonly business: BusinessGateway;
  /** Undefined when Supabase is not configured: cloud sync then never runs. */
  readonly sync: SyncRemoteGateway | undefined;
  /** Undefined when Supabase is not configured: no Client or Product photo can be saved. */
  readonly media: BusinessMediaRemote | undefined;
  /** Undefined when Supabase is not configured: reminder settings then read as disabled. */
  readonly communications: CommunicationsGateway | undefined;
}

function createUnconfiguredGateways(): AccountGateways {
  const fail = () => Promise.reject(new AuthGatewayError('NOT_CONFIGURED'));
  return {
    auth: {
      restoreSession: fail,
      signUp: fail,
      signIn: fail,
      signOut: () => Promise.resolve(),
      resendSignUpConfirmation: fail,
      requestPasswordReset: fail,
      startPasswordRecovery: fail,
      updatePassword: fail,
      discardPasswordRecovery: () => Promise.resolve(),
      onSessionChange: () => () => {},
    },
    business: {
      listOwnedBusinesses: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
      createBusiness: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
    },
    sync: undefined,
    media: undefined,
    communications: undefined,
  };
}

export function createAccountGateways(): AccountGateways {
  try {
    const client = getSupabaseClient();
    return {
      // The recovery marker shares the session's storage (client.ts installs it).
      auth: createSupabaseAuthGateway(client.auth, localStorage),
      business: createSupabaseBusinessGateway(client),
      sync: createSupabaseSyncGateway(client),
      media: createSupabaseBusinessMediaGateway(client, expoPhotoFileIO),
      communications: createSupabaseCommunicationsGateway(client),
    };
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      if (__DEV__) {
        console.warn(`[BeautIzzy] ${error.message}`);
      }
      return createUnconfiguredGateways();
    }
    throw error;
  }
}
