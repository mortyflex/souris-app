// BeautIzzy — RevenueCat wiring for the application root
//
// Builds the application's SubscriptionSource from the build and its
// environment. When this build has no valid RevenueCat configuration — a
// missing or invalid key, an Android release before Google Play exists, the
// web — the source is the unconfigured one: every verification is
// `unavailable`, which on its own never grants anything and, with enforcement
// disabled, never refuses. The root never crashes over a key.
//
// The dependencies are parameters with production defaults so the wiring is
// verified without `process.env`, `Platform` or `__DEV__` tricks: the
// application calls it with none.

import { Platform } from 'react-native';

import { unconfiguredSubscriptionSource, type SubscriptionSource } from '@/features/access/subscription-source';

import {
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
}

const warnInDevelopment = (message: string) => {
  if (__DEV__) console.warn(`[BeautIzzy] ${message}`);
};

export function createAccountSubscriptionSource({
  environment = readRevenueCatEnvironment(),
  build = { platform: Platform.OS, debug: __DEV__ },
  sdk = expoRevenueCatSdk,
  clock,
  warn = warnInDevelopment,
}: AccountSubscriptionSourceDependencies = {}): SubscriptionSource {
  const configuration = resolveRevenueCatConfiguration(environment, build);
  if (configuration.kind === 'unconfigured') {
    warn(describeUnconfiguredRevenueCat(configuration.reason));
    return unconfiguredSubscriptionSource;
  }
  return createRevenueCatSubscriptionSource({ sdk, apiKey: configuration.apiKey, store: configuration.store, clock });
}
