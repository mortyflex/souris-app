// BeautIzzy — root navigation state (pure)
//
// One deterministic decision per render, from the Auth and Business states and
// the first-sync gate (CloudSyncRunner):
//
//   BOOTING                  → nothing but the branded surface (splash stays)
//   NO SESSION               → Welcome / Auth group
//   PASSWORD RECOVERY        → Auth group (the reset screen): a recovery
//                              session is not a sign-in until the password is chosen
//   SESSION + NO BUSINESS    → Business setup
//   SESSION + BUSINESS       → protected app (tabs + sheets) — but an EMPTY device
//                              first waits for its data: a waiting state while
//                              the first attempt runs, a recoverable state if the
//                              data could not be fetched. A device that holds data
//                              is never held back
//   DEVICE_ACCOUNT_CONFLICT  → dedicated explanatory state
//   AUTH / BUSINESS ERROR    → dedicated recoverable state
//
// Protected content is never mounted outside `app`, so nothing flashes — and
// nothing can be created on a device that is still waiting for its data.

import type { AuthState } from '@/features/auth/session/AuthProvider';
import type { BusinessSessionState } from '@/features/business/session/BusinessSessionProvider';

import type { FirstSyncGate } from './CloudSyncRunner';

export type RootRoute =
  | 'booting'
  | 'auth'
  | 'onboarding'
  | 'app'
  | 'device-account-conflict'
  | 'auth-error'
  | 'business-error'
  | 'data-loading'
  | 'data-unavailable';

export function resolveRootRoute(
  auth: AuthState,
  business: BusinessSessionState,
  firstSync: FirstSyncGate['status'] = 'ready',
): RootRoute {
  switch (auth.status) {
    case 'initializing':
      return 'booting';
    case 'error':
      return 'auth-error';
    case 'unauthenticated':
    case 'recovering-password':
      return 'auth';
    case 'authenticated':
      switch (business.status) {
        case 'idle':
        case 'resolving':
          return 'booting';
        case 'setup-required':
          return 'onboarding';
        case 'ready':
          if (firstSync === 'resolving') return 'data-loading';
          return firstSync === 'unavailable' ? 'data-unavailable' : 'app';
        case 'device-account-conflict':
          return 'device-account-conflict';
        case 'error':
          return 'business-error';
      }
  }
}
