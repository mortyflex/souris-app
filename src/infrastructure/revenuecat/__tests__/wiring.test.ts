// BeautIzzy — the root wiring: the SDK is configured with the key the build
// may use, through the source, with the Supabase user id; an unconfigured
// build gets the unconfigured source and a warning naming the variable, never
// a key; a missing native module never crashes; nothing is purchased.

import { unconfiguredSubscriptionSource } from '@/features/access/subscription-source';

import { createAccountSubscriptionSource } from '../index';
import { customerInfo, NOW } from '../testing/customer-info-fixtures';
import { createFakeRevenueCatSdk } from '../testing/fake-revenuecat-sdk';

const TEST_STORE_KEY = 'test_FakeTestStoreKeyForUnitTestsOnly';
const APPLE_KEY = 'appl_FakeAppleKeyForUnitTestsOnly';
const BOTH = { testStoreApiKey: TEST_STORE_KEY, iosApiKey: APPLE_KEY };

describe('createAccountSubscriptionSource', () => {
  it('configures the SDK with the Test Store key and the Supabase user id in a development bundle', async () => {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo('user-lea', customerInfo());
    const warn = jest.fn();
    const source = createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'ios', debug: true }, sdk, clock: () => NOW, warn });
    expect(source).not.toBe(unconfiguredSubscriptionSource);
    expect(sdk.calls.configure).toEqual([]);
    await expect(source.verify('user-lea')).resolves.toMatchObject({ kind: 'verified' });
    expect(sdk.calls.configure).toEqual([{ apiKey: TEST_STORE_KEY, appUserID: 'user-lea' }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('configures the SDK with the Apple key in an iOS release build', async () => {
    const sdk = createFakeRevenueCatSdk();
    const source = createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'ios', debug: false }, sdk, warn: jest.fn() });
    await expect(source.verify('user-lea')).resolves.toEqual({ kind: 'unavailable' });
    expect(sdk.calls.configure).toEqual([{ apiKey: APPLE_KEY, appUserID: 'user-lea' }]);
  });

  it('names the store the key belongs to, so the provider can refuse purchases outside the Test Store', () => {
    const sdk = createFakeRevenueCatSdk();
    const warn = jest.fn();
    expect(createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'ios', debug: true }, sdk, warn }).store).toBe('test-store');
    expect(createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'ios', debug: false }, sdk, warn }).store).toBe('app-store');
    expect(unconfiguredSubscriptionSource.store).toBeUndefined();
  });

  it('leaves an Android release and a build without keys unconfigured, without crashing', async () => {
    const sdk = createFakeRevenueCatSdk();
    const warn = jest.fn();
    expect(createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'android', debug: false }, sdk, warn })).toBe(
      unconfiguredSubscriptionSource,
    );
    const none = { testStoreApiKey: undefined, iosApiKey: undefined };
    const source = createAccountSubscriptionSource({ environment: none, build: { platform: 'ios', debug: true }, sdk, warn });
    expect(source).toBe(unconfiguredSubscriptionSource);
    await expect(source.verify('user-lea')).resolves.toEqual({ kind: 'unavailable' });
    expect(createAccountSubscriptionSource({ environment: none, build: { platform: 'ios', debug: false }, sdk, warn })).toBe(
      unconfiguredSubscriptionSource,
    );
    expect(sdk.calls.configure).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('warns with the variable name, never with a key', () => {
    const warn = jest.fn();
    createAccountSubscriptionSource({
      environment: { testStoreApiKey: APPLE_KEY, iosApiKey: TEST_STORE_KEY }, // wrong families: refused, explained
      build: { platform: 'ios', debug: true },
      sdk: createFakeRevenueCatSdk(),
      warn,
    });
    const warnings = warn.mock.calls.flat().join('\n');
    expect(warnings).toContain('EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY');
    expect(warnings).not.toContain(APPLE_KEY);
    expect(warnings).not.toContain(TEST_STORE_KEY);
  });

  it('answers unavailable when the native module is absent, instead of crashing', async () => {
    const sdk = createFakeRevenueCatSdk({
      configure: () => {
        throw new Error('react-native-purchases: native module not available');
      },
    });
    const source = createAccountSubscriptionSource({ environment: BOTH, build: { platform: 'ios', debug: true }, sdk, warn: jest.fn() });
    await expect(source.verify('user-lea')).resolves.toEqual({ kind: 'unavailable' });
  });

  it('uses the production defaults without throwing', () => {
    const warn = jest.fn();
    expect(() => createAccountSubscriptionSource({ warn })).not.toThrow();
  });
});
