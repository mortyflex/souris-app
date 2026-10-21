// BeautIzzy — RevenueCat configuration boundary (BeautIzzy Plus)
//
// The ONLY place that reads the RevenueCat environment, and THE rule choosing
// which public SDK key a build may use:
//
//   debug bundle (`__DEV__`)             EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY   RevenueCat Test Store
//   iOS release (TestFlight, App Store)  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY          Apple App Store
//   Android release                      nothing: Google Play is not configured yet
//
// Debug versus release is the COMPILATION of the bundle — `__DEV__`, true in a
// Metro development bundle, false in every release build — never APP_VARIANT,
// which only selects the application name and identifiers (a release build of
// the `.dev` identifier is still a release). A release build can therefore
// never reach the Test Store key, whatever its variant.
//
// Every key here is a PUBLIC SDK key (`test_…`, `appl_…`): it ships inside the
// app. A key of the wrong family in a variable — an Apple key where the Test
// Store one is expected, a Test Store key in the iOS variable, a secret key
// anywhere — is a configuration error, never silently used. A missing or
// invalid key leaves RevenueCat UNCONFIGURED: the subscription stays
// unverifiable (`unavailable`), the application never crashes, and no key
// value is ever part of a message.
//
// Expo inlines `process.env.EXPO_PUBLIC_*` at build time, so the two variables
// must be referenced literally (`readRevenueCatEnvironment`).

export type RevenueCatStore = 'test-store' | 'app-store';

export interface RevenueCatBuild {
  /** `Platform.OS` of the running application. */
  readonly platform: string;
  /** `__DEV__`: a development bundle. False in every release build, TestFlight included. */
  readonly debug: boolean;
}

export interface RawRevenueCatEnvironment {
  readonly testStoreApiKey: string | undefined;
  readonly iosApiKey: string | undefined;
}

export type RevenueCatUnconfiguredReason =
  | 'missing-test-store-key'
  | 'invalid-test-store-key'
  | 'missing-ios-key'
  | 'invalid-ios-key'
  /** Android release: no Google Play key exists yet. Never the iOS key, never the Test Store. */
  | 'android-store-not-configured'
  | 'unsupported-platform';

export type RevenueCatConfiguration =
  | { readonly kind: 'configured'; readonly store: RevenueCatStore; readonly apiKey: string }
  | { readonly kind: 'unconfigured'; readonly reason: RevenueCatUnconfiguredReason };

/** The public key family of each store, as RevenueCat prefixes its SDK keys. */
const KEY_PREFIX: Readonly<Record<RevenueCatStore, string>> = {
  'test-store': 'test_',
  'app-store': 'appl_',
};

const VARIABLE: Readonly<Record<RevenueCatStore, string>> = {
  'test-store': 'EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY',
  'app-store': 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
};

function resolveKey(
  store: RevenueCatStore,
  raw: string | undefined,
  missing: RevenueCatUnconfiguredReason,
  invalid: RevenueCatUnconfiguredReason,
): RevenueCatConfiguration {
  const apiKey = raw?.trim() ?? '';
  if (apiKey.length === 0) return { kind: 'unconfigured', reason: missing };
  if (!apiKey.startsWith(KEY_PREFIX[store]) || /\s/.test(apiKey)) {
    return { kind: 'unconfigured', reason: invalid };
  }
  return { kind: 'configured', store, apiKey };
}

/** Pure selection, exported so it can be verified without touching `process.env` or `__DEV__`. */
export function resolveRevenueCatConfiguration(
  raw: RawRevenueCatEnvironment,
  build: RevenueCatBuild,
): RevenueCatConfiguration {
  if (build.platform !== 'ios' && build.platform !== 'android') {
    return { kind: 'unconfigured', reason: 'unsupported-platform' };
  }
  if (build.debug) {
    return resolveKey('test-store', raw.testStoreApiKey, 'missing-test-store-key', 'invalid-test-store-key');
  }
  if (build.platform === 'ios') {
    return resolveKey('app-store', raw.iosApiKey, 'missing-ios-key', 'invalid-ios-key');
  }
  return { kind: 'unconfigured', reason: 'android-store-not-configured' };
}

/** A developer-facing explanation naming the variable, never a key value. */
export function describeUnconfiguredRevenueCat(reason: RevenueCatUnconfiguredReason): string {
  switch (reason) {
    case 'missing-test-store-key':
      return `${VARIABLE['test-store']} is missing: the RevenueCat Test Store is not configured for this development build.`;
    case 'invalid-test-store-key':
      return `${VARIABLE['test-store']} is not a RevenueCat Test Store public key (test_…).`;
    case 'missing-ios-key':
      return `${VARIABLE['app-store']} is missing: RevenueCat is not configured for this iOS release build.`;
    case 'invalid-ios-key':
      return `${VARIABLE['app-store']} is not a RevenueCat Apple public key (appl_…).`;
    case 'android-store-not-configured':
      return 'RevenueCat has no Google Play configuration yet: subscriptions cannot be verified in an Android release build.';
    case 'unsupported-platform':
      return 'RevenueCat is available on iOS and Android only.';
  }
}

/** Reads the build-time environment. Values are never logged, compared to examples, or printed. */
export function readRevenueCatEnvironment(): RawRevenueCatEnvironment {
  return {
    testStoreApiKey: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  };
}
