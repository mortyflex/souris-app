// BeautIzzy — each build answers Auth links on its own URL scheme
//
// The release app and the development build may live on the same phone. iOS
// does not say which app opens a scheme two apps declare, Android asks: an Auth
// link must therefore name the scheme of the build that asked for it, and the
// two builds must never declare the same one. The release scheme never changes.

import type { ExpoConfig } from 'expo/config';

import appJson from '../../../../app.json';
import { RELEASE_APP_SCHEME, resolveAppScheme } from '../auth-gateway';

type AppConfigFactory = (context: { readonly config: ExpoConfig }) => ExpoConfig;

/** Evaluates app.config.js afresh under `APP_VARIANT`, on the real app.json. */
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
    return factory({ config: appJson.expo as ExpoConfig });
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

describe('app URL schemes per build variant', () => {
  it('keeps the release scheme for the release and Apple Sandbox builds', () => {
    expect(appJson.expo.scheme).toBe(RELEASE_APP_SCHEME);
    expect(evaluateAppConfig(undefined).scheme).toBe('sourisapp');
    expect(evaluateAppConfig('apple-sandbox').scheme).toBe('sourisapp');
  });

  it('gives the development build a scheme of its own, never the release one', () => {
    const development = evaluateAppConfig('development');
    expect(development.scheme).toBe('sourisapp-dev');
    expect(development.scheme).not.toBe(RELEASE_APP_SCHEME);
    expect(development.ios?.bundleIdentifier).toBe('com.mortyflex.sourisapp.dev');
    expect(development.android?.package).toBe('com.mortyflex.sourisapp.dev');
  });
});

describe('resolveAppScheme', () => {
  it('uses the scheme the running build declares', () => {
    expect(resolveAppScheme('sourisapp')).toBe('sourisapp');
    expect(resolveAppScheme('sourisapp-dev')).toBe('sourisapp-dev');
    expect(resolveAppScheme(['sourisapp-dev', 'other'])).toBe('sourisapp-dev');
  });

  it('falls back to the release scheme when the config gives nothing usable', () => {
    expect(resolveAppScheme(undefined)).toBe(RELEASE_APP_SCHEME);
    expect(resolveAppScheme('')).toBe(RELEASE_APP_SCHEME);
    expect(resolveAppScheme([])).toBe(RELEASE_APP_SCHEME);
    expect(resolveAppScheme('https://evil.example')).toBe(RELEASE_APP_SCHEME);
    expect(resolveAppScheme(42)).toBe(RELEASE_APP_SCHEME);
  });
});
