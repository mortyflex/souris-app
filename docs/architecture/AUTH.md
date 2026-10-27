# BeautIzzy — Account & Onboarding V1

## 1. Purpose

BeautIzzy now has a real user/account boundary. This document defines what the account layer is, what
it is NOT, and how the application behaves around it.

```text
Supabase   authentication, account identity, the Business profile, ownership (RLS)
SQLite     every operational record (Clients, Services, Appointments, Products, Sales) + the
           local account binding — unchanged operational database, local-first
```

Account & Onboarding V1 itself synchronizes nothing. Since Cloud Sync V1C
(`docs/architecture/CLOUD_SYNC.md` §15) the operational data of a bound Business is UPLOADED
(owner-only RLS) once the session is live, and since Cloud Sync V1D (§16) it comes BACK: a
synchronized Business is pulled incrementally, and an empty device bound to a populated Business
(reinstall, new phone) is restored. Since Cloud Sync V1D.1 (§17) both first syncs are automatic — no
approval, no prompt, no sync screen — and only under a LIVE session: nothing is uploaded or
restored on the offline fallback or signed out. An EMPTY device opens the application only once
its data is known IN THE CURRENT SESSION (restored, or the account found empty — CLOUD_SYNC.md §17.3); otherwise the root
gate shows a recoverable "Impossible de récupérer vos données" state. So a cloud backup / restore now exists, with two
limits the copy must respect: a device holding its own data is never merged with a populated remote
Business (`RECONCILIATION_REQUIRED`), and Product images are not restored until V1F.
Wording that promises more ("toutes vos données sont sauvegardées") stays out; the account
screens are unchanged.

---

## 2. Auth vs Business identity

Two questions, two providers:

```text
AuthProvider              who is signed in?                 src/features/auth/session
BusinessSessionProvider   which Business does this user own? src/features/business/session
                          is onboarding completed?
                          is the local database bound?
```

`AuthUser` = `{ id, email? }`. The email belongs to Auth; it is never duplicated into the Business
profile or SQLite. `BusinessProfile` (`src/domain/business`) = `{ id, ownerUserId, ownerFirstName,
ownerLastName?, name, activityType, phone?, createdAt, updatedAt }`.

`BusinessActivityType` is a stable, storage-facing vocabulary of ONE primary activity:
`HAIRDRESSING | BARBER | NAILS | ESTHETICS | LASHES_BROWS | MAKEUP | WELLNESS | OTHER`. French
labels (Coiffure, Barbier, Onglerie, Esthétique, Cils & sourcils, Maquillage, Bien-être, Autre) are
presentation only (`src/features/business/presentation.ts`). Both columns are plain text, so adding
a value needs no migration. Decoding is tolerant at both boundaries (`toBusinessActivityType`, in the
Supabase gateway and the local `business_profile` store): a stored value this build does not know —
one a newer build introduced — reads as `OTHER`, so the Business still resolves, binds and opens
instead of failing the bootstrap. The app never writes the activity back, so the stored value is
preserved for builds that know it; the local cache written at binding time holds the decoded value.

Which of these values a NEW Business may be created with is a separate, product-facing rule:
`PROFESSIONS` / `isProfessionAvailable` (`src/domain/business/professions.ts`,
`docs/domain/PROFESSIONS.md`) — today `HAIRDRESSING` only, `NAILS` and `ESTHETICS` announced
« Bientôt disponible ». It is enforced by the setup form and never applied to an existing Business:
restore, binding and display accept every stored value as before.

---

## 3. Boundaries

```text
src/infrastructure/supabase/
  config.ts             reads EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY (literally, inlined by
                        Expo) and validates them → SupabaseConfigurationError
  client.ts             the ONE Supabase client; session storage = expo-sqlite localStorage;
                        AppState → start/stopAutoRefresh registered once
  database-types.ts     hand-written mirror of supabase/migrations (businesses only)
  auth-gateway.ts       AuthGateway bound to supabase-js Auth, error → stable AuthFailureCode
  business-gateway.ts   BusinessGateway bound to the businesses table, row → BusinessProfile
  index.ts              createAccountGateways(): gateways for the root layout; a missing
                        configuration yields a NOT_CONFIGURED gateway instead of a crash

src/features/auth/gateway.ts        AuthGateway contract (domain-facing, no supabase types)
src/features/business/gateway.ts    BusinessGateway contract
```

