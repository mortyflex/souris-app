import type { AuthState } from '@/features/auth/session/AuthProvider';
import type { BusinessSessionState } from '@/features/business/session/BusinessSessionProvider';
import { createRemoteBusiness } from '@/features/business/testing/fake-business-gateway';

import { resolveRootRoute } from '../root-route';

const user = { id: 'user-lea' };
const live: AuthState = { status: 'authenticated', user, session: 'live' };
const business = createRemoteBusiness();

describe('resolveRootRoute', () => {
  it('keeps the branded surface while anything is still resolving', () => {
    expect(resolveRootRoute({ status: 'initializing' }, { status: 'idle' })).toBe('booting');
    expect(resolveRootRoute(live, { status: 'idle' })).toBe('booting');
    expect(resolveRootRoute(live, { status: 'resolving' })).toBe('booting');
  });

  it('routes each settled combination deterministically', () => {
    expect(resolveRootRoute({ status: 'unauthenticated' }, { status: 'idle' })).toBe('auth');
    expect(resolveRootRoute(live, { status: 'setup-required' })).toBe('onboarding');
    expect(resolveRootRoute(live, { status: 'ready', business })).toBe('app');
    expect(resolveRootRoute({ ...live, session: 'offline' }, { status: 'ready', business })).toBe('app');
    expect(resolveRootRoute(live, { status: 'device-account-conflict', business })).toBe('device-account-conflict');
    expect(resolveRootRoute(live, { status: 'error', failure: { code: 'NETWORK' } })).toBe('business-error');
    expect(resolveRootRoute({ status: 'error', failure: { code: 'NOT_CONFIGURED' } }, { status: 'idle' })).toBe('auth-error');
  });

  it('holds an empty device back until its data is known: a waiting state while resolving, a recoverable state when unavailable', () => {
    const ready: BusinessSessionState = { status: 'ready', business };
    expect(resolveRootRoute(live, ready, 'ready')).toBe('app');
    expect(resolveRootRoute(live, ready, 'resolving')).toBe('data-loading');
    expect(resolveRootRoute(live, ready, 'unavailable')).toBe('data-unavailable');
    expect(resolveRootRoute({ ...live, session: 'offline' }, ready, 'unavailable')).toBe('data-unavailable');
    // The gate only ever replaces the app: every other route ignores it.
    expect(resolveRootRoute({ status: 'unauthenticated' }, ready, 'unavailable')).toBe('auth');
    expect(resolveRootRoute(live, { status: 'setup-required' }, 'unavailable')).toBe('onboarding');
    expect(resolveRootRoute(live, { status: 'device-account-conflict', business }, 'resolving')).toBe('device-account-conflict');
  });

  it('never exposes the app while signed out, whatever the business state says', () => {
    const states: BusinessSessionState[] = [{ status: 'ready', business }, { status: 'setup-required' }];
    for (const state of states) {
      expect(resolveRootRoute({ status: 'unauthenticated' }, state)).toBe('auth');
      expect(resolveRootRoute({ status: 'initializing' }, state)).toBe('booting');
    }
  });
});
