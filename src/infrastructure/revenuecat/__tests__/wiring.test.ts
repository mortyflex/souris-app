// BeautIzzy — the root wiring: the SDK is configured with the key the build
// may use, through the source, with the Supabase user id; an unconfigured
// build gets the unconfigured source and a warning naming the variable, never
// a key; a missing native module never crashes; nothing is purchased.

import { unconfiguredSubscriptionSource } from '@/features/access/subscription-source';

import { createAccountSubscriptionSource, readRevenueCatBuild } from '../index';
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

// ---------------------------------------------------------------------------
// Apple Sandbox mode (Phase 6.4A): the wiring binds the SDK to the Apple key
// in an explicitly opted-in iOS debug build carrying the App Store bundle
// identifier, names the App Store as its store, carries Apple Sandbox mode
// with the declared test accounts (Phase 6.4B — the provider's authorization
// rule reads them there), says so once without a key or an account, and
// refuses the mode for the `.dev` identifier. The default development build
// and the release build carry no mode.
// ---------------------------------------------------------------------------

describe('createAccountSubscriptionSource — Apple Sandbox mode', () => {
  const SANDBOX_BUILD = { platform: 'ios', debug: true, appleSandbox: true, bundleIdentifier: 'com.mortyflex.sourisapp' };
  const DECLARED = { ...BOTH, appleSandboxTestAccounts: 'Tester@Example.com, user-tester' };

  it('configures the SDK with the Apple key and the Supabase user id, bound to the App Store, and announces the mode without a key', async () => {
    const sdk = createFakeRevenueCatSdk();
    const warn = jest.fn();
    const info = jest.fn();
    const source = createAccountSubscriptionSource({ environment: BOTH, build: SANDBOX_BUILD, sdk, clock: () => NOW, warn, info });
    expect(source).not.toBe(unconfiguredSubscriptionSource);
    expect(source.store).toBe('app-store');
    await expect(source.verify('user-lea')).resolves.toEqual({ kind: 'unavailable' });
    expect(sdk.calls.configure).toEqual([{ apiKey: APPLE_KEY, appUserID: 'user-lea' }]);
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    const notice = String(info.mock.calls[0]?.[0]);
    expect(notice).toContain('APP_VARIANT=apple-sandbox');
    expect(notice).toMatch(/no dedicated test account is declared/);
    expect(notice).not.toContain(APPLE_KEY);
    expect(notice).not.toContain(TEST_STORE_KEY);
  });

  it('carries Apple Sandbox mode on the source with the declared test accounts, and counts them in the notice without naming them', () => {
    const info = jest.fn();
    const source = createAccountSubscriptionSource({ environment: DECLARED, build: SANDBOX_BUILD, sdk: createFakeRevenueCatSdk(), warn: jest.fn(), info });
    expect(source.store).toBe('app-store');
    expect(source.appleSandbox).toEqual({ testAccounts: ['tester@example.com', 'user-tester'] });
    const notice = String(info.mock.calls[0]?.[0]);
    expect(notice).toMatch(/2 dedicated test account\(s\)/);
    expect(notice).not.toMatch(/tester@example\.com|user-tester/);
  });

  it('carries the mode with an empty list when no account is declared: the authorization rule then refuses everyone', () => {
    const source = createAccountSubscriptionSource({ environment: BOTH, build: SANDBOX_BUILD, sdk: createFakeRevenueCatSdk(), warn: jest.fn(), info: jest.fn() });
    expect(source.appleSandbox).toEqual({ testAccounts: [] });
  });

  it('exposes the offering loader (read) and the transactions the provider authorizes under its rule only', () => {
    const source = createAccountSubscriptionSource({ environment: BOTH, build: SANDBOX_BUILD, sdk: createFakeRevenueCatSdk(), warn: jest.fn(), info: jest.fn() });
    expect(typeof source.loadOffering).toBe('function');
    expect(typeof source.purchase).toBe('function');
    expect(typeof source.restore).toBe('function');
    // The source is the same adapter as the release one: the authorization of its purchases lives in
    // features/access (PURCHASABLE_STORES, purchase-authorization.ts), never in a second code path here.
    expect(source.store).toBe('app-store');
  });

  it('a release bound to the App Store carries NO Apple Sandbox mode, even with declared accounts and the flag', () => {
    const info = jest.fn();
    const source = createAccountSubscriptionSource({ environment: DECLARED, build: { ...SANDBOX_BUILD, debug: false }, sdk: createFakeRevenueCatSdk(), warn: jest.fn(), info });
    expect(source.store).toBe('app-store');
    expect(source.appleSandbox).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
  });

  it('refuses the mode for the .dev bundle identifier: unconfigured, explained by the variant and the bundle, no SDK configured', async () => {
    const sdk = createFakeRevenueCatSdk();
    const warn = jest.fn();
    const info = jest.fn();
    const source = createAccountSubscriptionSource({
      environment: BOTH,
      build: { ...SANDBOX_BUILD, bundleIdentifier: 'com.mortyflex.sourisapp.dev' },
      sdk,
      warn,
      info,
    });
    expect(source).toBe(unconfiguredSubscriptionSource);
    await expect(source.verify('user-lea')).resolves.toEqual({ kind: 'unavailable' });
    expect(sdk.calls.configure).toEqual([]);
    expect(info).not.toHaveBeenCalled();
    const warnings = warn.mock.calls.flat().join('\n');
    expect(warnings).toContain('APP_VARIANT=apple-sandbox');
    expect(warnings).toContain('com.mortyflex.sourisapp');
    expect(warnings).not.toContain(APPLE_KEY);
    expect(warnings).not.toContain(TEST_STORE_KEY);
  });

  it('keeps the Test Store as the default development behaviour and says nothing about a sandbox', async () => {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo('user-lea', customerInfo());
    const info = jest.fn();
    const source = createAccountSubscriptionSource({
      environment: BOTH,
      build: { platform: 'ios', debug: true, appleSandbox: false, bundleIdentifier: 'com.mortyflex.sourisapp' },
      sdk,
      clock: () => NOW,
      warn: jest.fn(),
      info,
    });
    expect(source.store).toBe('test-store');
    expect(source.appleSandbox).toBeUndefined();
    await expect(source.verify('user-lea')).resolves.toMatchObject({ kind: 'verified' });
    expect(sdk.calls.configure).toEqual([{ apiKey: TEST_STORE_KEY, appUserID: 'user-lea' }]);
    expect(info).not.toHaveBeenCalled();
  });

  it('the Test Store build ignores declared test accounts: no mode, nothing announced', () => {
    const info = jest.fn();
    const source = createAccountSubscriptionSource({
      environment: DECLARED,
      build: { platform: 'ios', debug: true, appleSandbox: false, bundleIdentifier: 'com.mortyflex.sourisapp.dev' },
      sdk: createFakeRevenueCatSdk(),
      warn: jest.fn(),
      info,
    });
    expect(source.store).toBe('test-store');
    expect(source.appleSandbox).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
  });

  it('reads the build of this bundle from the Expo config without throwing, and never a key from it', () => {
    const build = readRevenueCatBuild();
    expect(typeof build.platform).toBe('string');
    expect(typeof build.debug).toBe('boolean');
    expect(typeof build.appleSandbox).toBe('boolean');
    expect(build.bundleIdentifier === undefined || typeof build.bundleIdentifier === 'string').toBe(true);
    expect(Object.keys(build).sort()).toEqual(['appleSandbox', 'bundleIdentifier', 'debug', 'platform']);
  });
});
