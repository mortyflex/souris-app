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
`docs/domain/PROFESSIONS.md`) — today `HAIRDRESSING`, `NAILS`, `ESTHETICS` and `WELLNESS` (the
last three opened to the pilot professionals, October 2026). It is enforced by the setup form and never applied to an existing Business:
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

unauthenticated → startPasswordRecovery(code) → recovering-password
  completePasswordRecovery(password)   → authenticated (live)
  cancelPasswordRecovery()             → unauthenticated (THIS device's recovery session is signed out)
restart while a recovery is unfinished → unauthenticated (never the stored session, never offline)
```

Operations: `signUp`, `signIn`, `signOut`, `resendSignUpConfirmation`, `requestPasswordReset`,
`startPasswordRecovery`, `completePasswordRecovery`, `cancelPasswordRecovery`, `retry`. Outcomes
carry stable codes (`INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `EMAIL_ALREADY_REGISTERED`,
`WEAK_PASSWORD`, `INVALID_EMAIL`, `RATE_LIMITED`, `RECOVERY_LINK_EXPIRED`, `RECOVERY_LINK_INVALID`,
`SAME_PASSWORD`, `EMAIL_DELIVERY_UNAVAILABLE`, `NETWORK`, `NOT_CONFIGURED`, `UNKNOWN`) mapped to one
French sentence each in `src/features/auth/messages.ts`. `EMAIL_DELIVERY_UNAVAILABLE` is Supabase's
`email_address_not_authorized`: the default sender only reaches the project team, so a real address is
refused until custom SMTP exists (`docs/release/AUTH_EMAILS.md`). It is independent of whether an
account exists, so it reveals nothing.

Every password input is `PasswordField`: hidden by default, a trailing eye (« Afficher / Masquer le
mot de passe », 32 pt + 8 pt hit slop) that changes only `secureTextEntry` — the value, the focus and
the autofill hints (`password` / `new-password`) are untouched. iOS empties a secure field on the first
keystroke after it is hidden again or refocused (reported as `""`, then the keystroke); the field reads
that first change through `readSecureEntryChange` (`src/features/auth/secure-entry.ts`) so nothing typed
is lost. Android never empties the field and is never watched.

The session listener is registered once per gateway and removed on unmount. `INITIAL_SESSION` is
ignored (restoreSession already covers it), and so is `PASSWORD_RECOVERY` (`startPasswordRecovery`
reports it); `SIGNED_IN` / `TOKEN_REFRESHED` / `SIGNED_OUT` update the state — except that, during a
recovery, an event carrying a user is ignored (§4a).

Email confirmation: `signUp` returns either an immediate session (confirmation disabled) or
`confirmation-required` (confirmation enabled) → the "Vérifiez votre boîte mail" screen with
"Retour à la connexion" and a restrained resend. Sign-up and resend pass
`emailRedirectTo = sourisapp://sign-in` (`EMAIL_CONFIRMATION_REDIRECT_URL`): the link is verified
in the browser, then returns to the app on the sign-in screen, never to the Supabase Site URL
(localhost by default). The URL must be allow-listed in the Supabase Dashboard
(docs/release/TESTFLIGHT.md §3). The app does not consume the tokens carried by that redirect in
V1: the owner signs in with their password. An already registered email is reported as such.

With the PKCE flow (§4a) the confirmation redirect is `sourisapp://sign-in?code=…` (or
`?error=…` for an expired link). Supabase confirms the address at its `/verify` step, BEFORE the
redirect; the app never exchanges that code — `sign-in` reads no route parameter and only the
reset screen calls the one exchange (`startPasswordRecovery`, source-guarded by a test) — so
confirming never opens a session, exactly as before PKCE. A confirmation code pasted on the reset
route is refused: the exchange reports a non-recovery code, its session is signed out at once.

### 4a. Password recovery (M2)

