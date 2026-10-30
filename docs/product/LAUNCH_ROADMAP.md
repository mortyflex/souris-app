# BeautIzzy — Launch Roadmap

The master roadmap from one hairdresser in Production to a public BeautIzzy launch. Each
milestone is implemented as its own phase, reviewed and approved before the next one starts
(`CLAUDE.md` §33). This document records scope, dependencies, acceptance criteria and status; the
detailed rules live in the documents each milestone points to.

Status vocabulary: **Done** (in the repository) · **Implemented locally** (in the working tree,
not committed or released yet) · **In progress** · **Next** · **Planned** · **Blocked** (a named
dependency is missing).

Last update: 30 October 2026.

---

## 1. Goal

A beauty professional installs BeautIzzy, creates her account, configures her activity and starts
working **without developer assistance**. The first external pilots are:

- a nail technician, currently on Planity (clients book online today);
- an esthetician;
- a wellness massage practitioner.

The launch is not complete until authentication, legal readiness and online booking are done:
none of them is optional or "later" for a public launch. **Online booking (M9) is a launch
priority**, not a post-launch improvement: the Planity nail technician cannot move without it.

---

## 2. Existing Production capabilities (preserve)

In use daily by a real hairdresser. Nothing in this roadmap may regress them.

| Area | What exists | Reference |
|---|---|---|
| Account | email + password sign-up, email confirmation, sign-in, offline session, device binding; password recovery implemented locally (M2) | `docs/architecture/AUTH.md` |
| Onboarding | Discovery (3 slides) → 5 setup steps on one route; Business created exactly once; existing accounts never re-enter it | `docs/product/PRODUCT.md` §17 |
| Professions | one stored `BusinessActivityType`; `PROFESSIONS` / `isProfessionAvailable` decide what a NEW Business may choose | `docs/domain/PROFESSIONS.md` |
| Catalogue | Services / Techniques (hairdressing) or one « Prestations » catalogue by categories (nails, esthetics, wellness); phases and processing time | `docs/domain/SERVICES.md` |
| Appointments | ordered items and phases, snapshots, non-blocking overlap, lifecycle, deposits, discounts, checkout | `docs/domain/APPOINTMENTS.md` |
| Calendar blocks | « Indisponible », the one blocking exception | `docs/domain/CALENDAR_BLOCKS.md` |
| Clients | directory, profile, birthday, notes, derived history and spending, generic CSV / paste import | `docs/domain/CLIENTS.md` |
| Products & sales | catalogue, stock, photos, barcode, retail sales | `docs/domain/PRODUCTS.md`, `SALES.md` |
| Caisse, Tops & tendances | daily / monthly cash register, insights | `docs/domain/INSIGHTS.md` |
| Communications | email appointment reminders, birthday and win-back SMS | `docs/architecture/COMMUNICATIONS.md` |
| Persistence & sync | SQLite (operational) + Supabase aggregate sync | `PERSISTENCE.md`, `CLOUD_SYNC.md` |
| BeautIzzy Plus | RevenueCat, server entitlement mirror (incl. complimentary access), paywall presentation; `SUBSCRIPTION_ENFORCEMENT = 'disabled'` | `docs/architecture/SUBSCRIPTIONS.md` |
| Playground | development-only onboarding preview and full demo per profession | `docs/product/PLAYGROUND.md` |

Missing today, per the onboarding audit: Apple / Google sign-in, branded emails (templates ready,
domain and SMTP not configured), legal documents, account deletion, editing the Business details
after onboarding, starter prices during onboarding, online booking. Password recovery is
implemented locally and waits for its Dashboard configuration and a real-device check (M2).

---

## 3. Milestones

```text
M1  Pilot professions in onboarding ........................ Implemented locally — device validation pending
M2  Account autonomy: password recovery + branded emails ... In progress — app side implemented locally,
                                                             external email configuration pending
M3  Apple and Google sign-in ............................... Planned (after M2)
M4  Legal documents and GDPR readiness ..................... Planned (parallel to M2/M3)
M5  Pilot setup quality: Business editing, starter prices,
    « Premiers pas », client import entry .................. Planned
M6  Reliable Planity CSV import ............................ In progress
M7  In-app feedback ........................................ Planned
M8  Complimentary Plus for pilot professionals ............. Planned (server side exists)
M9  Online booking via Instagram links (manual confirmation)  Planned — launch-critical
M10 Public subscription launch ............................. Blocked by M2–M4, M8, M9
```

