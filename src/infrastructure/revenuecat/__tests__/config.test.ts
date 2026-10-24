// BeautIzzy — RevenueCat key selection: Test Store for development bundles
// only, the Apple key for iOS releases, nothing for Android releases, and a
// missing or wrong key that leaves RevenueCat unconfigured without a crash
// and without printing a key.

import {
  APP_STORE_BUNDLE_IDENTIFIER,
  APPLE_SANDBOX_APP_VARIANT,
  APPLE_SANDBOX_MODE_NOTICE,
  describeUnconfiguredRevenueCat,
  resolveRevenueCatConfiguration,
  type RawRevenueCatEnvironment,
  type RevenueCatUnconfiguredReason,
} from '../config';

const TEST_STORE_KEY = 'test_FakeTestStoreKeyForUnitTestsOnly';
const APPLE_KEY = 'appl_FakeAppleKeyForUnitTestsOnly';

const BOTH: RawRevenueCatEnvironment = { testStoreApiKey: TEST_STORE_KEY, iosApiKey: APPLE_KEY };

describe('resolveRevenueCatConfiguration', () => {
  it('uses the Test Store key in a development bundle, on iOS and on Android', () => {
    for (const platform of ['ios', 'android']) {
      expect(resolveRevenueCatConfiguration(BOTH, { platform, debug: true })).toEqual({
        kind: 'configured',
        store: 'test-store',
        apiKey: TEST_STORE_KEY,
        appleSandbox: false,
      });
    }
  });

  it('uses the Apple key in an iOS release build — TestFlight is a release', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { platform: 'ios', debug: false })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: false,
    });
  });

  it('never selects the Test Store key in a release build, even when it is the only key present', () => {
    const onlyTestStore: RawRevenueCatEnvironment = { testStoreApiKey: TEST_STORE_KEY, iosApiKey: undefined };
    expect(resolveRevenueCatConfiguration(onlyTestStore, { platform: 'ios', debug: false })).toEqual({
      kind: 'unconfigured',
      reason: 'missing-ios-key',
    });
    expect(resolveRevenueCatConfiguration(onlyTestStore, { platform: 'android', debug: false })).toEqual({
      kind: 'unconfigured',
      reason: 'android-store-not-configured',
    });
  });

  it('leaves an Android release unconfigured: no Google Play key exists, the iOS key is never borrowed', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { platform: 'android', debug: false })).toEqual({
      kind: 'unconfigured',
      reason: 'android-store-not-configured',
    });
  });

  it('does not configure a platform without a store', () => {
    for (const platform of ['web', 'macos', 'windows', 'native']) {
      expect(resolveRevenueCatConfiguration(BOTH, { platform, debug: true })).toEqual({
        kind: 'unconfigured',
        reason: 'unsupported-platform',
      });
    }
  });

  it('handles a missing or blank key safely', () => {
    const empty: RawRevenueCatEnvironment = { testStoreApiKey: undefined, iosApiKey: '   ' };
    expect(resolveRevenueCatConfiguration(empty, { platform: 'ios', debug: true })).toEqual({
      kind: 'unconfigured',
      reason: 'missing-test-store-key',
    });
    expect(resolveRevenueCatConfiguration(empty, { platform: 'ios', debug: false })).toEqual({
      kind: 'unconfigured',
      reason: 'missing-ios-key',
    });
  });

  it('refuses a key of the wrong family instead of using it', () => {
    const swapped: RawRevenueCatEnvironment = { testStoreApiKey: APPLE_KEY, iosApiKey: TEST_STORE_KEY };
    expect(resolveRevenueCatConfiguration(swapped, { platform: 'ios', debug: true })).toEqual({
      kind: 'unconfigured',
      reason: 'invalid-test-store-key',
    });
    expect(resolveRevenueCatConfiguration(swapped, { platform: 'ios', debug: false })).toEqual({
      kind: 'unconfigured',
      reason: 'invalid-ios-key',
    });
    const secret: RawRevenueCatEnvironment = { testStoreApiKey: 'sk_secret', iosApiKey: 'sk_secret' };
    expect(resolveRevenueCatConfiguration(secret, { platform: 'ios', debug: true }).kind).toBe('unconfigured');
    expect(resolveRevenueCatConfiguration(secret, { platform: 'ios', debug: false }).kind).toBe('unconfigured');
  });

  it('trims surrounding whitespace but rejects a key containing whitespace', () => {
    expect(resolveRevenueCatConfiguration({ testStoreApiKey: ` ${TEST_STORE_KEY}\n`, iosApiKey: undefined }, { platform: 'ios', debug: true })).toEqual({
      kind: 'configured',
      store: 'test-store',
      apiKey: TEST_STORE_KEY,
      appleSandbox: false,
    });
    expect(resolveRevenueCatConfiguration({ testStoreApiKey: 'test_abc def', iosApiKey: undefined }, { platform: 'ios', debug: true })).toEqual({
      kind: 'unconfigured',
      reason: 'invalid-test-store-key',
    });
  });

  it('describes every unconfigured reason by its variable name, never by a key value', () => {
    const reasons: readonly RevenueCatUnconfiguredReason[] = [
      'missing-test-store-key',
      'invalid-test-store-key',
      'missing-ios-key',
      'invalid-ios-key',
      'apple-sandbox-ios-only',
      'apple-sandbox-wrong-bundle',
      'android-store-not-configured',
      'unsupported-platform',
    ];
    for (const reason of reasons) {
      const description = describeUnconfiguredRevenueCat(reason);
      expect(description.length).toBeGreaterThan(20);
      expect(description).not.toContain(TEST_STORE_KEY);
      expect(description).not.toContain(APPLE_KEY);
    }
    expect(describeUnconfiguredRevenueCat('missing-test-store-key')).toContain('EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY');
    expect(describeUnconfiguredRevenueCat('invalid-ios-key')).toContain('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  });
});

// ---------------------------------------------------------------------------
// Apple Sandbox mode (Phase 6.4A): the ONE explicit opt-in of a debug bundle
// to the Apple key — `APP_VARIANT=apple-sandbox`, which app.config.js turns
// into the flag AND the App Store bundle identifier. iOS only, the App Store
// bundle only, never the `.dev` identifier, never a release decision.
// ---------------------------------------------------------------------------

const SANDBOX_BUILD = { platform: 'ios', debug: true, appleSandbox: true, bundleIdentifier: APP_STORE_BUNDLE_IDENTIFIER };

describe('resolveRevenueCatConfiguration — Apple Sandbox mode', () => {
  it('names the App Store bundle identifier and the variant the mode is selected with', () => {
    expect(APP_STORE_BUNDLE_IDENTIFIER).toBe('com.mortyflex.sourisapp');
    expect(APPLE_SANDBOX_APP_VARIANT).toBe('apple-sandbox');
  });

  it('uses the Apple key in an iOS DEBUG bundle that explicitly opts in with the App Store bundle identifier', () => {
    expect(resolveRevenueCatConfiguration(BOTH, SANDBOX_BUILD)).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: true,
    });
  });

  it('never selects the Test Store key once Apple Sandbox mode is requested, even when it is the only key present', () => {
    const onlyTestStore: RawRevenueCatEnvironment = { testStoreApiKey: TEST_STORE_KEY, iosApiKey: undefined };
    expect(resolveRevenueCatConfiguration(onlyTestStore, SANDBOX_BUILD)).toEqual({ kind: 'unconfigured', reason: 'missing-ios-key' });
    const wrongFamily: RawRevenueCatEnvironment = { testStoreApiKey: TEST_STORE_KEY, iosApiKey: TEST_STORE_KEY };
    expect(resolveRevenueCatConfiguration(wrongFamily, SANDBOX_BUILD)).toEqual({ kind: 'unconfigured', reason: 'invalid-ios-key' });
  });

  it('refuses the mode for the .dev bundle identifier, or without one: the Apple products are never read from another bundle', () => {
    for (const bundleIdentifier of ['com.mortyflex.sourisapp.dev', '', undefined]) {
      expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, bundleIdentifier })).toEqual({
        kind: 'unconfigured',
        reason: 'apple-sandbox-wrong-bundle',
      });
    }
  });

  it('refuses the mode on Android: there is no Apple Sandbox there, and the Test Store is not borrowed either', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, platform: 'android' })).toEqual({
      kind: 'unconfigured',
      reason: 'apple-sandbox-ios-only',
    });
  });

  it('keeps the default development behaviour without the opt-in: the Test Store, whatever the bundle identifier', () => {
    for (const bundleIdentifier of [APP_STORE_BUNDLE_IDENTIFIER, 'com.mortyflex.sourisapp.dev', undefined]) {
      for (const appleSandbox of [false, undefined]) {
        expect(resolveRevenueCatConfiguration(BOTH, { platform: 'ios', debug: true, appleSandbox, bundleIdentifier })).toEqual({
          kind: 'configured',
          store: 'test-store',
          apiKey: TEST_STORE_KEY,
          appleSandbox: false,
        });
      }
    }
  });

  it('changes nothing for a release build: the flag is ignored, the Apple key is the release key, the mode is not sandbox', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, debug: false })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: false,
    });
    expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, debug: false, bundleIdentifier: 'com.mortyflex.sourisapp.dev' })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: false,
    });
    expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, debug: false, platform: 'android' })).toEqual({
      kind: 'unconfigured',
      reason: 'android-store-not-configured',
    });
  });

  it('explains the refusals by the variant and the bundle identifier, never by a key', () => {
    for (const reason of ['apple-sandbox-ios-only', 'apple-sandbox-wrong-bundle'] as const) {
      const description = describeUnconfiguredRevenueCat(reason);
      expect(description).toContain('APP_VARIANT=apple-sandbox');
      expect(description).not.toContain(APPLE_KEY);
      expect(description).not.toContain(TEST_STORE_KEY);
    }
    expect(describeUnconfiguredRevenueCat('apple-sandbox-wrong-bundle')).toContain(APP_STORE_BUNDLE_IDENTIFIER);
    expect(APPLE_SANDBOX_MODE_NOTICE).toContain('APP_VARIANT=apple-sandbox');
    expect(APPLE_SANDBOX_MODE_NOTICE).toMatch(/purchases and restores stay disabled/);
    expect(APPLE_SANDBOX_MODE_NOTICE).not.toMatch(/appl_|test_/);
  });
});
