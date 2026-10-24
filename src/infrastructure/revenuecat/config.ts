// BeautIzzy — RevenueCat configuration boundary (BeautIzzy Plus)
//
// The ONLY place that reads the RevenueCat environment, and THE rule choosing
// which public SDK key a build may use:
//
//   debug bundle (`__DEV__`)             EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY   RevenueCat Test Store
//   debug bundle, APPLE SANDBOX MODE     EXPO_PUBLIC_REVENUECAT_IOS_API_KEY          Apple App Store (Sandbox)
//   iOS release (TestFlight, App Store)  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY          Apple App Store
//   Android release                      nothing: Google Play is not configured yet
//
// Debug versus release is the COMPILATION of the bundle — `__DEV__`, true in a
// Metro development bundle, false in every release build — never APP_VARIANT,
// which selects the application name and identifiers (a release build of the
// `.dev` identifier is still a release). A release build can therefore never
// reach the Test Store key, whatever its variant.
//
// Apple Sandbox mode (Phase 6.4A) is the ONE explicit opt-in a debug bundle
// has to the Apple key: `APP_VARIANT=apple-sandbox` at build time, which
// app.config.js turns into `extra.revenueCat.appleSandbox` AND into the App
// Store bundle identifier. The rule honours the flag only on iOS and only when
// the configuration's bundle identifier is the App Store one: the `.dev`
// identifier never reads the products of the App Store bundle. The flag changes
// the KEY, nothing else: the source is then bound to `app-store`, a store
// purchases are not enabled for (`features/access/purchasable-stores.ts`), so
// the mode reads offerings, prices, periods and trial eligibility, and can
// neither purchase nor restore. A release build ignores the flag entirely.
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

/** The bundle identifier of the App Store app the Apple products belong to (app.json). */
export const APP_STORE_BUNDLE_IDENTIFIER = 'com.mortyflex.sourisapp';

/** The APP_VARIANT value that selects Apple Sandbox mode at build time (app.config.js). */
export const APPLE_SANDBOX_APP_VARIANT = 'apple-sandbox';

export interface RevenueCatBuild {
  /** `Platform.OS` of the running application. */
  readonly platform: string;
  /** `__DEV__`: a development bundle. False in every release build, TestFlight included. */
  readonly debug: boolean;
  /** `extra.revenueCat.appleSandbox` of the Expo config: the explicit Apple Sandbox opt-in. Absent: not requested. */
  readonly appleSandbox?: boolean;
  /** `ios.bundleIdentifier` of the Expo config the bundle was built from. */
  readonly bundleIdentifier?: string;
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
  /** Apple Sandbox mode requested on Android: there is no Apple Sandbox there. */
  | 'apple-sandbox-ios-only'
  /** Apple Sandbox mode requested by a configuration whose bundle identifier is not the App Store one. */
  | 'apple-sandbox-wrong-bundle'
  /** Android release: no Google Play key exists yet. Never the iOS key, never the Test Store. */
  | 'android-store-not-configured'
  | 'unsupported-platform';

export type RevenueCatConfiguration =
  | {
      readonly kind: 'configured';
      readonly store: RevenueCatStore;
      readonly apiKey: string;
      /** True in Apple Sandbox mode only: a debug bundle bound to the App Store. */
      readonly appleSandbox: boolean;
    }
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
  appleSandbox: boolean,
): RevenueCatConfiguration {
  const apiKey = raw?.trim() ?? '';
  if (apiKey.length === 0) return { kind: 'unconfigured', reason: missing };
  if (!apiKey.startsWith(KEY_PREFIX[store]) || /\s/.test(apiKey)) {
    return { kind: 'unconfigured', reason: invalid };
  }
  return { kind: 'configured', store, apiKey, appleSandbox };
}

/** Pure selection, exported so it can be verified without touching `process.env`, `__DEV__` or the Expo config. */
export function resolveRevenueCatConfiguration(
  raw: RawRevenueCatEnvironment,
  build: RevenueCatBuild,
): RevenueCatConfiguration {
  if (build.platform !== 'ios' && build.platform !== 'android') {
    return { kind: 'unconfigured', reason: 'unsupported-platform' };
  }
  if (build.debug) {
    if (build.appleSandbox === true) {
      if (build.platform !== 'ios') return { kind: 'unconfigured', reason: 'apple-sandbox-ios-only' };
      if (build.bundleIdentifier !== APP_STORE_BUNDLE_IDENTIFIER) {
        return { kind: 'unconfigured', reason: 'apple-sandbox-wrong-bundle' };
      }
      return resolveKey('app-store', raw.iosApiKey, 'missing-ios-key', 'invalid-ios-key', true);
    }
    return resolveKey('test-store', raw.testStoreApiKey, 'missing-test-store-key', 'invalid-test-store-key', false);
  }
  if (build.platform === 'ios') {
    return resolveKey('app-store', raw.iosApiKey, 'missing-ios-key', 'invalid-ios-key', false);
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
      return `${VARIABLE['app-store']} is missing: RevenueCat is not configured for this iOS build bound to the App Store (a release, or Apple Sandbox mode).`;
    case 'invalid-ios-key':
      return `${VARIABLE['app-store']} is not a RevenueCat Apple public key (appl_…).`;
    case 'apple-sandbox-ios-only':
      return `APP_VARIANT=${APPLE_SANDBOX_APP_VARIANT} is an iOS mode: there is no Apple Sandbox on this platform, RevenueCat is not configured.`;
    case 'apple-sandbox-wrong-bundle':
      return `APP_VARIANT=${APPLE_SANDBOX_APP_VARIANT} requires the App Store bundle identifier (${APP_STORE_BUNDLE_IDENTIFIER}); this configuration carries another one, RevenueCat is not configured.`;
    case 'android-store-not-configured':
      return 'RevenueCat has no Google Play configuration yet: subscriptions cannot be verified in an Android release build.';
    case 'unsupported-platform':
      return 'RevenueCat is available on iOS and Android only.';
  }
}

/** The developer-facing notice of Apple Sandbox mode; names the variant and the bundle, never a key. */
export const APPLE_SANDBOX_MODE_NOTICE = `RevenueCat Apple Sandbox mode (APP_VARIANT=${APPLE_SANDBOX_APP_VARIANT}, ${APP_STORE_BUNDLE_IDENTIFIER}): the real App Store products are read with the Apple public key; purchases and restores stay disabled.`;

/** Reads the build-time environment. Values are never logged, compared to examples, or printed. */
export function readRevenueCatEnvironment(): RawRevenueCatEnvironment {
  return {
    testStoreApiKey: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  };
}
