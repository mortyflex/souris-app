// Souris — Supabase wiring for the application root
//
// Builds the domain-facing gateways from the single client. When the
// environment is incomplete, the Auth gateway reports NOT_CONFIGURED as a
// controlled outcome instead of crashing the root render.

import { AuthGatewayError, type AuthGateway } from '@/features/auth/gateway';
import { BusinessGatewayError, type BusinessGateway } from '@/features/business/gateway';

import { createSupabaseAuthGateway } from './auth-gateway';
import { createSupabaseBusinessGateway } from './business-gateway';
import { getSupabaseClient } from './client';
import { SupabaseConfigurationError } from './config';

export interface AccountGateways {
  readonly auth: AuthGateway;
  readonly business: BusinessGateway;
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
      onSessionChange: () => () => {},
    },
    business: {
      listOwnedBusinesses: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
      createBusiness: () => Promise.reject(new BusinessGatewayError('UNKNOWN')),
    },
  };
}

export function createAccountGateways(): AccountGateways {
  try {
    const client = getSupabaseClient();
    return {
      auth: createSupabaseAuthGateway(client.auth),
      business: createSupabaseBusinessGateway(client),
    };
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      if (__DEV__) {
        console.warn(`[Souris] ${error.message}`);
      }
      return createUnconfiguredGateways();
    }
    throw error;
  }
}
