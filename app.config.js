// BeautIzzy — build variants (APP_VARIANT)
//
//   unset           BeautIzzy          com.mortyflex.sourisapp        release builds (EAS production,
//                                                                    TestFlight) and a plain `expo run:ios`
//   development     BeautIzzy Dev      com.mortyflex.sourisapp.dev    the everyday development build
//                                                                    (EAS `development` profile)
//   apple-sandbox   BeautIzzy Sandbox  com.mortyflex.sourisapp        Phase 6.4A/B: a DEBUG build carrying the
//                                                                    App Store bundle identifier so RevenueCat
//                                                                    can read the real Apple products in the
//                                                                    Apple Sandbox, and — from the developer
//                                                                    preview only, for declared test accounts
//                                                                    only — run Sandbox purchases and restores
//
// The variant selects the name, the identifiers and ONE flag read by the
// RevenueCat wiring (`extra.revenueCat.appleSandbox`). It never decides the
// compilation: debug versus release is `__DEV__`. The Apple Sandbox flag is
// honoured in a debug bundle only, and only when the bundle identifier of this
// very configuration is the App Store one — the same APP_VARIANT value sets
// both, so the `.dev` identifier can never carry it. The variant is meant for
// `npx expo run:ios`; no eas.json profile sets it.
//
// The development variant also declares its own URL scheme, `sourisapp-dev`.
// iOS gives no guarantee about which app opens a scheme two installed apps
// declare, and Android asks: with the release app (`sourisapp`) on the same
// phone, an Auth email link sent by the development build could open the
// release app — which holds no PKCE verifier — and the reverse. The Auth
// redirect URLs are built from this scheme (src/infrastructure/supabase/
// auth-gateway.ts). The release and Apple Sandbox schemes stay `sourisapp`.
//
// The App Store bundle identifier itself stays in app.json.
//
// Native Google Sign-In (docs/architecture/AUTH.md §4b): the iOS SDK returns
// to the reversed iOS client ID (`com.googleusercontent.apps.<id>`), which
// must be a URL scheme of the binary — without it, starting sign-in is a
// native exception (a crash in a release build). The scheme is derived here
// from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, the variable the JavaScript reads
// (src/infrastructure/social-auth/google-sign-in-config.ts, same rule), so a
// build prebuilt and bundled with the same variables (EAS) has both or
// neither. Metro re-reads the variable at every bundling, the native project
// only at prebuild: after setting or changing it locally, prebuild and rebuild
// (AUTH.md §4b). That client ID must be the iOS client of THIS
// build's bundle identifier. Without it the plugin is not applied and the app
// never starts Google sign-in on iOS. Android needs no plugin option.

const APP_VARIANT = process.env.APP_VARIANT;
const IS_DEV = APP_VARIANT === "development";
const IS_APPLE_SANDBOX = APP_VARIANT === "apple-sandbox";

const GOOGLE_CLIENT_ID_PATTERN = /^([0-9]+-[a-z0-9]+)\.apps\.googleusercontent\.com$/;

/** The reversed iOS client ID, or undefined when the variable is missing or malformed. */
function googleIosUrlScheme(iosClientId) {
  const match = GOOGLE_CLIENT_ID_PATTERN.exec((iosClientId ?? "").trim());
  return match ? `com.googleusercontent.apps.${match[1]}` : undefined;
}

const GOOGLE_IOS_URL_SCHEME = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);

export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(GOOGLE_IOS_URL_SCHEME
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }]]
      : []),
  ],
  name: IS_DEV ? "BeautIzzy Dev" : IS_APPLE_SANDBOX ? "BeautIzzy Sandbox" : config.name,
  scheme: IS_DEV ? "sourisapp-dev" : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV
      ? "com.mortyflex.sourisapp.dev"
      : config.ios.bundleIdentifier,
  },
  android: {
    ...config.android,
    package: IS_DEV
      ? "com.mortyflex.sourisapp.dev"
      : (config.android?.package ?? "com.mortyflex.sourisapp"),
  },
  extra: {
    ...config.extra,
    revenueCat: { appleSandbox: IS_APPLE_SANDBOX },
  },
});
