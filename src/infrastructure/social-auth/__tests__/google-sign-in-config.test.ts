// BeautIzzy — native Google Sign-In: which builds may start it
//
// iOS crashes when sign-in starts without the reversed-client-ID URL scheme,
// so the JavaScript rule (google-sign-in-config.ts) and the prebuild rule
// (app.config.js) must agree: a build has the scheme AND the client IDs, or
// neither.

import appJson from '../../../../app.json';

import { googleIosUrlScheme, resolveGoogleSignInConfig } from '../google-sign-in-config';

const WEB = '123456789012-webwebwebwebwebwebwebwebwebweb12.apps.googleusercontent.com';
const IOS = '123456789012-iosiosiosiosiosiosiosiosiosios34.apps.googleusercontent.com';

describe('resolveGoogleSignInConfig', () => {
  it('iOS needs the Web AND the iOS client IDs', () => {
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: IOS }, 'ios')).toEqual({ webClientId: WEB, iosClientId: IOS });
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: undefined }, 'ios')).toBeUndefined();
    expect(resolveGoogleSignInConfig({ webClientId: undefined, iosClientId: IOS }, 'ios')).toBeUndefined();
  });

  it('Android needs the Web client ID only (its ID token audience); the iOS one is ignored', () => {
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: undefined }, 'android')).toEqual({ webClientId: WEB });
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: IOS }, 'android')).toEqual({ webClientId: WEB });
    expect(resolveGoogleSignInConfig({ webClientId: undefined, iosClientId: IOS }, 'android')).toBeUndefined();
  });

  it('never on the web: there is no native SDK there', () => {
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: IOS }, 'web')).toBeUndefined();
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['a client SECRET', 'GOCSPX-abcdefghijklmnopqrstuvwxyz12'],
    ['a reversed scheme instead of an ID', 'com.googleusercontent.apps.123456789012-iosiosiosiosiosiosiosiosiosios34'],
    ['another domain', '123456789012-abc.apps.example.com'],
  ])('refuses %s as a client ID', (_case, value) => {
    expect(resolveGoogleSignInConfig({ webClientId: value, iosClientId: IOS }, 'ios')).toBeUndefined();
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: value }, 'ios')).toBeUndefined();
  });

  it('trims surrounding whitespace (an .env line, an EAS variable)', () => {
    expect(resolveGoogleSignInConfig({ webClientId: ` ${WEB}\n`, iosClientId: ` ${IOS} ` }, 'ios')).toEqual({ webClientId: WEB, iosClientId: IOS });
  });
});

describe('the iOS URL scheme', () => {
  it('is the reversed iOS client ID', () => {
    expect(googleIosUrlScheme(IOS)).toBe('com.googleusercontent.apps.123456789012-iosiosiosiosiosiosiosiosiosios34');
    expect(googleIosUrlScheme('not-a-client-id')).toBeUndefined();
  });
});

describe('app.config.js — the Google Sign-In config plugin', () => {
  const GOOGLE_PLUGIN = '@react-native-google-signin/google-signin';
  const original = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = original;
  });

  /** The plugins app.config.js resolves with the given iOS client ID, as `expo prebuild` would. */
  function resolvePlugins(iosClientId: string | undefined): unknown[] {
    if (iosClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = iosClientId;
    let plugins: unknown[] = [];
    // The variable is read when the module loads: a fresh module per case.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const appConfig = require('../../../../app.config.js') as {
        default: (input: { config: typeof appJson.expo }) => { plugins: unknown[] };
      };
      plugins = appConfig.default({ config: appJson.expo }).plugins;
    });
    return plugins;
  }

  const googleEntries = (plugins: unknown[]) => plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === GOOGLE_PLUGIN);

  it('registers the SAME scheme the JavaScript rule derives, when the iOS client ID is valid', () => {
    expect(googleEntries(resolvePlugins(IOS))).toEqual([[GOOGLE_PLUGIN, { iosUrlScheme: googleIosUrlScheme(IOS) }]]);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'com.googleusercontent.apps.123456789012-abc'],
  ])('is not applied when the iOS client ID is %s — and the JavaScript never starts Google on iOS then', (_case, value) => {
    expect(googleEntries(resolvePlugins(value))).toEqual([]);
    expect(resolveGoogleSignInConfig({ webClientId: WEB, iosClientId: value }, 'ios')).toBeUndefined();
  });

  it('keeps every plugin of app.json', () => {
    expect(resolvePlugins(IOS).slice(0, appJson.expo.plugins.length)).toEqual(appJson.expo.plugins);
  });
});
