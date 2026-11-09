// BeautIzzy — Supabase wiring for the application root
//
// Builds the domain-facing gateways from the single client. When the
// environment is incomplete, the Auth gateway reports NOT_CONFIGURED as a
// controlled outcome instead of crashing the root render.

import { AuthGatewayError, type AuthGateway } from '@/features/auth/gateway';
import { createPasswordResetCooldown, type PasswordResetCooldown } from '@/features/auth/password-reset-cooldown';
import { BusinessGatewayError, type BusinessGateway } from '@/features/business/gateway';
import type { CommunicationsGateway } from '@/features/communications/gateway';
import type { BusinessMediaRemote } from '@/persistence/media/business-media';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';

import { expoSocialAuthPlatform } from '../social-auth/expo-social-auth-platform';

import { createSupabaseAuthGateway } from './auth-gateway';
import { createSupabaseBusinessGateway } from './business-gateway';
import { createSupabaseBusinessMediaGateway } from './business-media-gateway';
import { createSupabaseCommunicationsGateway } from './communications-gateway';
import { getSupabaseClient } from './client';
import { readSupabaseConfig, SupabaseConfigurationError } from './config';
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
  /**
   * The password recovery resend cooldown: in the session's storage, scoped
   * to the Supabase project so Staging and Production never share it. In
   * memory when Supabase is not configured.
   */
  readonly passwordResetCooldown: PasswordResetCooldown;
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
      signInWithGoogle: fail,
      completeOAuthCallback: fail,
      isAppleSignInAvailable: () => Promise.resolve(false),
      signInWithApple: fail,
      onSessionChange: () => () => {},
    },
    business: {
      listOwnedBusinesses: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
      createBusiness: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
    },
    sync: undefined,
    media: undefined,
    communications: undefined,
    passwordResetCooldown: createPasswordResetCooldown({ scope: 'unconfigured' }),
  };
}

export function createAccountGateways(): AccountGateways {
  try {
    const client = getSupabaseClient();
    return {
      // The recovery marker shares the session's storage (client.ts installs it).
      // Google (system browser) and Apple (native sheet, iOS) through the device adapter.
      auth: createSupabaseAuthGateway(client.auth, localStorage, expoSocialAuthPlatform),
      business: createSupabaseBusinessGateway(client),
      sync: createSupabaseSyncGateway(client),
      media: createSupabaseBusinessMediaGateway(client, expoPhotoFileIO),
      communications: createSupabaseCommunicationsGateway(client),
      passwordResetCooldown: createPasswordResetCooldown({ scope: readSupabaseConfig().url, storage: localStorage }),
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
