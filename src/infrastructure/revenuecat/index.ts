// BeautIzzy — RevenueCat wiring for the application root
//
// Builds the application's SubscriptionSource from the build and its
// environment. When this build has no valid RevenueCat configuration — a
// missing or invalid key, an Android release before Google Play exists, the
// web, an Apple Sandbox request the configuration cannot honour — the source
// is the unconfigured one: every verification is `unavailable`, which on its
// own never grants anything and, with enforcement disabled, never refuses. The
// root never crashes over a key.
//
// The build is described from `Platform.OS`, `__DEV__` and the Expo config of
// this bundle (`expo-constants`): its iOS bundle identifier and the Apple
// Sandbox flag app.config.js sets for `APP_VARIANT=apple-sandbox`. THE rule
// (`config.ts`) decides what they mean; nothing here reads the flag twice. In
// Apple Sandbox mode the source carries `appleSandbox` with the dedicated
// test accounts (Phase 6.4B), and the notice counts them — never names them.
//
// The dependencies are parameters with production defaults so the wiring is
// verified without `process.env`, `Platform`, `__DEV__` or Expo config tricks:
// the application calls it with none.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { unconfiguredSubscriptionSource, type SubscriptionSource } from '@/features/access/subscription-source';

import {
  describeAppleSandboxMode,
  describeUnconfiguredRevenueCat,
  readRevenueCatEnvironment,
  resolveRevenueCatConfiguration,
  type RawRevenueCatEnvironment,
  type RevenueCatBuild,
} from './config';
import { expoRevenueCatSdk, type RevenueCatSdk } from './sdk';
import { createRevenueCatSubscriptionSource } from './subscription-source';

export interface AccountSubscriptionSourceDependencies {
  readonly environment?: RawRevenueCatEnvironment;
  readonly build?: RevenueCatBuild;
  readonly sdk?: RevenueCatSdk;
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
  /** Receives the developer-facing explanation of an unconfigured build; never a key. */
  readonly warn?: (message: string) => void;
  /** Receives the developer-facing notice of Apple Sandbox mode; never a key. */
  readonly info?: (message: string) => void;
}

const warnInDevelopment = (message: string) => {
  if (__DEV__) console.warn(`[BeautIzzy] ${message}`);
};

const infoInDevelopment = (message: string) => {
  if (__DEV__) console.info(`[BeautIzzy] ${message}`);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The build this bundle runs in, from the Expo config app.config.js produced for it. Reads flags, never keys. */
export function readRevenueCatBuild(): RevenueCatBuild {
  const expoConfig = Constants.expoConfig;
  const revenueCat = isRecord(expoConfig?.extra) ? expoConfig.extra.revenueCat : undefined;
  return {
    platform: Platform.OS,
    debug: __DEV__,
    appleSandbox: isRecord(revenueCat) && revenueCat.appleSandbox === true,
    bundleIdentifier: expoConfig?.ios?.bundleIdentifier,
  };
}

export function createAccountSubscriptionSource({
  environment = readRevenueCatEnvironment(),
  build = readRevenueCatBuild(),
  sdk = expoRevenueCatSdk,
  clock,
  warn = warnInDevelopment,
  info = infoInDevelopment,
}: AccountSubscriptionSourceDependencies = {}): SubscriptionSource {
  const configuration = resolveRevenueCatConfiguration(environment, build);
  if (configuration.kind === 'unconfigured') {
    warn(describeUnconfiguredRevenueCat(configuration.reason));
    return unconfiguredSubscriptionSource;
  }
  if (configuration.appleSandbox) info(describeAppleSandboxMode(configuration.appleSandboxTestAccounts.length));
  return createRevenueCatSubscriptionSource({
    sdk,
    apiKey: configuration.apiKey,
    store: configuration.store,
    // Apple Sandbox mode travels with the source: the provider's authorization rule reads it there.
    appleSandbox: configuration.appleSandbox ? { testAccounts: configuration.appleSandboxTestAccounts } : undefined,
    clock,
  });
}