```text
Se connecter › « Mot de passe oublié ? »
  → (auth)/forgot-password  email prefilled → requestPasswordReset(email)
       resetPasswordForEmail(email, { redirectTo: sourisapp://reset-password })
       « Si un compte existe pour cette adresse, un lien vient d’être envoyé à … » — always, so the
       screen never tells whether an account exists; « Renvoyer le lien » restrained
  → the email (supabase/templates/auth/reset-password.html) → {{ .ConfirmationURL }}
  → Supabase verifies the link → sourisapp://reset-password?code=<one-time code>
       or ?error=…&error_code=otp_expired when it expired or was already used
  → (auth)/reset-password   readRecoveryLink(params) → startPasswordRecovery(code), ONCE
       recovering-password  « Nouveau mot de passe », typed twice (8 characters minimum)
         → updateUser({ password }) → authenticated (live) → the normal root gate
         « Annuler » → discardPasswordRecovery (signOut scope `local`) → « Se connecter »
       failed               « Ce lien a expiré » / « Lien inutilisable » → « Demander un nouveau lien »
```

Deep-link security:

- the Supabase client uses `flowType: 'pkce'` (`src/infrastructure/supabase/client.ts`): the link
  returns a one-time code, never an access or refresh token. Exchanging it requires the code
  verifier stored by the installation that requested the reset — an app intercepting the custom
  scheme gets nothing usable. Consequence, said in the screen and the email: the link must be
  opened on the phone that asked; a link opened elsewhere (another phone, a reinstall) reads
  `RECOVERY_LINK_INVALID`;
- the code is exchanged at most once per screen; Supabase consumes it (and the verifier) on the
  first exchange, whatever its outcome — a network failure therefore asks for a new link;
- a link carrying an error is never exchanged; a missing or malformed code is refused before any
  network call (`src/features/auth/recovery-link.ts`);
- a recovery session is not a sign-in: `recovering-password` routes to the `(auth)` group only;
  Business resolution, sync, access and every `status === 'authenticated'` consumer see nothing
  until the password is saved, and session events of the recovery session are ignored;
- a recovery link never replaces a signed-in session: `reset-password` lives in `(auth)`, which is
  not mounted while signed in, and `startPasswordRecovery` refuses while authenticated;
- the code, the new password and the session never reach a log, the UI or a BeautIzzy table
  (tested); the route parameter is the only place the code transits.

Unfinished recovery — the pending-recovery marker (`src/infrastructure/supabase/auth-gateway.ts`):
supabase-js SAVES the recovery session during the exchange, exactly like a sign-in, so a restart
would otherwise restore it and open the app without a new password. One key,
`beautizzy.auth.password-recovery-pending`, in the same device storage as the session (no token,
no email, no id):

```text
set      before the exchange (an interruption mid-exchange is covered)
cleared  password saved · recovery abandoned · exchange failed · password sign-in · sign-up with
         a session · sign-out
while set
  restoreSession()   discards the stored session (signOut scope `local`) and reports
                     `unauthenticated` — checked before the session, so the offline fallback
                     (`unavailable` + local binding) cannot open the bound Business either;
                     offline, if supabase-js cannot remove it, the marker stays and the next
                     launch tries again
  onSessionChange    forwards no event carrying a session (token refresh, USER_UPDATED,
                     SIGNED_IN) — only a sign-out
```

After a restart the professional asks for a new link (the old one is consumed) or signs in with
her current password. Abandoning (« Annuler », or a restart) signs out THIS device only: the
account's other devices keep their session.

Account and data: nothing local is read or written by recovery. Saving the password signs in the
same account; the binding rules of §5 / §6 then apply exactly as after a sign-in (same owner →
ready; another owner on a bound device → `DEVICE_ACCOUNT_CONFLICT`, reached only after the password
is saved). Supabase may sign the account's other sessions out after a password change — they sign
back in with the new password; their local data is untouched.

Five-minute window (Supabase Auth, not configurable on hosted projects). The PKCE flow state of a
recovery expires `FlowStateExpiryDuration` (300 s) after the REQUEST — `FlowState.IsExpired`
counts from `CreatedAt` for every method except magic links — whatever the email link's own
validity (`mailer_otp_exp`, one hour). A link opened later is still consumed by `/verify`, then
the exchange answers `flow_state_expired` → « Ce lien a expiré ». Observed on Staging,
2 November 2026: links opened 6 and 11 minutes after the request both failed that way.

