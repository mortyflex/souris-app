// BeautIzzy — RevenueCat key selection: Test Store for development bundles
// only, the Apple key for iOS releases, nothing for Android releases, and a
// missing or wrong key that leaves RevenueCat unconfigured without a crash
// and without printing a key.

import {
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
      });
    }
  });

  it('uses the Apple key in an iOS release build — TestFlight is a release', () => {
    expect(resolveRevenueCatConfiguration(BOTH, { platform: 'ios', debug: false })).toEqual({
      kind: 'configured',
      store: 'app-store',
      apiKey: APPLE_KEY,
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
