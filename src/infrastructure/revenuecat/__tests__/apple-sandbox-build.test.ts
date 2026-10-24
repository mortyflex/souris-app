// BeautIzzy — Apple Sandbox mode, from the build variant to the Apple products
// (Phase 6.4A). Deterministic: app.config.js is evaluated with each
// APP_VARIANT, and the Apple product configuration the mapping relies on is
// pinned — the App Store bundle identifier, the two subscription products, the
// `plus` entitlement and the two predefined RevenueCat packages.

import type { ExpoConfig } from 'expo/config';

import { APP_STORE_BUNDLE_IDENTIFIER } from '../config';
import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS, PLUS_ENTITLEMENT_IDENTIFIER } from '../customer-info';
import { PLUS_PACKAGE_IDENTIFIERS } from '../offering';

type AppConfigFactory = (context: { readonly config: ExpoConfig }) => ExpoConfig;

/** app.json as `expo config` hands it to app.config.js: the parts the variants touch. */
const BASE_CONFIG: ExpoConfig = {
  name: 'BeautIzzy',
  slug: 'souris-app',
  ios: { bundleIdentifier: 'com.mortyflex.sourisapp' },
  android: {},
  extra: { router: {}, eas: { projectId: 'project' } },
};

/** Evaluates app.config.js afresh under `APP_VARIANT`, as a separate `expo` process would. */
function evaluateAppConfig(variant: string | undefined): ExpoConfig {
  const previous = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    let factory: AppConfigFactory | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      factory = (require('../../../../app.config.js') as { default: AppConfigFactory }).default;
    });
    if (factory === undefined) throw new Error('app.config.js did not export a factory');
    return factory({ config: BASE_CONFIG });
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

const appleSandboxFlag = (config: ExpoConfig): unknown => (config.extra?.revenueCat as { appleSandbox?: unknown } | undefined)?.appleSandbox;

describe('app.config.js — build variants', () => {
  it('without a variant: the App Store identifiers, the product name, no Apple Sandbox flag', () => {
    const config = evaluateAppConfig(undefined);
    expect(config.name).toBe('BeautIzzy');
    expect(config.ios?.bundleIdentifier).toBe(APP_STORE_BUNDLE_IDENTIFIER);
    expect(config.android?.package).toBe('com.mortyflex.sourisapp');
    expect(appleSandboxFlag(config)).toBe(false);
  });

  it('development: the .dev identifiers, and never the Apple Sandbox flag', () => {
    const config = evaluateAppConfig('development');
    expect(config.name).toBe('BeautIzzy Dev');
    expect(config.ios?.bundleIdentifier).toBe('com.mortyflex.sourisapp.dev');
    expect(config.android?.package).toBe('com.mortyflex.sourisapp.dev');
    expect(appleSandboxFlag(config)).toBe(false);
  });

  it('apple-sandbox: the App Store bundle identifier WITH the Apple Sandbox flag, from the one variant value', () => {
    const config = evaluateAppConfig('apple-sandbox');
    expect(config.name).toBe('BeautIzzy Sandbox');
    expect(config.ios?.bundleIdentifier).toBe(APP_STORE_BUNDLE_IDENTIFIER);
    expect(config.ios?.bundleIdentifier).not.toMatch(/\.dev$/);
    expect(appleSandboxFlag(config)).toBe(true);
  });

  it('an unknown variant behaves like no variant: nothing is guessed', () => {
    const config = evaluateAppConfig('sandbox');
    expect(config.name).toBe('BeautIzzy');
    expect(config.ios?.bundleIdentifier).toBe(APP_STORE_BUNDLE_IDENTIFIER);
    expect(appleSandboxFlag(config)).toBe(false);
  });

  it('keeps the rest of the configuration (router, EAS project) under every variant', () => {
    for (const variant of [undefined, 'development', 'apple-sandbox']) {
      const config = evaluateAppConfig(variant);
      expect(config.slug).toBe('souris-app');
      expect(config.extra?.router).toEqual({});
      expect(config.extra?.eas).toEqual({ projectId: 'project' });
    }
  });
});

describe('Apple product configuration', () => {
  it('pins the App Store subscription products of the bundle, by plan', () => {
    expect(APP_STORE_PLUS_PRODUCT_IDENTIFIERS).toEqual({
      monthly: 'com.mortyflex.sourisapp.plus.monthly',
      annual: 'com.mortyflex.sourisapp.plus.annual',
    });
    for (const identifier of Object.values(APP_STORE_PLUS_PRODUCT_IDENTIFIERS)) {
      expect(identifier.startsWith(`${APP_STORE_BUNDLE_IDENTIFIER}.plus.`)).toBe(true);
    }
  });

  it('pins the entitlement and the two predefined RevenueCat packages the offering is read through', () => {
    expect(PLUS_ENTITLEMENT_IDENTIFIER).toBe('plus');
    expect(PLUS_PACKAGE_IDENTIFIERS).toEqual({ monthly: '$rc_monthly', annual: '$rc_annual' });
  });
});
