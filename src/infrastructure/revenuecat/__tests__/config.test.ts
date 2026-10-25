// BeautIzzy — RevenueCat key selection: Test Store for development bundles
// only, the Apple key for iOS releases, nothing for Android releases, and a
// missing or wrong key that leaves RevenueCat unconfigured without a crash
// and without printing a key.

import {
  APP_STORE_BUNDLE_IDENTIFIER,
  APPLE_SANDBOX_APP_VARIANT,
  APPLE_SANDBOX_TEST_ACCOUNTS_VARIABLE,
  describeAppleSandboxMode,
  describeUnconfiguredRevenueCat,
  parseAppleSandboxTestAccounts,
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
        appleSandboxTestAccounts: [],
      });
    }
  });

  it('uses the Apple key in an iOS release build — TestFlight is a release', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { platform: 'ios', debug: false })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: false,
      appleSandboxTestAccounts: [],
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
      appleSandboxTestAccounts: [],
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
      appleSandboxTestAccounts: [],
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
          appleSandboxTestAccounts: [],
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
      appleSandboxTestAccounts: [],
    });
    expect(resolveRevenueCatConfiguration(BOTH, { ...SANDBOX_BUILD, debug: false, bundleIdentifier: 'com.mortyflex.sourisapp.dev' })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: false,
      appleSandboxTestAccounts: [],
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
    for (const notice of [describeAppleSandboxMode(0), describeAppleSandboxMode(2)]) {
      expect(notice).toContain('APP_VARIANT=apple-sandbox');
      expect(notice).toContain(APPLE_SANDBOX_TEST_ACCOUNTS_VARIABLE);
      expect(notice).toMatch(/decided by the app's signature/);
      expect(notice).not.toMatch(/appl_|test_/);
    }
    expect(describeAppleSandboxMode(0)).toMatch(/no dedicated test account is declared.*stay refused/);
    expect(describeAppleSandboxMode(2)).toMatch(/2 dedicated test account\(s\) declared.*development preview only/);
  });
});

// ---------------------------------------------------------------------------
// Apple Sandbox test accounts (Phase 6.4B): declared in ONE variable, read in
// this boundary only, normalized, never logged; carried by the configuration
// in Apple Sandbox mode ONLY — a Test Store or release configuration carries
// an empty list whatever the variable says.
// ---------------------------------------------------------------------------

describe('Apple Sandbox test accounts', () => {
  it('names the variable', () => {
    expect(APPLE_SANDBOX_TEST_ACCOUNTS_VARIABLE).toBe('EXPO_PUBLIC_REVENUECAT_APPLE_SANDBOX_TEST_ACCOUNTS');
  });

  it('parses a comma- or whitespace-separated list: trimmed, lowercase, blanks and duplicates dropped', () => {
    expect(parseAppleSandboxTestAccounts(undefined)).toEqual([]);
    expect(parseAppleSandboxTestAccounts('')).toEqual([]);
    expect(parseAppleSandboxTestAccounts(' , ,, ')).toEqual([]);
    expect(parseAppleSandboxTestAccounts('Tester@Example.com')).toEqual(['tester@example.com']);
    expect(parseAppleSandboxTestAccounts(' a@x.io , B@X.IO,,user-1\n a@x.io ')).toEqual(['a@x.io', 'b@x.io', 'user-1']);
  });

  it('carries the declared accounts in Apple Sandbox mode', () => {
    const configuration = resolveRevenueCatConfiguration({ ...BOTH, appleSandboxTestAccounts: 'Tester@Example.com, user-2' }, SANDBOX_BUILD);
    expect(configuration).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
      appleSandbox: true,
      appleSandboxTestAccounts: ['tester@example.com', 'user-2'],
    });
  });

  it('carries an empty list in Apple Sandbox mode without the variable: nobody may transact', () => {
    expect(resolveRevenueCatConfiguration(BOTH, SANDBOX_BUILD)).toMatchObject({ appleSandbox: true, appleSandboxTestAccounts: [] });
    expect(resolveRevenueCatConfiguration({ ...BOTH, appleSandboxTestAccounts: '  ' }, SANDBOX_BUILD)).toMatchObject({ appleSandboxTestAccounts: [] });
  });

  it('ignores the variable outside Apple Sandbox mode: the Test Store and every release carry an empty list', () => {
    const declared = { ...BOTH, appleSandboxTestAccounts: 'tester@example.com' };
    expect(resolveRevenueCatConfiguration(declared, { platform: 'ios', debug: true })).toMatchObject({ store: 'test-store', appleSandboxTestAccounts: [] });
    expect(resolveRevenueCatConfiguration(declared, { platform: 'android', debug: true })).toMatchObject({ store: 'test-store', appleSandboxTestAccounts: [] });
    expect(resolveRevenueCatConfiguration(declared, { platform: 'ios', debug: false })).toMatchObject({ store: 'app-store', appleSandbox: false, appleSandboxTestAccounts: [] });
    expect(resolveRevenueCatConfiguration(declared, { ...SANDBOX_BUILD, debug: false })).toMatchObject({ appleSandbox: false, appleSandboxTestAccounts: [] });
    expect(resolveRevenueCatConfiguration(declared, { ...SANDBOX_BUILD, bundleIdentifier: 'com.mortyflex.sourisapp.dev' })).toEqual({
      kind: 'unconfigured',
      reason: 'apple-sandbox-wrong-bundle',
    });
  });
});
