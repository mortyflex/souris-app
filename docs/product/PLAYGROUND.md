# Developer Playground

The Playground is an internal development utility: it lets a developer look at BeautIzzy as each
profession would see it — the announced professions included — without an account, a network
request or a write outside memory. It exists in a Staging development build only (see §1) and is
reached from the signed-out Discovery screen (« Playground développeur »).

Architecture reference: `docs/architecture/ARCHITECTURE.md`, « Developer Playground ».

---

## 1. Availability

ONE fail-closed rule decides whether the Playground exists in a bundle:
`resolvePlaygroundAvailability` / `isPlaygroundAvailable` (`src/features/playground/availability.ts`).

- a development bundle (`__DEV__`) — a release, TestFlight or store build never qualifies;
- whose inlined `EXPO_PUBLIC_SUPABASE_URL` is the Staging project — the Production project, an
  unconfigured or malformed URL are refused.

Both are build-time facts. The rule is enforced by the Discovery entry, the `(auth)` layout
(`Stack.Protected`), every Playground route and every Playground screen. The screen modules, the
demo runtime and the fixtures are required inside `__DEV__` branches only, so release bundles drop
them. A direct route or deep link outside a Staging development build lands on the signed-out entry.

How to open it on a device or simulator:

```bash
# A development build on Supabase Staging (EXPO_PUBLIC_SUPABASE_URL = the Staging project URL).
APP_VARIANT=development npx expo run:ios       # iOS
APP_VARIANT=development npx expo run:android   # Android
```

Signed out, on the Discovery screen: « Playground développeur » (under « Se connecter »).

---

## 2. Step A — onboarding preview (October 2026)

For every profession of `PROFESSIONS`: « Prévisualiser l’onboarding » mounts the REAL five-step
`BusinessSetupFlow` bound to in-memory actions (`preview-actions.ts`). Nothing is created,
persisted, synced, scheduled or requested. See ARCHITECTURE.md.

---

## 3. Step B1 — interactive profession scenarios (October 2026)

« Explorer l’application » enters the **demo runtime**: the real operational screens — Agenda,
appointment details, creation and editing, calendar blocks, client directory and profile, client
history, Prestations & tarifs and the service editor, estimations — on a fictional dataset of the
chosen profession, kept in memory only.

### 3.1 Isolation

`src/features/playground/demo/PlaygroundDemoRuntime.tsx` mounts the SAME providers as
`(app)/_layout.tsx` (clients, services, products, sales, appointments, calendar blocks,
communication preferences, business access, media, communications gateway, current Business) with
their boundaries bound to memory:

| Boundary                | Real application                         | Demo runtime                                         |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------- |
| SQLite                  | `souris.db` on the device                | a private `:memory:` database per demo generation    |
| Files                   | expo-file-system Documents / Caches      | an in-memory `LocalFiles` under `file:///playground-demo/` |
| Business media remote   | Supabase Storage                         | `undefined` — photos read as unavailable             |
| Communications gateway  | Supabase Edge Functions                  | `undefined` — reminders read as disabled, nothing sent |
| Business access         | RevenueCat source + persisted evidence   | enforcement disabled, no source, memory only         |
| Auth                    | the root `AuthProvider` (signed out)     | the same root provider, untouched — nothing fakes a session |
| Business session        | `BusinessSessionProvider` (bound Business) | not mounted — no Business is bound to the device   |
| Cloud sync              | `CloudSyncRunner`                        | not mounted — the in-memory outbox is never read     |

The stores still mark the sync outbox — inside the in-memory database, which no runner reads. No
Supabase, RevenueCat, expo-sqlite file, notification, email, SMS or purchase code path is reached;
the runtime test mocks those modules to throw on load.

The demo runs inside the signed-out `(auth)` group, as the `(demo)` route group
(`src/app/(auth)/(demo)/`), which mirrors the `(app)` routes it needs. Because Expo Router prefers
the current group when a path is shared, every push of the real screens (`/clients/<id>`,
`/appointments/<id>`, `/services/new`, …) resolves inside the demo. The group is protected by the
availability rule; without a chosen demo its layout redirects to the landing.

### 3.2 Scenarios

`src/features/playground/demo/scenarios/`: one deterministic definition per profession, built
relative to the moment the demo is opened (`buildDemoScenario`). Identifiers are stable and
readable (`playground-demo-<profession>-…`); every record belongs to the demo Business; names are
fictional (plant, gemstone and botanical surnames, `@exemple.fr`, `06 00 00 00 xx`).

