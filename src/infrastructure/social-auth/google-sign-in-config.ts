// BeautIzzy — native Google Sign-In: the build's Google client configuration
//
// Two PUBLIC OAuth client IDs, inlined at build time like the Supabase pair
// (process.env.EXPO_PUBLIC_* must be referenced literally):
//
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  the « Web application » client the build's Supabase
//                                     project lists first under Providers › Google › Client IDs.
//                                     Passed to the SDK on both platforms, so the ID token's
//                                     audience is that client — Android cannot get a token without it.
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  the « iOS » client of THIS build's bundle identifier
//                                     (com.mortyflex.sourisapp.dev for Staging development builds,
//                                     com.mortyflex.sourisapp for Production). app.config.js derives
//                                     the reversed-client-ID URL scheme from the same variable.
//
// Client IDs are not secrets; a client SECRET never enters the app. The
// Android OAuth clients (package name + SHA-1) carry no value the app reads.
//
// iOS raises an uncaught native exception — a crash in a release build — when
// sign-in starts without the URL scheme in Info.plist. The scheme is written
// at prebuild from the SAME variable this module reads, so a build prebuilt
// and bundled with the same variables (EAS) has both or neither; a local
// development build must be prebuilt again after the variable changes
// (docs/architecture/AUTH.md §4b). Without a valid iOS client ID, native
// sign-in is never started on iOS.

/** `<project number>-<id>.apps.googleusercontent.com`, the shape Google issues. */
const CLIENT_ID_PATTERN = /^([0-9]+-[a-z0-9]+)\.apps\.googleusercontent\.com$/;

export interface GoogleSignInConfig {
  readonly webClientId: string;
  /** Present on iOS only. */
  readonly iosClientId?: string;
}

export interface RawGoogleSignInConfig {
  readonly webClientId: string | undefined;
  readonly iosClientId: string | undefined;
}

function readClientId(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return CLIENT_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Pure: the configuration native Google Sign-In may start with on `platform`,
 * or undefined when this build cannot (a missing or malformed client ID, a
 * platform without the native SDK). Never throws: an unconfigured build simply
 * offers no Google sign-in.
 */
export function resolveGoogleSignInConfig(raw: RawGoogleSignInConfig, platform: string): GoogleSignInConfig | undefined {
  const webClientId = readClientId(raw.webClientId);
  if (webClientId === undefined) return undefined;
  if (platform === 'android') return { webClientId };
  if (platform !== 'ios') return undefined;
  const iosClientId = readClientId(raw.iosClientId);
  return iosClientId === undefined ? undefined : { webClientId, iosClientId };
}

/**
 * Pure: the iOS URL scheme Google redirects to — the reversed client ID
 * (`com.googleusercontent.apps.<id>`). app.config.js applies the same rule.
 */
export function googleIosUrlScheme(iosClientId: string): string | undefined {
  const match = CLIENT_ID_PATTERN.exec(iosClientId.trim());
  return match ? `com.googleusercontent.apps.${match[1]}` : undefined;
}

/** Reads the build-time environment for `platform`. */
export function readGoogleSignInConfig(platform: string): GoogleSignInConfig | undefined {
  return resolveGoogleSignInConfig(
    {
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    },
    platform,
  );
}
