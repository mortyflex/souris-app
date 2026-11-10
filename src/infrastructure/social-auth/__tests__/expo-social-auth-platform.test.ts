// BeautIzzy — the native Google request (device adapter)
//
// The Google Sign-In SDK is the root Jest mock
// (__mocks__/@react-native-google-signin/google-signin.ts): these tests prove
// how the adapter drives it — never started without configuration, the account
// chooser every time, every native answer translated — not Google itself,
// which is validated on a device.

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { createGoogleIdTokenRequest } from '../expo-social-auth-platform';

const WEB = '123456789012-webwebwebwebwebwebwebwebwebweb12.apps.googleusercontent.com';
const IOS = '123456789012-iosiosiosiosiosiosiosiosiosios34.apps.googleusercontent.com';

const google = jest.mocked(GoogleSignin);

const signedIn = (idToken: string | null) => ({
  type: 'success' as const,
  data: {
    idToken,
    serverAuthCode: null,
    scopes: [],
    user: { id: 'g-1', email: 'nina@gmail.com', name: 'Nina Rossi', givenName: 'Nina', familyName: 'Rossi', photo: null },
  },
});

function nativeError(code: string): Error & { code: string } {
  return Object.assign(new Error(`native ${code}`), { code });
}

beforeEach(() => {
  google.configure.mockReset();
  google.hasPlayServices.mockReset().mockResolvedValue(true);
  google.signOut.mockReset().mockResolvedValue(null);
  google.signIn.mockReset().mockResolvedValue(signedIn('google.id.token') as never);
});

describe('requestGoogleIdToken', () => {
  it('a build without Google configuration never starts the SDK (iOS would crash without its URL scheme)', async () => {
    const request = createGoogleIdTokenRequest(undefined, 'ios');
    await expect(request()).resolves.toEqual({ kind: 'not-configured' });
    expect(google.configure).not.toHaveBeenCalled();
    expect(google.signIn).not.toHaveBeenCalled();
  });

  it('iOS: configured once with both client IDs, an ID token only (no offline access), the chooser every time', async () => {
    const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
    await expect(request()).resolves.toEqual({ kind: 'credential', idToken: 'google.id.token' });
    await request();

    expect(google.configure).toHaveBeenCalledTimes(1);
    expect(google.configure).toHaveBeenCalledWith({ webClientId: WEB, iosClientId: IOS, offlineAccess: false });
    expect(google.hasPlayServices).not.toHaveBeenCalled();
    // The SDK forgets the previous account BEFORE each sign-in: the chooser always shows.
    expect(google.signOut).toHaveBeenCalledTimes(2);
    expect(google.signOut.mock.invocationCallOrder[1]).toBeLessThan(google.signIn.mock.invocationCallOrder[1]);
  });

  it('Android: the Web client ID only, and Google Play services checked first (with Google’s update dialog)', async () => {
    const request = createGoogleIdTokenRequest({ webClientId: WEB }, 'android');
    await expect(request()).resolves.toEqual({ kind: 'credential', idToken: 'google.id.token' });
    expect(google.configure).toHaveBeenCalledWith({ webClientId: WEB, offlineAccess: false });
    expect(google.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
  });

  it('Android without Google Play services: unavailable, no sign-in attempted', async () => {
    google.hasPlayServices.mockRejectedValue(nativeError(statusCodes.PLAY_SERVICES_NOT_AVAILABLE));
    const request = createGoogleIdTokenRequest({ webClientId: WEB }, 'android');
    await expect(request()).resolves.toEqual({ kind: 'unavailable' });
    expect(google.signIn).not.toHaveBeenCalled();
  });

  it('a closed chooser is a cancellation', async () => {
    google.signIn.mockResolvedValue({ type: 'cancelled', data: null } as never);
    const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
    await expect(request()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('another native sign-in already open: nothing to say (it will answer)', async () => {
    google.signIn.mockRejectedValue(nativeError(statusCodes.IN_PROGRESS));
    const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
    await expect(request()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('a token-less success is passed on as such (the gateway refuses it)', async () => {
    google.signIn.mockResolvedValue(signedIn(null) as never);
    const request = createGoogleIdTokenRequest({ webClientId: WEB }, 'android');
    await expect(request()).resolves.toEqual({ kind: 'credential', idToken: null });
  });

  it('a forgotten previous account that cannot be cleared never blocks the sign-in', async () => {
    google.signOut.mockRejectedValue(new Error('no previous user'));
    const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
    await expect(request()).resolves.toEqual({ kind: 'credential', idToken: 'google.id.token' });
  });

  describe('a native failure', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it('Android DEVELOPER_ERROR (package / SHA-1 not registered): failed; development builds name the code and the SDK message', async () => {
      google.signIn.mockRejectedValue(nativeError('10'));
      const request = createGoogleIdTokenRequest({ webClientId: WEB }, 'android');
      await expect(request()).resolves.toEqual({ kind: 'failed' });
      expect(warn).toHaveBeenCalledWith('[BeautIzzy] Google Sign-In failed natively: 10 — native 10');
    });

    it('iOS SIGN_IN_ERROR (a binary without the Google URL scheme): failed, the native cause shown in development', async () => {
      const cause =
        'Your app is missing support for the following URL schemes: com.googleusercontent.apps.123456789012-iosiosiosiosiosiosiosiosiosios34';
      google.signIn.mockRejectedValue(Object.assign(new Error(cause), { code: 'SIGN_IN_ERROR' }));
      const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
      await expect(request()).resolves.toEqual({ kind: 'failed' });
      expect(warn).toHaveBeenCalledWith(`[BeautIzzy] Google Sign-In failed natively: SIGN_IN_ERROR — ${cause}`);
    });

    it('an error without code is failed too, never thrown', async () => {
      google.signIn.mockRejectedValue(new Error('boom'));
      const request = createGoogleIdTokenRequest({ webClientId: WEB, iosClientId: IOS }, 'ios');
      await expect(request()).resolves.toEqual({ kind: 'failed' });
    });
  });
});
