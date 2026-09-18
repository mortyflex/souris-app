# Souris — First TestFlight build (pilot)

Release notes for the first iOS TestFlight build. Short on purpose: what must be configured
outside the repository, what the build does and does NOT provide, and what to verify on a device.

## 1. Status of this build

```text
SQLite            the operational storage: Clients, Services, Appointments, Products, Sales —
                  the app reads and writes the device only
Supabase          Auth identity + the `businesses` row + the operational mirror of a SYNCHRONIZED
                  Business (Cloud Sync V1C push, V1D pull / restore — docs/architecture/CLOUD_SYNC.md)
Cloud Sync        push + pull + new-device restore, once a Business is synchronized. Requires the
                  V1C and V1D migrations on the project (§3)
```

Consequences for the pilot:

- a **cloud backup and restore exist once a Business is synchronized**. Synchronization of data
  that already existed on the device starts only after ONE supervised, explicit approval
  (CLOUD_SYNC.md §11.1 — no release build gives it on its own); a brand-new empty account creates
  its remote copy from its first records only after that same approval. Until it is given, the data
  lives on the device only, exactly as before;
- once synchronized: deleting the app, losing the phone or changing phone no longer loses the data.
  After sign-in on the empty device, Souris shows "Des données existent pour ce compte" and
  restores them on explicit confirmation (« Restaurer mes données », naming the Business). Nothing
  restores by itself, and nothing should be created on the new device before restoring (a device
  holding data is never merged with the remote copy — CLOUD_SYNC.md §16.11);
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
- [ ] new-device restore (a Business already synchronized): sign in on a fresh install → the
      "Des données existent pour ce compte" sheet names the Business; « Plus tard » closes it and
      creates nothing; « Restaurer mes données » → confirmation → data visible in every tab
      (Products without photos); airplane mode during the restore → non-destructive message,
      « Réessayer » succeeds once online;
- [ ] barcode scan: camera permission prompt shows the French description; denial is recoverable;
- [ ] product photo from camera and from the photo library;
- [ ] safe areas, keyboard, sheets, and agenda gestures on the pilot iPhone.
