# Souris — Architecture

## 1. Purpose

This document defines the architectural direction of Souris Native.

The goal is not to build a sophisticated enterprise architecture.

The goal is to keep the codebase:

- understandable;
- testable;
- maintainable;
- easy for one developer and coding agents to navigate;
- compatible with future product evolution.

Architecture should reduce product risk, not create ceremony.

---

# 2. Platform

Souris is a native mobile application built with:

```text
React Native
Expo
TypeScript
Expo Router
npm
```

Phone is the primary platform.

iOS and Android are both target platforms.

Larger displays and foldables may be supported progressively.

---

# 3. Repository Direction

The intended direction is:

```text
src/
├── app/
├── domain/
├── features/
├── persistence/
├── shared/
│   ├── ui/
│   ├── icons/
│   └── lib/
├── providers/
└── config/

modules/
└── product-image-background/  # focused optional local Expo native module

assets/
docs/
```

This is a direction, not an instruction to create every folder immediately.

Create folders when real code requires them.

---

# 4. Routing

Expo Router owns route definitions under:

```text
src/app/
```

Route files should remain thin.

They may:

- compose feature screens;
- provide route parameters;
- connect navigation.

They should not contain significant business logic.

---

# 5. Domain

Business rules belong under:

```text
src/domain/
```

Examples:

```text
src/domain/appointments/
src/domain/clients/
src/domain/products/
src/domain/sales/
```

Create each area only when its implementation begins.

Domain code is plain TypeScript.

The domain must not depend on:

```text
React
React Native
Expo
Expo Router
Supabase
AsyncStorage
UI libraries
platform APIs
```

---

# 6. Features

Feature-specific application code belongs under:

```text
src/features/
```

Examples may eventually include:

```text
src/features/appointments/
src/features/clients/
src/features/products/
src/features/sales/
src/features/auth/
```

Feature code may connect:

```text
domain
↕
application state
↕
React Native UI
```

A feature should not become an alternative generic framework.

---

# 7. Shared UI

Generic visual primitives may live under:

```text
src/shared/ui/
```

Examples:

```text
Button
Input
Sheet
SectionHeader
EmptyState
```

Only place a component in `shared/ui` when it is genuinely reusable.

A component used only by Appointment belongs to the Appointment feature.

Do not prematurely generalize components.

`BarcodeScannerModal` is the reusable native scanner boundary. It owns Expo Camera permission,
supported retail formats, torch presentation, and the one-result-per-opening lock, then returns only
the scanned string through a callback. It imports no Product catalog, routing, stock, or Sales state;
Product-specific exact lookup and navigation remain under `src/features/products`.

Client selection is owned by the Client feature under `src/features/clients/selection`:
`ClientPickerStep` (search + virtualized directory over the single Client source) and
`ClientPickerSheet` (the same step inside the shared `BottomSheet`, with on-the-fly Client
creation). Appointment Creation, Appointment Editing, and Sale creation all consume these two
components; no other Client picker implementation exists.

Product photo acquisition remains Product-feature orchestration under
`src/features/products/images`: the focused `expo-image-picker` boundary requests camera or library
permission only after the matching action and returns a local URI. Product UI owns the local form
draft; acquisition and processing never call `ProductCatalogProvider` directly.

The optional Apple-only local Expo module under `modules/product-image-background` is the complete
native boundary for foreground extraction. It uses stable iOS 17+ Vision APIs on-device and writes
a separate transparent PNG to cache. The TypeScript `removeImageBackground` boundary loads the
module optionally and always returns the original URI on Android, unsupported iOS, native failure,
or timeout. Product components contain no platform branches or Vision implementation details. A
development build is required for this enhancement; it adds no persistence or backend boundary.

---

# 8. Shared Icons

Project-controlled generic icon wrappers or custom brand icons may live under:

```text
src/shared/icons/
```

Do not create unnecessary wrappers around an icon library unless they provide actual consistency or behavior.

---

# 9. Shared Lib

Generic technical helpers may live under:

```text
src/shared/lib/
```

This directory must not become a dumping ground.

Do not create vague global:

```text
utils
helpers
misc
common
services
```

folders.

Prefer clear ownership.

---

# 10. Providers

Application-level providers may eventually live under:

```text
src/providers/
```

Only introduce providers when an actual cross-application concern exists.

Current providers:

```text
src/providers/PersistenceProvider.tsx   application persistence bootstrap (see PERSISTENCE.md)
src/providers/first-run-seed.ts         one-time production seed (approved legacy data only)
src/providers/development-seed.ts       production seed + Agenda fixtures (__DEV__ reset / tests)
src/providers/persistence-failure.ts    the one concise "Enregistrement impossible" alert
```

Examples may later include:

- authentication;
- query client;
- theme infrastructure.

Do not create empty provider abstractions in advance.

