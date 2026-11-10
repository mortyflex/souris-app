// BeautIzzy — the device side of Google and Apple sign-in (Expo)
//
// The ONLY place the native modules of social sign-in are touched:
//
//   Google  @react-native-google-signin/google-signin (free « Original » API) — the
//           Google Sign-In SDK on iOS, Google Play services on Android. It returns a
//           Google ID token; Supabase verifies it (signInWithIdToken). The professional
//           sees Google's own account chooser, never the Supabase project domain.
//   Apple   expo-apple-authentication — the native iOS sheet. Never offered on
//           Android (no web Apple flow in this phase).
//   nonce   expo-crypto — 32 random bytes; Apple receives its SHA-256, Supabase
//           the raw value, and verifies that the token carries its hash. The free
//           Google API takes no nonce (docs/architecture/AUTH.md §4b).
//
// The Supabase auth gateway receives this as `SocialAuthPlatform`; tests
// inject a fake. Nothing here logs a token, a nonce or a profile.

import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import type { AppleCredentialResult, GoogleCredentialResult, SocialAuthPlatform } from '../supabase/auth-gateway';

import { readGoogleSignInConfig, type GoogleSignInConfig } from './google-sign-in-config';

/** expo-apple-authentication's code for a sheet the professional closed. */
const APPLE_CANCELLED = 'ERR_REQUEST_CANCELED';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The native Google request. Exported for tests: `config` is the build's
 * client configuration (undefined: this build offers no Google sign-in).
 */
export function createGoogleIdTokenRequest(config: GoogleSignInConfig | undefined, platform: string) {
  let configured = false;

  return async function requestGoogleIdToken(): Promise<GoogleCredentialResult> {
    // Never start the SDK without its configuration: on iOS a missing URL
    // scheme is a native exception, not an error.
    if (config === undefined) return { kind: 'not-configured' };
    try {
      if (!configured) {
        GoogleSignin.configure({
          webClientId: config.webClientId,
          ...(config.iosClientId !== undefined ? { iosClientId: config.iosClientId } : {}),
          // An ID token only: no server auth code, no Google API access.
          offlineAccess: false,
        });
        configured = true;
      }
      if (platform === 'android') {
        // Offers Google's own update dialog when Play services are outdated.
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      // Always the account chooser: the SDK otherwise reuses the account of
      // the previous attempt silently (Android) — a phone shared with another
      // professional must never sign the wrong Google account in. Only the
      // SDK's own memory is cleared; the BeautIzzy session is Supabase's.
      await GoogleSignin.signOut().catch(() => null);
      const response = await GoogleSignin.signIn();
      if (isCancelledResponse(response)) return { kind: 'cancelled' };
      return { kind: 'credential', idToken: response.data.idToken };
    } catch (error) {
      if (isErrorWithCode(error)) {
        // Another native sign-in is already open: it will answer, this one has nothing to say.
        if (error.code === statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
        if (error.code === statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'unavailable' };
        if (__DEV__) {
          // The code and the SDK's own description — never a token: the native module
          // rejects with fixed texts or an exception description. Android DEVELOPER_ERROR
          // is « 10 » (package name or SHA-1 not registered); iOS SIGN_IN_ERROR (debug
          // builds only — a release build crashes instead) names, among others, a URL
          // scheme the binary lacks: regenerate ios/ (prebuild) and rebuild.
          console.warn(`[BeautIzzy] Google Sign-In failed natively: ${error.code} — ${error.message}`);
        }
      }
      return { kind: 'failed' };
    }
  };
}

function createExpoSocialAuthPlatform(googleConfig: GoogleSignInConfig | undefined): SocialAuthPlatform {
  return {
    requestGoogleIdToken: createGoogleIdTokenRequest(googleConfig, Platform.OS),

    async isAppleSignInAvailable(): Promise<boolean> {
      if (Platform.OS !== 'ios') return false;
      try {
        return await AppleAuthentication.isAvailableAsync();
      } catch {
        return false;
      }
    },

    async requestAppleCredential(hashedNonce: string): Promise<AppleCredentialResult> {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
        // Apple gives the name on the FIRST authorization only: later ones carry null.
        const givenName = nonEmpty(credential.fullName?.givenName);
        const familyName = nonEmpty(credential.fullName?.familyName);
        return {
          kind: 'credential',
          identityToken: credential.identityToken ?? null,
          ...(givenName !== undefined ? { givenName } : {}),
          ...(familyName !== undefined ? { familyName } : {}),
        };
      } catch (error) {
        const code = (error as { readonly code?: unknown } | null)?.code;
        return code === APPLE_CANCELLED ? { kind: 'cancelled' } : { kind: 'failed' };
      }
    },

    createNonce(): string {
      return toHex(Crypto.getRandomBytes(32));
    },

    sha256(value: string): Promise<string> {
      return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
        encoding: Crypto.CryptoEncoding.HEX,
      });
    },
  };
}

export const expoSocialAuthPlatform: SocialAuthPlatform = createExpoSocialAuthPlatform(readGoogleSignInConfig(Platform.OS));