| Profession   | Business                 | Catalogue                                                       |
| ------------ | ------------------------ | --------------------------------------------------------------- |
| HAIRDRESSING | Studio Coiffure Démo     | the HAIRDRESSING starter base, priced (colour, balayage, gloss and care are TECHNIQUES with a pose) |
| NAILS        | Atelier Ongles Démo      | the seven NAILS starters, priced (every one a SERVICE), in six categories (« Réparation d’un ongle » left « Sans catégorie »), three with a description |
| ESTHETICS    | Institut Beauté Démo     | the five ESTHETICS starters, priced (the facial is a TECHNIQUE), in five categories (« Beauté des mains et des pieds » empty), three with a description |

Each demo holds seven to eight clients (one birthday on the day the demo is opened, one archived,
notes and contact details on several) and about twenty appointments: three weeks of history
(completed, checked out by card or cash, with and without discount, cancelled by the client or the
business, no-show), a busy today — with a prestation booked during another's processing time
where the profession has one — and the next two weeks planned.

### 3.3 What is interactive

Everything the reused screens do, on the demo data: create, edit, archive and restore clients;
create, edit, activate and delete prestations — with categories and descriptions, and the
categories screen (create, rename, reorder, delete) since multi-profession Step 3; create and edit appointments (services, timing,
start, client, discount, notes), change their status (checkout, cancellation, no-show, deletion),
record and void deposits; create, edit and delete calendar blocks; estimations; the client import
flow (paste or CSV — into the demo only). Every change is visible at once in every demo screen.

### 3.4 What is deliberately unavailable

- Client and product photos: the media remote is undefined; the screens say the photo could not be
  saved, nothing is written.
- Reminders and lifecycle SMS: the gateway is undefined; the reminder row reads as disabled.
- Product sales from Appointment Details (`/sales/new`): « Non disponible dans la démonstration »
  (Step B2).
- Accueil, Produits, Plus, Cash Register, Tops & tendances data beyond the Agenda ticket, account
  actions, the development reset of Plus: not part of the demo tabs (Step B2 or never).

### 3.5 Controls

The « Démo » tab (`PlaygroundDemoHubScreen`): the Business, the dataset counts, « Prestations &
tarifs », and:

- « Réinitialiser la démonstration » — after confirmation, a new generation of the same profession:
  the runtime remounts on the original dataset (the previous in-memory database is closed);
- « Changer de métier » — dismisses the demo group back to the Playground landing;
- « Quitter le Playground » — dismisses it back to Discovery.

Leaving the group clears the demo session; the next entry is always a fresh scenario. Nothing is
persisted between sessions.

---

## 4. Catalogue gaps observed while building the demos

Step 3 (`docs/domain/SERVICES.md` §11) resolved the first two gaps below — free categories and
descriptions — and the unified « Prestations » wording for NAILS and ESTHETICS. The others remain.

Concrete usability gaps of the current domain model, met while expressing the three catalogues.
Each has a smallest safe follow-up in `docs/domain/SERVICES.md` §10.4; none was implemented here.

- **No free categories.** A nail catalogue reads « Pose complète gel · Remplissage gel ·
  Semi-permanent mains · Semi-permanent pieds · Dépose · Nail art · Réparation d’un ongle » as one
  flat « Prestations » list: the natural groupings (Gel / Semi-permanent / Entretien) and, for
  esthetics, Visage / Épilation / Corps / Regard cannot be expressed; only the SERVICE / TECHNIQUE
  split groups anything, and for NAILS everything is a SERVICE.
- **No description.** « Beauté du regard » or « Soin du corps » cannot say what they include; the
  only way to carry « gommage + enveloppement » is the name, which then overflows the rows and the
  Agenda cards.
- **Add-ons are full prestations.** « Nail art » and « Réparation d’un ongle » are quick add-ons
  booked with a set, but they take the same place as a 90-minute pose in the picker and the
  catalogue; nothing marks them as complements.
- **No online-bookable property.** A nail studio typically opens sets and infills to online
  booking but not repairs or removals; the model cannot record that today (future availability
  layer, `CLAUDE.md` §17).
- **Terminology is hair-shaped in places.** The TECHNIQUE processing phase is named « Temps de
  pose » everywhere (fine for a mask, odd for nothing); the appointment and catalogue vocabulary
  (« Techniques ») is explained with colour examples.
- **Prices without variants.** « Épilation jambes » (half / full) or « Pose complète gel »
  (natural / extension) need two prestations today; `serviceOptionId` exists on the snapshot but no
  option model exists in the catalogue.

---

## 5. Not implemented yet

- Step B2: the cash register, sales, products and insights on demo data; a demo Accueil tab.
- Persisting a demo between sessions, sharing a demo between devices, exporting one.
- Any Production surface: the Playground remains absent from release and TestFlight bundles.
