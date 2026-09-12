// Souris — root navigation state (pure)
//
// One deterministic decision per render, from the Auth and Business states:
//
//   BOOTING                  → nothing but the branded surface (splash stays)
//   NO SESSION               → Welcome / Auth group
//   SESSION + NO BUSINESS    → Business setup
//   SESSION + BUSINESS       → protected app (tabs + sheets)
//   DEVICE_ACCOUNT_CONFLICT  → dedicated explanatory state
//   AUTH / BUSINESS ERROR    → dedicated recoverable state
//
// Protected content is never mounted outside `app`, so nothing flashes.

import type { AuthState } from '@/features/auth/session/AuthProvider';
import type { BusinessSessionState } from '@/features/business/session/BusinessSessionProvider';

export type RootRoute =
  | 'booting'
  | 'auth'
  | 'onboarding'
  | 'app'
  | 'device-account-conflict'
  | 'auth-error'
  | 'business-error';

export function resolveRootRoute(auth: AuthState, business: BusinessSessionState): RootRoute {
  switch (auth.status) {
    case 'initializing':
      return 'booting';
    case 'error':
      return 'auth-error';
    case 'unauthenticated':
      return 'auth';
    case 'authenticated':
      switch (business.status) {
        case 'idle':
        case 'resolving':
          return 'booting';
        case 'setup-required':
          return 'onboarding';
        case 'ready':
          return 'app';
        case 'device-account-conflict':
          return 'device-account-conflict';
        case 'error':
          return 'business-error';
      }
  }
}
