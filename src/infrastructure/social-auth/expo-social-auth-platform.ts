// BeautIzzy — the device side of Google and Apple sign-in (Expo)
//
// The ONLY place the native modules of social sign-in are touched:
//
//   Google  expo-web-browser `openAuthSessionAsync` — ASWebAuthenticationSession
//           on iOS, a Custom Tab on Android. No Google SDK: the provider page is
//           Google's own, the result is the Supabase redirect.
//   Apple   expo-apple-authentication — the native iOS sheet. Never offered on
//           Android (no web Apple flow in this phase).
//   nonce   expo-crypto — 32 random bytes; Apple receives its SHA-256, Supabase
//           the raw value, and verifies that the token carries its hash.
//
// The Supabase auth gateway receives this as `SocialAuthPlatform`; tests
// inject a fake. Nothing here logs a token, a nonce or a profile.

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { AppleCredentialResult, BrowserAuthResult, SocialAuthPlatform } from '../supabase/auth-gateway';

/** expo-apple-authentication's code for a sheet the professional closed. */
const APPLE_CANCELLED = 'ERR_REQUEST_CANCELED';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const expoSocialAuthPlatform: SocialAuthPlatform = {
  async openAuthSession(url: string, redirectUrl: string): Promise<BrowserAuthResult> {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
    return result.type === 'success' ? { kind: 'redirect', url: result.url } : { kind: 'closed' };
  },

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
