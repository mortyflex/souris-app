# BeautIzzy — First TestFlight build (pilot)

Release notes for the first iOS TestFlight build. Short on purpose: what must be configured
outside the repository, what the build does and does NOT provide, and what to verify on a device.

## 1. Status of this build

```text
SQLite            the operational storage: Clients, Services, Appointments, Products, Sales —
                  the app reads and writes the device only
Supabase          Auth identity + the `businesses` row + the operational mirror of a SYNCHRONIZED
                  Business (Cloud Sync V1C push, V1D pull / restore, V1D.1 seamless bootstrap —
                  docs/architecture/CLOUD_SYNC.md)
Cloud Sync        automatic: first upload, push + pull, new-device restore. Requires the
                  V1C and V1D migrations on the project (§3)
```

Consequences for the pilot:

- a **cloud backup and restore exist, with nothing to do** (CLOUD_SYNC.md §17). A brand-new account
  creates its remote copy from its first record, on its own, while the app is open and online
  (within about two minutes); data that already existed on a device bound to an EMPTY Business is
  uploaded the same way. There is no approval, no prompt and no sync screen;
- deleting the app, losing the phone or changing phone no longer loses the data: after sign-in on
  the empty device, BeautIzzy restores the Business by itself and the data appears in every tab.
  Meanwhile BeautIzzy shows « Récupération de vos données… ». Offline or on a failing network — at
  that moment or at ANY later launch of a device that holds no data and never synchronized — it does NOT open an
  empty application: it
  shows "Impossible de récupérer vos données" with « Réessayer » (and keeps retrying on its own),
  so nothing can be created on top of data that has not arrived yet. A device that already holds
  its data is never held back and keeps working offline;
- **Product images are NOT restored** (V1F): a restored Product has no photo until it is taken
  again;
- a TestFlight update keeps the data (same bundle identifier, same SQLite file);
- a fresh install starts EMPTY (production first-run seed). The development seed (synthetic
  address book, pilot catalogs, Agenda fixtures) and the development sync control are not part of
  release bundles.

## 2. EAS configuration

```text
bundle identifier   com.mortyflex.sourisapp            app.json
marketing version   app.json `expo.version`            bump by hand for a new App Store version
iOS build number    remote (`appVersionSource`), `autoIncrement` on the production profile
native projects     generated on EAS (`/ios` is gitignored → prebuild runs in the cloud)
environment         production profile → EAS "production" environment
```

`.env` is gitignored, so it is never uploaded to EAS Build. The two public Supabase values must
exist as EAS environment variables (plain text — they ship inside the app by design), otherwise
the binary boots into the NOT_CONFIGURED account error:

```bash
npx eas-cli@latest env:push production --path .env
npx eas-cli@latest env:list production
```

Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`)
belong there. Never the secret key, `service_role`, or the database password.

Since Phase 6.1, `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (the Apple PUBLIC SDK key, `appl_…`) belongs
there too: a release build without it boots normally but cannot verify the subscription
(`unavailable`; nothing is restricted while enforcement is disabled). The Test Store key
(`EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY`) is for development bundles only and is never used by a
release build, so it need not be pushed; `env:push --path .env` would push it harmlessly. Never a
RevenueCat secret key, and never an Apple `.p8` file in the repository. Since Phase 6.2 the
offering a build reads follows the same key: a TestFlight build shows the real App Store products
and prices in the development-only preview of a debug bundle only — a release bundle has no
preview and no paywall route — while a debug bundle shows the Test Store products, whose prices
may differ from Apple's; this is expected.

## 3. Supabase Dashboard (manual)

Authentication › URL Configuration:

```text
Site URL         sourisapp://sign-in        (replaces http://localhost:3000)
Redirect URLs    sourisapp://sign-in        (add; remove any localhost entry)
```

The app sends `emailRedirectTo = sourisapp://sign-in` on sign-up and on "Renvoyer l'email"
(`src/infrastructure/supabase/auth-gateway.ts`). A redirect that is not allow-listed silently
falls back to the Site URL, hence both settings.

Also confirm:

- Authentication › Sign In / Providers › Email: "Confirm email" enabled;
- Authentication › Emails: the default "Confirm signup" template (`{{ .ConfirmationURL }}`);
  the built-in mailer is rate-limited to a few emails per hour — enough for a pilot, configure
  custom SMTP before widening the test group;
- Project Settings › API Keys: the app uses the publishable key only;
- every file under `supabase/migrations` is applied, in order (`supabase/README.md`), and RLS is
  enabled on every table. Without the V1C migration nothing syncs; without the V1D one the push
  works but no restore or pull is possible.

## 4. Email confirmation flow

```text
sign-up → "Vérifiez votre boîte mail" → link opened on the phone
  → Supabase verifies the address in the browser → redirects to sourisapp://sign-in
  → BeautIzzy opens on "Connexion" → the owner signs in with their password
```

The app does not consume the tokens carried by the redirect (`detectSessionInUrl: false`); the
session always comes from a password sign-in. A link opened on another device (computer) still
confirms the address; the browser simply cannot open BeautIzzy there.

## 5. Real-device checklist (not automated)

- [ ] fresh install starts on Welcome, with empty data after onboarding;
- [ ] sign-up → email received → link returns to BeautIzzy on the sign-in screen (app running, and
      app killed);
- [ ] sign-in, kill, relaunch offline → app usable;
- [ ] Plus tab shows no "Développement" section;
- [ ] first upload: new account → create a first Client → keep the app open (≤ ~2 min) → the row
      exists in Supabase, with no prompt and without leaving the app;
- [ ] new-device restore (a Business already synchronized): sign in on a fresh install → NO prompt
      → data visible in every tab (Products without photos); airplane mode right after sign-in →
      "Impossible de récupérer vos données", no tab bar, nothing can be created; back online →
      « Réessayer » → data visible;
- [ ] barcode scan: camera permission prompt shows the French description; denial is recoverable;
- [ ] product photo from camera and from the photo library;
- [ ] safe areas, keyboard, sheets, and agenda gestures on the pilot iPhone.
