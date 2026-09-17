# Souris — First TestFlight build (pilot)

Release notes for the first iOS TestFlight build. Short on purpose: what must be configured
outside the repository, what the build does and does NOT provide, and what to verify on a device.

## 1. Status of this build

```text
SQLite            the operational storage: Clients, Services, Appointments, Products, Sales
                  live on the device only
Supabase          Auth identity + the `businesses` row, nothing else
Cloud Sync        NOT ready: V1C (upload / push) and V1D (pull / new-device restore) are not
                  implemented (docs/architecture/CLOUD_SYNC.md §1)
```

Consequences for the pilot:

- there is **no cloud backup and no restore**. Deleting the app, losing the phone, or changing
  phone loses the operational data;
- a TestFlight update keeps the data (same bundle identifier, same SQLite file); an uninstall
  does not;
- the first TestFlight must be treated as **pilot testing, not as the sole production storage**.
  Keep the existing agenda / client tool as the reference until V1C + V1D ship;
- a fresh install starts EMPTY (production first-run seed). The development seed (synthetic
  address book, pilot catalogs, Agenda fixtures) is not part of release bundles.

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
- both `supabase/migrations` are applied and RLS is enabled on every table.

## 4. Email confirmation flow

```text
sign-up → "Vérifiez votre boîte mail" → link opened on the phone
  → Supabase verifies the address in the browser → redirects to sourisapp://sign-in
  → Souris opens on "Connexion" → the owner signs in with their password
```

The app does not consume the tokens carried by the redirect (`detectSessionInUrl: false`); the
session always comes from a password sign-in. A link opened on another device (computer) still
confirms the address; the browser simply cannot open Souris there.

## 5. Real-device checklist (not automated)

- [ ] fresh install starts on Welcome, with empty data after onboarding;
- [ ] sign-up → email received → link returns to Souris on the sign-in screen (app running, and
      app killed);
- [ ] sign-in, kill, relaunch offline → app usable;
- [ ] Plus tab shows no "Développement" section;
- [ ] barcode scan: camera permission prompt shows the French description; denial is recoverable;
- [ ] product photo from camera and from the photo library;
- [ ] safe areas, keyboard, sheets, and agenda gestures on the pilot iPhone.
