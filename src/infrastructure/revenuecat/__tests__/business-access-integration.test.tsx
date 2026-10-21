// BeautIzzy — the real source under the real provider: the SDK is identified
// with the signed-in Supabase user, sign-out exposes nothing and switches no
// identity, another account is switched to with logIn and reads its own
// answer, the foreground refresh re-verifies without a second configure, a
// store push reaches the session, and enforcement disabled keeps full access
// whatever RevenueCat says.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '@/features/access/session/BusinessAccessProvider';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import { createRevenueCatSubscriptionSource } from '../subscription-source';
import { customerInfo, NOW, plusEntitlement } from '../testing/customer-info-fixtures';
import { createFakeRevenueCatSdk, type FakeRevenueCatSdk } from '../testing/fake-revenuecat-sdk';

const API_KEY = 'test_FakeTestStoreKeyForUnitTestsOnly';
const LEA = fakeUser.id;
const NOA = 'user-noa';

let latest: BusinessAccessValue | undefined;

function Probe() {
  const value = useBusinessAccess();
  useEffect(() => {
    latest = value;
  });
  const { access, canMutate, verification } = value;
  return (
    <Text testID="access-state">
      {`${access.mode}:${access.reason}:${canMutate ? 'write' : 'read'}:${verification?.kind ?? 'pending'}`}
    </Text>
  );
}

const appStateListeners = new Set<(state: AppStateStatus) => void>();

const settle = () => act(async () => {});

async function foreground() {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener('active');
  });
}

function scriptedSdk(): FakeRevenueCatSdk {
  const sdk = createFakeRevenueCatSdk();
  sdk.setCustomerInfo(LEA, customerInfo({ originalAppUserId: LEA }));
  sdk.setCustomerInfo(NOA, customerInfo({ plus: null, originalAppUserId: NOA }));
  return sdk;
}

async function renderAccess(sdk: FakeRevenueCatSdk, auth: FakeAuthGateway, enforcement: 'enabled' | 'disabled' = 'enabled') {
  const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, clock: () => NOW });
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={() => NOW}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await settle();
  await settle();
  return view;
}

type RenderedView = Awaited<ReturnType<typeof render>>;
const stateOf = (view: RenderedView) => view.getByTestId('access-state').props.children;

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
const signedOut = () => createFakeAuthGateway({ restore: async () => ({ kind: 'unauthenticated' }) });

describe('BusinessAccessProvider with the RevenueCat source', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
  });

  it('identifies the SDK with the signed-in Supabase user id, once, and resolves access from its answer', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(sdk.calls.configure).toEqual([{ apiKey: API_KEY, appUserID: LEA }]);
    expect(sdk.calls.logIn).toEqual([]);
    expect(sdk.listenerCount()).toBe(1);
  });

  it('touches the SDK in no way while nobody is signed in', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedOut());
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(sdk.calls.configure).toEqual([]);
    expect(sdk.calls.getCustomerInfo).toBe(0);
    expect(sdk.listenerCount()).toBe(0);
  });

  it('on sign-out exposes nothing, releases the SDK listener and creates no anonymous identity; the next account is switched to with logIn', async () => {
    const sdk = scriptedSdk();
    const auth = signedIn();
    const view = await renderAccess(sdk, auth);
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    await act(async () => auth.emitSession(null));
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(latest?.verification).toBeUndefined();
    expect(sdk.listenerCount()).toBe(0);
    expect(sdk.appUserId()).toBe(LEA);

    await act(async () => auth.emitSession({ id: NOA }));
    await settle();
    await settle();
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([NOA]);
    expect(sdk.appUserId()).toBe(NOA);
    expect(sdk.listenerCount()).toBe(1);
  });

  it('re-verifies on return to the foreground without configuring again', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    const reads = sdk.calls.getCustomerInfo;
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ isActive: false }) }));
    await foreground();
    await settle();
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(sdk.calls.getCustomerInfo).toBe(reads + 1);
    expect(sdk.calls.configure).toHaveLength(1);
  });

  it('applies a store push to the session as a fresh re-read', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ isActive: false }) }));
    await act(async () => sdk.emit(customerInfo()));
    await settle();
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
  });

  it.each([
    ['active', customerInfo()],
    ['trial', customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }) })],
    ['expired', customerInfo({ plus: plusEntitlement({ isActive: false }) })],
    ['never', customerInfo({ plus: null })],
    ['unavailable', undefined],
  ])('keeps full access under enforcement disabled when RevenueCat answers %s — the production state', async (_label, answer) => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, answer);
    const view = await renderAccess(sdk, signedIn(), SUBSCRIPTION_ENFORCEMENT);
    expect(stateOf(view)).toMatch(/^full:enforcement-disabled:write:/);
  });
});
