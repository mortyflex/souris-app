# Souris — Account & Onboarding V1

## 1. Purpose

Souris now has a real user/account boundary. This document defines what the account layer is, what
it is NOT, and how the application behaves around it.

```text
Supabase   authentication, account identity, the Business profile, ownership (RLS)
SQLite     every operational record (Clients, Services, Appointments, Products, Sales) + the
           local account binding — unchanged operational database, local-first
```

Explicit non-goal of V1: **operational cloud sync**. Clients, Appointments, Services, Products, and
Sales are NOT uploaded, downloaded, backed up, or synchronized. The only remote data is the Auth
identity and the `businesses` row. The product must never claim otherwise (no "sauvegardé",
"synchronisé", "données sécurisées dans le cloud"). Cloud Sync is the next milestone.

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

`BusinessActivityType` is a stable, storage-facing vocabulary: `HAIRDRESSING | BARBER | NAILS |
ESTHETICS | LASHES_BROWS | OTHER`. French labels (Coiffure, Barbier, Onglerie, Esthétique,
Cils & sourcils, Autre) are presentation only (`src/features/business/presentation.ts`).

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

Never logged, never stored in Souris tables, never rendered: passwords, access tokens, refresh
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
"Retour à la connexion" and a restrained resend. The link is opened in the browser; the app does
not implement deep-link verification in V1. An already registered email is reported as such.

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

Business setup submit (`createBusiness`):

1. local validation (`business-form.ts`);
2. remote insert with `owner_user_id = auth user`;
3. local binding (`bindLocalDatabaseToBusiness`, one SQLite transaction — see PERSISTENCE.md §4b);
4. state becomes `ready` only after the transaction committed → the root gate enters the app.

Idempotence: if the remote insert fails, nothing is bound and the form keeps its draft. If the
remote row exists but binding failed, `retry` runs the resolution (lookup → bind) and a
re-submitted form receiving `ALREADY_EXISTS` (unique `owner_user_id`) also resolves to the existing
row. A second Business is never created. A row whose owner is not the signed-in user is refused
(`OWNER_MISMATCH`).

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
auth                      (auth): Welcome → sign-up / sign-in / verify-email
onboarding                (onboarding)/business
app                       (app): tabs + every existing sheet route, with the operational
                          providers and CurrentBusinessProvider (bound Business id)
device-account-conflict   AccountConflictScreen
auth-error / business-error  AccountUnavailableScreen ("Réessayer", optional "Se déconnecter")
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
enregistrées sur cet appareil." — never "sauvegardées" or "synchronisées". After sign-out the
root gate returns to Welcome; the same owner signing back in reconnects immediately to the local
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
