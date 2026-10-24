// BeautIzzy — build variants (APP_VARIANT)
//
//   unset           BeautIzzy          com.mortyflex.sourisapp        release builds (EAS production,
//                                                                    TestFlight) and a plain `expo run:ios`
//   development     BeautIzzy Dev      com.mortyflex.sourisapp.dev    the everyday development build
//                                                                    (EAS `development` profile)
//   apple-sandbox   BeautIzzy Sandbox  com.mortyflex.sourisapp        Phase 6.4A: a DEBUG build carrying the
//                                                                    App Store bundle identifier so RevenueCat
//                                                                    can read the real Apple products in the
//                                                                    Apple Sandbox — read-only, never a purchase
//
// The variant selects the name, the identifiers and ONE flag read by the
// RevenueCat wiring (`extra.revenueCat.appleSandbox`). It never decides the
// compilation: debug versus release is `__DEV__`. The Apple Sandbox flag is
// honoured in a debug bundle only, and only when the bundle identifier of this
// very configuration is the App Store one — the same APP_VARIANT value sets
// both, so the `.dev` identifier can never carry it. The variant is meant for
// `npx expo run:ios`; no eas.json profile sets it.
//
// The App Store bundle identifier itself stays in app.json.

const APP_VARIANT = process.env.APP_VARIANT;
const IS_DEV = APP_VARIANT === "development";
const IS_APPLE_SANDBOX = APP_VARIANT === "apple-sandbox";

export default ({ config }) => ({
  ...config,
  name: IS_DEV ? "BeautIzzy Dev" : IS_APPLE_SANDBOX ? "BeautIzzy Sandbox" : config.name,
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