Pilot onboarding (a professional invited into the pilot) requires **M1, M2, M4 (at least the
consent and account-deletion parts), M5, M6 and M8**. A nail technician leaving Planity also needs
**M9**: her clients book online today.

---

### M1 — Pilot professions in onboarding · Implemented locally, device validation pending

Implemented in the working tree on 30 October 2026 (`npm run check` green), not committed yet.
Remaining: the real-device checklist below, then the commit.

Scope:

- `NAILS`, `ESTHETICS` and `WELLNESS` become `AVAILABLE` in `PROFESSIONS`; `HAIRDRESSING` unchanged.
- WELLNESS (« Bien-être ») gets its card line, pictogram and the category-based catalogue
  (« Prestations », « Temps d’attente »), never hairdressing words.
- Starter prestations reviewed: esthetics waxing by zone, a wellness massage menu priced by length.
- A WELLNESS Playground demo.

Dependencies: none in code. The service-category migration
`supabase/migrations/20261010120000_add_service_categories_and_descriptions.sql` was applied to
Production on 29 October 2026, and category synchronization was verified on a real iPhone: nothing
remains to apply for M1.

Real-device checklist (pending):

- choose Bien-être → recap → the « Prestations » catalogue reads « Temps d’attente », never « Temps
  de pose »;
- the same with Onglerie and Esthétique;
- the four profession cards scroll comfortably on an iPhone SE;
- the existing hairdresser account opens the app directly, unchanged.

Acceptance criteria:

- the four professions are selectable in onboarding; no « Bientôt disponible » remains;
- a new Business can be created with each of them, and receives only its own starters (0 €);
- nails, esthetics and wellness never show « Technique » or « Temps de pose »;
- HAIRDRESSING behaviour, starters and wording are unchanged;
- an existing Business of any stored activity opens the app directly and never receives a starter;
- tests cover selection, validation, starters and existing-business isolation.

Reference: `docs/domain/PROFESSIONS.md` §10.

### M2 — Account autonomy: password recovery and branded emails · In progress

Goal: a professional who forgot her password recovers it alone, from her phone; every account
email is a French BeautIzzy email sent from `beautizzy.fr`.

**Implemented locally (30 October 2026, application side — `docs/architecture/AUTH.md` §4a):**

- « Mot de passe oublié ? » on sign-in → « Mot de passe oublié » (email prefilled) → Supabase
  `resetPasswordForEmail` with `redirectTo = sourisapp://reset-password`; the confirmation never
  says whether an account exists;
- the Supabase client uses the PKCE flow: the link returns a one-time code, never tokens, and the
  code is only usable by the installation that asked;
- `(auth)/reset-password`: the code is exchanged once; expired, already used, foreign-device and
  network failures each get a French explanation and « Demander un nouveau lien »;
- « Nouveau mot de passe » (typed twice, 8 characters minimum, « différent de l’ancien ») → signed
  in, then the normal root gate (Business resolution, device binding) takes over; « Annuler » signs
  the recovery session out;
- a recovery session is NOT a sign-in: nothing downstream sees an authenticated user until the
  password is chosen, and a recovery link never replaces a signed-in session;
- an unfinished recovery never opens the app, even after a restart or offline (a persisted
  pending-recovery marker; « Annuler » and restarts sign out this device only); sign-up
  confirmation under PKCE never opens a session (the code is never exchanged);
- three French templates (`supabase/templates/auth/`: confirmation, recovery, email change) in the
  reminder emails' visual identity, guarded by tests;
- tests: link parsing, provider state machine, adapter mapping, screens, template guard, no code or
  password in logs, restart / refresh / cancel / completion against the real gateway mapping,
  confirmation-code isolation.

**Remaining — external configuration, by hand (`docs/release/AUTH_EMAILS.md`):**

1. Supabase › Authentication › URL Configuration, Staging then Production: add
   `sourisapp://reset-password` to Redirect URLs (keep `sourisapp://sign-in`). Without it the link
   falls back to the Site URL and lands on « Se connecter » with nothing to do.