Each code is judged on its own. Expo Router can bring `reset-password` back with a code already
spent (the root stack rebuilt from the last opened URL after the conflict, error or loading
surfaces of §7, e.g. signing out of `DEVICE_ACCOUNT_CONFLICT`), or hand a NEW link to the
instance still in the stack (iOS). The screen exchanges each distinct code once, a refusal belongs
to the code refused, and the AuthProvider remembers in memory only (never persisted or logged) the
codes already handed to the exchange: a spent code never reaches the network again and leads to
« Se connecter ». Observed on Staging, 2 November 2026, before the fix: « Lien inutilisable »
after signing out (Android), and a fresh valid link answered with an earlier refusal (iOS).

One scheme per build. The redirect URLs are built from the scheme of the running build
(`resolveAppScheme(Constants.expoConfig.scheme)`): the release and Apple Sandbox builds declare
`sourisapp` (unchanged), the development build (`APP_VARIANT=development`, app.config.js)
declares `sourisapp-dev`. iOS does not define which app opens a scheme two installed apps
declare, and Android asks: with a shared scheme, a link asked by one build could open the other,
which holds no PKCE verifier. The development build is started from Metro with the same variant
(`npm run dev`); its native project must be rebuilt after a scheme change.

Supabase Dashboard (manual, Staging then Production): the build's `<scheme>://reset-password` in
Authentication › URL Configuration › Redirect URLs — otherwise the link falls back to the Site
URL and the code is ignored. Production: `sourisapp://sign-in` and `sourisapp://reset-password`;
Staging (development build): `sourisapp-dev://sign-in` and `sourisapp-dev://reset-password`.
Templates, SMTP and the sending domain: `docs/release/AUTH_EMAILS.md`.

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

Signing out ends THIS device's session only: `signOut({ scope: 'local' })`. The supabase-js
default is `global`, which revokes every refresh token of the account — the professional's other
phones and tablets would be signed out at their next refresh. No BeautIzzy path ever asks for a
global (or `others`) sign-out; a source-level test enforces it
(`src/infrastructure/supabase/__tests__/sign-out-scope-boundary.test.ts`). Every sign-out
button (Compte sheet, conflict screen, unavailable screen, first-sync data screen) goes through
the same `AuthProvider.signOut` → `AuthGateway.signOut`.

Offline, supabase-js removes the stored session when the access token is still valid, but KEEPS
it when the token has expired (it must refresh before signing out, and cannot). The
sign-out-pending marker, `beautizzy.auth.sign-out-pending` (same storage, no token, no id),
covers that case exactly like the pending-recovery marker:

```text
set      before the sign-out request
cleared  the stored session is really gone (a sign-out without error) · a new session replaced it
         (password sign-in, sign-up with a session, recovery exchange)
while set
  restoreSession()   signs out again (scope `local`) and reports `unauthenticated` — before the
                     session, so the offline fallback cannot reopen the bound Business
  onSessionChange    forwards no event carrying a session (the first token refresh once the
                     network is back cannot sign the device in again) — only a sign-out.
                     Such an event means the kept session is usable again: it retries the
                     local sign-out at once (deferred out of the supabase-js callback),
                     without waiting for the next launch
  single flight      a launch, a refresh and the button share one sign-out; a failure leaves the
                     marker for the next refresh or launch — never a timer, so no loop
  explicit sign-in   password sign-in, sign-up and the recovery exchange wait for an in-flight
                     sign-out, and no event seen while they run is taken for the leftover session
```

Local SQLite data is untouched. Wording: "Les données restent enregistrées sur cet appareil." —
which is exactly what happens (sign-out neither uploads nor removes anything). When the outbox
holds unsent changes at the moment the professional asks to sign out, the Compte confirmation
says so: they stay on this device and leave at the next connection of the same account here.
A run in flight when the session ends cannot settle or reject anything: without the owner's
session the sync functions answer 42501 (`FORBIDDEN`), which leaves the entry pending with no
backoff, and no run starts while signed out. After sign-out the root gate returns to Discovery
(the signed-out entry); the same owner signing back in reconnects immediately to the local
binding and sends what was pending; a different owner gets DEVICE_ACCOUNT_CONFLICT.

A password change is a separate, server-side matter: Supabase Auth may end the account's other
sessions when the password is updated (a recovery). That is the intended security effect of a
recovery, not a sign-out.

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