---

# 11. Config

Static application configuration may eventually live under:

```text
src/config/
```

Only use this directory for genuine application configuration.

Do not move business rules into configuration merely to avoid domain code.

---

# 12. Dependency Direction

Preferred direction:

```text
src/app
  ↓
features
  ↓
domain
```

`shared` supports presentation/technical reuse where appropriate.

The domain must never depend upward on:

```text
features
src/app
React Native UI
```

---

# 13. Design Architecture

Approved design documentation lives under:

```text
docs/design/
```

Original exported prototype material lives under:

```text
docs/design/reference-export/
```

This content is reference material only.

Do NOT import HTML/CSS/JS from the design prototype into runtime application code.

The native application should reproduce design intent using native React Native implementation.

Runtime brand assets live under:

```text
assets/brand/
```

---

# 14. Design Decision Priority

When design sources disagree, follow the priority documented in:

```text
docs/design/DESIGN_OVERRIDES.md
```

The exported HTML prototype is not authoritative over explicit product decisions.

---

# 15. State Management

Start with the simplest state ownership that solves the current feature.

Prefer local/component state when appropriate.

Do not introduce global state libraries merely because the application may grow.

Do not add:

```text
Redux
Zustand
MobX
```

without a concrete need.

React Context is not a substitute for thoughtful state ownership.

The current persistent local session uses five focused providers, all hydrated once from the
SQLite snapshot exposed by `PersistenceProvider` (see `docs/architecture/PERSISTENCE.md`):

```text
AppointmentSessionProvider — the appointment collection
ClientSessionProvider       — the single Client source
ServiceCatalogProvider      — the single canonical Service catalog source
ProductCatalogProvider      — the single canonical Product catalog source
SaleSessionProvider         — the completed Sale collection (starts empty)
```

They expose only what current surfaces need (lookup + add + the mutations each feature requires).
Every mutation is written to SQLite first (in a transaction when several rows are involved) and
reflected in React state only after the write succeeds; a failed write changes no state.

`ClientSessionProvider` owns the Client lifecycle:

```text
clients            complete source, archived included — every historical clientId resolves
activeClients      derived: archivedAt absent — the ONLY collection offered by Client pickers
archivedClients    derived
getClientById
addClient / updateClient          identity only; updateClient never changes the lifecycle
archiveClient / restoreClient     archived_at write, then state
getClientDeletionEligibility      stored reference counts (advisory pre-check)
deleteClientPermanently           transactional guard; throws ClientDeleteConflictError
```

Screens never filter archived Clients themselves: the shared picker (`src/features/clients/selection`)
reads `activeClients`, and the directory groups `clients` through `directory-sections.ts`.
Appointments reference Clients through `clientId`; display names are resolved from the Client
source, never duplicated into appointment state. Appointments reference catalog services through
`serviceId` at selection time only; once selected, an `AppointmentItem` owns its snapshot and is
never re-read from the Service catalog. Legacy service data feeds the catalog through pure
one-way adapters and is not a parallel runtime source. The Product catalog follows the same
pattern: legacy products are one-way import sources for `ProductCatalogProvider`, which Sales
reference through the stable `productId`.

### Sale completion boundary

`SaleSessionProvider` is nested inside `ProductCatalogProvider` and exposes only `sales`,
`getSaleById`, and `completeSale`. Completion is ONE operation:

```text
completeSale(draft)
  → prepareSaleCompletion(draft, products)      pure domain: whole-draft validation,
                                                 Sale snapshot, exact stock decrements
  → sales store completeSale()                  ONE SQLite transaction: stock revalidation,
                                                 decrements, Sale row, SaleItem rows
  → applyCommittedStockDecrements(decrements)    catalog state mirrors the committed stock
  → add the immutable Sale
```

Validation runs against the current canonical catalog before any write; the state updates are
issued synchronously after the transaction commits so React commits them together. A validation
failure returns the issues and changes neither the Sale session nor the Product catalog; a
database failure rolls the transaction back and throws before any state change. The Sale draft
(lines, optional Client) is local screen state; the session and catalog are never touched while
drafting. Sale UI reads live Product values for presentation, while the completed Sale keeps its
own snapshot and survives Product edits or deletion. The Client Profile derives purchases from
`sales` through `clientId` — nothing is stored on the Client.

Entry context is navigation-only: `/sales/new` accepts an optional `clientId` route parameter
(Client Profile and Appointment Details pass it, Produits does not). The screen resolves it on
its first render; the origin never reaches the Sale model or the session, and returning after
success is plain back-stack navigation.

---

# 16. Persistence

Local persistence exists and is documented in `docs/architecture/PERSISTENCE.md`.

```text
src/persistence/     expo-sqlite boundary, schema v1 + v2, migrations, first-run seed, stores,
                     LocalFiles boundary for durable Product images (plain TypeScript)
src/providers/       PersistenceProvider: migrate → seed once → hydrate → render
```