2. Sending domain: verify `beautizzy.fr` (or a sending subdomain) with the email provider — SPF,
   DKIM, then DMARC — at the domain's DNS host.
3. Supabase custom SMTP (Resend, already the provider of the reminder emails), sender « BeautIzzy »;
   then the Auth email rate limit.
4. Paste the three templates and their subjects (Staging, then Production).
5. Move `RESEND_FROM_EMAIL` of the reminder worker to the same verified domain, if it is not there
   yet.
6. Real-device validation (checklist in `AUTH_EMAILS.md` §7), Staging first.

Dependencies: access to the `beautizzy.fr` DNS zone; a Resend account with the domain verified;
Supabase Dashboard access for both projects.

Acceptance criteria:

- a professional who forgot her password recovers it alone, from the phone, end to end;
- an expired, reused or foreign-device link is explained and leads to a new request;
- no account enumeration: the same message whether the address exists or not;
- recovery and confirmation links open the app on a real iPhone (cold and warm start);
- every email a professional or a client receives is branded, in French, and passes SPF / DKIM /
  DMARC; none is sent from a default Supabase address.

### M3 — Apple and Google sign-in · Planned

Scope: « Continuer avec Apple » and « Continuer avec Google » on the account screens, through
Supabase Auth; the email + password path stays. Sign in with Apple is mandatory on iOS once Google
is offered.

Dependencies:

- M2 complete, external configuration included (the email path, recovery and branded emails stay
  the fallback of every account);
- M4 consent text (shown at account creation, whatever the provider);
- Apple: the Sign in with Apple capability on `com.mortyflex.sourisapp` (and `.dev`), a Services ID
  and signing key registered in Supabase › Auth › Providers › Apple; native sign-in needs
  `expo-apple-authentication` (a justified package addition, decided in M3) and a new EAS build;
- Google: OAuth client IDs (iOS and web) in Google Cloud, the Google provider enabled in Supabase;
  either native Google sign-in (a package and a config plugin) or the browser flow, which the PKCE
  client of M2 already supports, returning to a `sourisapp://` redirect allow-listed like the
  recovery URL;
- an explicit account-linking rule for an email that already has a password account (Supabase
  links identities with the same verified email by default — to confirm and test);
- App Store guideline 4.8: Sign in with Apple is mandatory once Google is offered.

Acceptance criteria:

- a new professional can create her account with Apple or Google and reaches onboarding step 1;
- an existing email account is never duplicated silently: the linking rule is explicit and tested;
- the existing device binding, offline session and `DEVICE_ACCOUNT_CONFLICT` rules are unchanged;
- Apple « Hide my email » addresses work for reminders' Reply-To prefill (editable).

### M4 — Legal documents and GDPR readiness · Planned

Scope:

- Conditions d’utilisation, Politique de confidentialité, Conditions d’abonnement: published URLs,
  linked from sign-up (explicit acceptance), Plus and the paywall (`PAYWALL_PRIVACY_TITLE` exists
  without a URL);
- account deletion from the app (App Store guideline 5.1.1(v)), with the Business data;
- personal-data export on request; documented retention; the professional as data controller for
  her clients, BeautIzzy as processor (DPA);
- sub-processors listed (Supabase, RevenueCat, the email and SMS providers).

Dependencies: legal review of the texts; a server-side deletion path (Supabase Auth + Business
data + Storage media + communications queue).

Acceptance criteria:

- no account can be created without accepting the current terms and privacy policy;
- deletion is reachable in two taps from Plus, explained, confirmed, and irreversible server side;
- every legal link resolves; the App Store privacy labels match what is collected;
- client SMS consent and withdrawal keep working as today (`COMMUNICATIONS.md`).

### M5 — Pilot setup quality · Planned

Scope (from the onboarding audit):

- edit the Business name, phone and activity after onboarding (`AccountSheet` is read-only today);
- set the starter prices during onboarding step 4 (0 € stays allowed, but is shown as « à
  compléter »);
- create the profession's starter categories with the starters (nails, esthetics, wellness);
- a « Premiers pas » card on Accueil derived from data (prices to complete, clients to import,
  first appointment), shown only to a recently created Business — never to the existing
  hairdresser;
- an action in the empty prestation picker (« Aucune prestation disponible ») and a « Importer ma
  clientèle » entry from onboarding / Accueil;