Screens and providers only ever see these contracts. Tests use deterministic fakes
(`src/features/*/testing/fake-*-gateway.ts`); adapter tests exercise the mapping with hand-rolled
Supabase-shaped objects. Jest never talks to Supabase.

Never logged, never stored in BeautIzzy tables, never rendered: passwords, access tokens, refresh
tokens, session JSON, raw `AuthApiError` / PostgREST payloads.

---

## 4. Auth state machine

```text
initializing → restoreSession()
  authenticated (live)     persisted session valid (no network needed while the token is valid)
  unauthenticated          nothing stored / session genuinely dead
  authenticated (offline)  the stored session could not be refreshed (no network) AND the local
                           binding names that owner → local access continues
  error                    NOT_CONFIGURED, NETWORK without a local binding, UNKNOWN → "Réessayer"
```

Operations: `signUp`, `signIn`, `signOut`, `resendSignUpConfirmation`, `retry`. Outcomes carry stable
codes (`INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `EMAIL_ALREADY_REGISTERED`, `WEAK_PASSWORD`,
`INVALID_EMAIL`, `RATE_LIMITED`, `NETWORK`, `NOT_CONFIGURED`, `UNKNOWN`) mapped to one French
sentence each in `src/features/auth/messages.ts`.

The session listener is registered once per gateway and removed on unmount. `INITIAL_SESSION` is
ignored (restoreSession already covers it); `SIGNED_IN` / `TOKEN_REFRESHED` / `SIGNED_OUT` update
the state.

Email confirmation: `signUp` returns either an immediate session (confirmation disabled) or
`confirmation-required` (confirmation enabled) → the "Vérifiez votre boîte mail" screen with
"Retour à la connexion" and a restrained resend. Sign-up and resend pass
`emailRedirectTo = sourisapp://sign-in` (`EMAIL_CONFIRMATION_REDIRECT_URL`): the link is verified
in the browser, then returns to the app on the sign-in screen, never to the Supabase Site URL
(localhost by default). The URL must be allow-listed in the Supabase Dashboard
(docs/release/TESTFLIGHT.md §3). The app does not consume the tokens carried by that redirect in
V1: the owner signs in with their password. An already registered email is reported as such.

Password recovery is **deliberately absent** in V1: no "Mot de passe oublié ?" entry exists until
the native recovery / deep-link flow is designed properly. No dead button.

---

## 5. Business resolution and account binding

```text
authenticated user
  local business_profile present
    same owner        → ready (offline-capable)
    other owner       → DEVICE_ACCOUNT_CONFLICT
  no local binding
    offline session   → error NETWORK (a first connection needs the remote lookup)
    remote lookup by owner_user_id
      zero            → Business setup
      one             → bind locally → ready
      more than one   → error MULTIPLE_REMOTE_BUSINESSES (invariant violation, never guessed)
```

Business setup is the five-step onboarding of `docs/product/PRODUCT.md` §17 (activity → details →
reminders → starter services → setup complete), entered right after authentication: the Product
Discovery slides (the signed-out entry — there is no separate Welcome) belong to the `(auth)` group
and are never repeated here. The creation
(`createBusiness`, with `deferEntry`) happens at the reminders decision — step 3 — and nowhere else:

1. local validation (`business-form.ts`, the details step cannot continue while invalid);
2. remote insert with `owner_user_id = auth user`;
3. local binding (`bindLocalDatabaseToBusiness`, one SQLite transaction — see PERSISTENCE.md §4b);
4. the Business exists, the state stays `setup-required`: the optional reminder activation runs,
   the starter services are written against the bound Business id (normal Service store, fresh
   ids, `reloadSnapshot` so the `(app)` providers hydrate with them), the recap is shown;
5. `enterCreatedBusiness` on the last step turns the state `ready` → the root gate enters the app.
   The future subscription gate will sit at that root decision, after `ready`.

Killing the app between steps 3 and 5 loses nothing: the Business exists remotely and locally, the
next launch resolves `ready` from the binding and opens the app (no onboarding again); starter
services not yet written are simply added by hand later.

Idempotence: if the remote insert fails, nothing is bound and the form keeps its draft (the
professional may go back to the details). If the remote row exists but binding failed, `retry` runs
the resolution (lookup → bind) and a re-submitted form receiving `ALREADY_EXISTS` (unique
`owner_user_id`) also resolves to the existing row. Once the Business exists, onboarding keeps it in
state and offers no way back to the earlier steps (`canGoBack` in `onboarding-steps.ts`): a retry of
the reminder activation or of the starter write reuses it. A second Business is never created. A row
whose owner is not the signed-in user is refused (`OWNER_MISMATCH`).

---

## 6. DEVICE_ACCOUNT_CONFLICT (V1 limitation)

The SQLite database is single-business. When it is bound to owner A and owner B signs in:

- nothing from Business A is displayed;
- nothing is rebound;
- nothing is wiped;
- a dedicated explanatory screen offers "Se déconnecter".

Arbitrary multi-account switching and device restoration become safe only once Cloud Sync exists.

---

## 7. Root routing

`src/providers/root-route.ts` resolves ONE deterministic route from both states; `RootNavigator`
mounts only the matching Expo Router group through `Stack.Protected` guards:

```text
booting                   branded boot surface (same composition as the native splash)
auth                      (auth): index = Product Discovery (three optional slides, skippable,
                          the signed-out entry — no separate Welcome) → sign-up / sign-in /
                          verify-email — all in the shared first-run frame; « Déjà un compte ?
                          Se connecter » goes straight to sign-in from every slide
onboarding               (onboarding)/business — the five-step setup of a NEW Business, starting
                          at the primary activity (no Welcome, no Discovery)
app                       (app): tabs + every existing sheet route, with the operational
                          providers and CurrentBusinessProvider (bound Business id)
device-account-conflict   AccountConflictScreen
auth-error / business-error  AccountUnavailableScreen ("Réessayer", optional "Se déconnecter")
data-loading              DataLoadingScreen — an EMPTY device waiting for this session's check of its
                          account, or for its restore (« Récupération de vos données… », no action)
data-unavailable          DataUnavailableScreen — that check or restore failed, or is impossible offline
                          ("Réessayer", "Se déconnecter"). CLOUD_SYNC.md §17.3. A device that holds
                          data, or that already synchronizes (acknowledged state), never gets to
                          either state
```

Protected content never mounts while booting or signed out, so nothing flashes. The operational
session providers live inside `(app)/_layout.tsx`: signed out, no Client / Appointment state exists
in the tree.

---

## 8. Offline behavior

After a successful onboarding:

```text
kill app → no network → launch
  fonts + SQLite bootstrap (local)
  restoreSession(): valid stored session → authenticated (live)
                    expired + refresh impossible → authenticated (offline) via the local binding
  BusinessSessionProvider: local business_profile → ready, no remote call
  operational data from SQLite → app usable
```

"Temporarily offline" and "signed out" are different states: a refresh that fails for lack of
network never destroys local access. When the network returns, supabase-js refreshes on the next
`AppState` active tick and the listener upgrades the state to `live`.

---

## 9. Sign-out

Signing out clears the Supabase session (supabase-js clears the local session even when the
server call fails offline). Local SQLite data is untouched. Wording: "Les données restent
enregistrées sur cet appareil." — which is exactly what happens, whether or not the Business was
synchronized (sign-out neither uploads nor removes anything). After sign-out the
root gate returns to Discovery (the signed-out entry); the same owner signing back in reconnects immediately to the local
binding; a different owner gets DEVICE_ACCOUNT_CONFLICT.

---

## 10. Remote schema and RLS

`supabase/migrations/20260912120000_create_businesses.sql` — one table, RLS enabled, owner-only
`select` / `insert` / `update` policies (`(select auth.uid()) = owner_user_id`), no `anon` access,
no delete flow, `owner_user_id UNIQUE`, and a `before update` trigger that pins `owner_user_id` /
`created_at` and maintains `updated_at`. See `supabase/README.md` for how to apply it.

---

## 11. Environment

```text
EXPO_PUBLIC_SUPABASE_URL              https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…
```

Both come from the Supabase project Connect / API configuration and are public client
configuration. `.env.example` is versioned; `.env` and every other `.env.*` file are ignored. The
secret key, `service_role`, and the database password never enter the application.

EAS Build never receives `.env` (gitignored): store builds read the same two variables from the
EAS "production" environment (docs/release/TESTFLIGHT.md §2).