The domain stays independent from it: `src/persistence` depends on domain types only, and row ↔
domain mapping happens exclusively inside the stores. Screens never see SQL or rows.

Remote persistence, sync, backup, and authentication remain deferred; the local schema must not
guess their shape.

---

# 17. Networking

Do not build an API layer before a remote API exists.

When networking eventually appears:

- keep transport concerns outside the domain;
- convert external data at boundaries;
- do not leak remote API shapes throughout the app.

---

# 18. Appointment Domain

Appointment rules are defined in:

```text
docs/domain/APPOINTMENTS.md
```

They must not be duplicated differently inside:

```text
screens
hooks
calendar components
persistence code
```

The UI consumes domain behavior.

The UI does not redefine scheduling.

---

# 19. Future Online Booking

Future online booking must be conceptually separate from manual professional scheduling.

A future architecture may introduce an availability concern such as:

```text
booking availability
```

only when that feature is implemented.

Do not create speculative interfaces or engines now.

The current Appointment model should simply remain compatible with the future concept.

---

# 20. Business / Staff Identity

Keep identifiers explicit:

```text
businessId
staffMemberId
clientId
```

Do not introduce multi-business or multi-team infrastructure merely because the identifiers exist.

Identifiers are cheap future compatibility.

Infrastructure is not.

---

# 21. Dependency Policy

Add a dependency only when the current feature needs it.

Before adding one:

```text
understand requirement
→ check Expo/native capability
→ evaluate dependency
→ install only if justified
```

Avoid installing an entire future stack during project setup.

In particular, do not prematurely add libraries for:

```text
global state
database
calendar
bottom sheets
camera
barcode
forms
networking
animations
```

until their phase requires them.

---

# 22. Native Components

Prefer native React Native behavior.

Do not port web patterns merely because the design export uses them.

Examples:

```text
hover
→ press / gesture state where appropriate

web drawer
→ native sheet or screen when appropriate

CSS media query
→ React Native responsive/layout behavior

DOM drag
→ native gesture implementation
```

Preserve interaction intent, not web implementation.

---

# 23. Styling

The final native styling strategy should be chosen deliberately during the design-system implementation phase.

Do not introduce a styling framework before that decision.

Approved design tokens should eventually become runtime tokens.

Do not manually scatter visual constants across screens.

---

# 24. Dates and Time

Scheduling code must treat dates/times deliberately.

Avoid embedding date arithmetic directly throughout UI components.

Appointment timeline calculation belongs to the Appointment domain.

Formatting for display belongs outside the core domain.

Do not introduce a date library until there is a concrete need.

---

# 25. Testing

Domain logic should be the easiest layer to test.

Prefer unit tests for:

```text
timeline calculations
phase behavior
appointment ordering
snapshot behavior
lifecycle behavior
```

UI tests should focus on user-observable behavior.

Do not duplicate every domain unit test through UI tests.

---

# 26. Quality Command

The project should expose:

```bash
npm run check
```

as its normal complete validation command once tooling is configured.

The exact scripts will be introduced during the quality-foundation phase.

---

# 27. Real Device Validation

Native interaction requires real-device validation.

Automated testing does not replace manual checks for:

```text
gesture behavior
keyboard behavior
safe areas
drag
long press
camera
barcode scanning
navigation transitions
```

The coding agent must provide a manual checklist where relevant.

The human performs the real-device validation.

---

# 28. Architecture Anti-Patterns

Avoid:

```text
premature repository pattern
generic service layer
factory-heavy architecture
dependency injection container
empty interfaces
global state for every feature
business logic in screens
duplicate scheduling calculations
generic utils dumping grounds
premature multi-tenant architecture
premature multi-staff infrastructure
```

Direct readable code is preferred.

---

# 29. Evolution Rule

Architecture may evolve when real requirements appear.

When a feature reveals a concrete need:

```text
identify pressure
→ make smallest useful abstraction
→ test it
→ document meaningful architectural change
```

Do not attempt to predict every future requirement.

---

# 30. Initial Implementation Order

The intended implementation order is approximately:

```text
quality/tooling foundation
→ design-system native foundation
→ Appointment domain
→ native Agenda vertical slice
→ appointment creation/editing
→ clients
→ services/catalog
→ products
→ persistence/auth as justified
→ later product capabilities
```

This sequence may change when explicitly decided.

Do not automatically begin later phases.

---

# 31. Architectural Goal

A developer opening Souris should be able to answer quickly:

```text
Where is the business rule?
Where is the feature UI?
Where is the route?
Where is the shared visual primitive?
Where is the design specification?
```

If answering these questions becomes difficult, the architecture is becoming too complicated.

Souris should remain as simple internally as it aims to feel externally.