- remove the remaining hairdressing pictograms (the scissors of « Prestations & tarifs » in Plus
  and of the services watermark).

Dependencies: M1. No schema change expected (`businesses` already holds the fields).

Acceptance criteria:

- a pilot finishes onboarding with priced, categorised prestations, or sees exactly what is left
  to complete;
- a typo in the Business name is fixable without help;
- the existing Business sees no new card, no new step and no data change.

### M6 — Reliable Planity CSV import · In progress

Scope: import a Planity client export through the existing client import (identity and contact
only — `CLAUDE.md` §20), with deterministic column recognition, a review step, and no commercial
history imported. Working-tree changes exist on `src/domain/clients/import/` and
`src/features/clients/import/` (not part of M1).

Dependencies: real anonymised Planity exports for validation.

Acceptance criteria:

- a real Planity export imports without manual editing; every rejected row is explained;
- no visit, spending, no-show or note history is imported;
- re-importing the same file creates no duplicate.

### M7 — In-app feedback · Planned

Scope: « Envoyer un avis » in Plus: free text, optional screenshot, the app version and the
profession attached automatically; delivered to the team; confirmation shown.

Dependencies: a destination (email or a Supabase table, decided in the phase); M4 privacy text
covers it.

Acceptance criteria: a pilot sends feedback in under 30 seconds, offline-safe (queued), never
containing client data unless she typed it.

### M8 — Complimentary Plus for pilot professionals · Planned

Scope: grant each individual pilot professional complimentary Plus access (RevenueCat promotional
entitlement → the server mirror, `SUBSCRIPTIONS.md`), with no predetermined end, documented per
account; « Mon abonnement » shows « Accès offert ».

Dependencies: the 6.5C Staging validation; the pilot's account exists (after M1 onboarding).

Acceptance criteria:

- every pilot account reads a verified complimentary access before any enforcement is enabled;
- revoking it is an explicit operator action, never a side effect;
- `SUBSCRIPTION_ENFORCEMENT` stays `disabled` until M10.

### M9 — Online booking via Instagram links · Planned — launch-critical

Retained as a launch priority: it is never traded for convenience features, and its design starts
as soon as M5 settles the priced, categorised catalogue it books from.

Scope (MVP):

- a public booking page per Business at a stable link the professional puts in her Instagram bio;
- the client picks a prestation marked bookable, then a proposed slot, then gives her name and
  phone / email;
- the request arrives in BeautIzzy as a **booking request**; the professional **confirms or
  declines it manually**; only a confirmation creates the Appointment (with its snapshot);
- the client is told the outcome by email.

Rules: a dedicated availability policy (`CLAUDE.md` §17) — never « the professional could create
it manually ». Needs: per-prestation online visibility (`PRIVATE | VISIBLE | BOOKABLE`, designed in
`SERVICES.md` §12), working hours, lead time and horizon, calendar blocks, staff-required phases.
Manual scheduling stays non-blocking and unchanged.

Dependencies: M2 (branded client emails), M4 (privacy text for the public page and the client's
data), M5 (priced, categorised catalogue), a public read path that exposes no private data.

Acceptance criteria:

- a client books from an Instagram link on a phone browser in under a minute;
- nothing is added to the agenda before the professional confirms;
- a request never lands in a calendar block or a staff-required interval of the same staff member;
- no private prestation, client or price leaks through the public page;
- a Planity nail technician can move her online bookings to BeautIzzy.

### M10 — Public subscription launch · Blocked

Scope: App Store purchases enabled (`app-store` in `PURCHASABLE_STORES`), paywall routing after
onboarding, « Gérer mon abonnement », server-side enforcement switches, then
`SUBSCRIPTION_ENFORCEMENT = 'enabled'` (`SUBSCRIPTIONS.md` §12).

Dependencies: M2, M3, M4, M8 (pilots protected first), M9 (part of the product promise), the 6.5C
Staging validation and the Production backfill.

Acceptance criteria: per `SUBSCRIPTIONS.md` §12; additionally, no pilot and no existing
professional loses access at the switch.

---

## 4. Not in this roadmap

Multi-staff, multiple locations, automatic birthday discounts, recurring calendar blocks, Google
Play, a service import from Planity, appointment import from Planity. Each needs its own product
decision.
