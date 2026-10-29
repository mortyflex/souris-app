# BeautIzzy — Architecture

## 1. Purpose

This document defines the architectural direction of BeautIzzy Native.

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

BeautIzzy is a native mobile application built with:

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
├── infrastructure/   # remote technical boundaries (Supabase client + adapters)
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

Route groups (Account & Onboarding V1):

```text
src/app/(auth)/          index = Product Discovery (3 slides), sign-up, sign-in, verify-email — no session
                         playground/index, playground/[activityType] — the developer Playground
                         (development build on Supabase Staging ONLY; absent everywhere else)
                         (demo)/ — the Playground demo group: the (app) operational routes it
                         needs (tabs accueil · agenda · clientes · produits · demo, appointments,
                         clients, services, calendar blocks, estimations, products, sales/new,
                         cash-register) inside the demo runtime
src/app/(onboarding)/    five-step business setup (one route)         — session, no Business
                         (starts at the primary activity: Discovery is owned by (auth))
src/app/(app)/           tabs + every operational sheet route         — session + bound Business
```

The root layout mounts `RootNavigator` (`src/providers/RootNavigator.tsx`), which resolves ONE
route from the Auth and Business states (`src/providers/root-route.ts`) and guards each group with
`Stack.Protected`. `(app)/_layout.tsx` owns the operational session providers and
`CurrentBusinessProvider`, so no operational state exists in the tree while signed out. See
`docs/architecture/AUTH.md`.

The main navigation `(app)/(tabs)/_layout.tsx` is Expo Router's `NativeTabs`
(`expo-router/unstable-native-tabs`): the platform's own tab bar (UIKit, Liquid Glass on iOS 26;
Material bottom navigation on Android) with four static triggers — Agenda, Clientèle, Produits,
Plus — wrapped in the BeautIzzy navigation theme (`src/providers/navigation-theme.ts`). Operational
workflows are pushed from the `(app)` Stack above the tabs, so the bar shows only on the four
main screens. See `docs/design/DESIGN_OVERRIDES.md` §18.

## Developer Playground (development only)

`src/features/playground` is an internal development utility that previews the onboarding of EVERY
profession — the announced ones included — without an account, a network request or a write.

- ONE fail-closed rule decides whether it exists in a bundle: `resolvePlaygroundAvailability` /
  `isPlaygroundAvailable` (`features/playground/availability.ts`): a development bundle (`__DEV__`)
  whose inlined `EXPO_PUBLIC_SUPABASE_URL` is the Staging project. A release build, the Production
  project, an unconfigured or malformed URL are all unavailable. Both inputs are build-time facts.
- The rule is enforced at every layer: the Discovery entry (« Playground développeur », a tertiary
  action under the sign-in link), the `(auth)` layout (`Stack.Protected`), and each route, which
  redirects to the signed-out entry otherwise; the screens render nothing when unavailable. The
  route files `require` the screen modules inside a `__DEV__` branch, so release bundles drop them.
- The preview IS the real onboarding: `BusinessSetupScreen` is split into `BusinessSetupFlow` (the
  five steps, no provider dependency) and `BusinessSetupActions` (its four effects: create the
  Business, activate reminders, write the starters, enter). The product binds the actions to the
  session, the communications gateway and the Service store; the Playground binds them to memory
  (`preview-actions.ts`). Nothing is persisted, synced, scheduled, purchased or requested, and the
  preview state dies with its screen: every new scenario is a new mount.
- The preview accepts every profession of `PROFESSIONS` through `ActivityAcceptance =
  'every-profession'` (`business-form.ts`); the product keeps the default,
  `'available-professions'`, so nothing changes in what a new Business may be created with.
- Step A (October 2026) previews onboarding only.
- Step B1 (October 2026) adds « Explorer l’application »: the `(demo)` route group of `(auth)`
  mounts the REAL operational screens inside `PlaygroundDemoRuntime`
  (`features/playground/demo/`), which composes the same providers as `(app)/_layout.tsx` around a
  private in-memory SQLite database (`openInMemorySourisDatabase`, a `:memory:` connection per
  demo generation), an in-memory `LocalFiles`, no media remote, no communications gateway, business
  access with enforcement disabled and no source, and the fictional demo Business. The root
  `AuthProvider` stays as it is (signed out): nothing fakes a session, no Business is bound, the
  cloud sync runner is not mounted, and the Supabase, RevenueCat and device-database modules are
  never loaded by the runtime (its test mocks them to throw). The scenario — profession +
  generation — lives in `PlaygroundDemoSessionProvider`, mounted by the `(auth)` layout; the runtime
  is keyed by it, so start, reset and profession switch each open a fresh database seeded from the
  deterministic fixtures (`features/playground/demo/scenarios/`), and leaving the group clears the
  session. The group's paths are the `(app)` paths; Expo Router resolves a shared path to the
  current group, so the real screens' pushes stay inside the demo. Product reference and the list
  of what is interactive or deliberately unavailable: `docs/product/PLAYGROUND.md`.
- Step B2 (October 2026) completes the demo with the product's own Accueil, Produits, product
  editor, « Nouvelle vente » (standalone and « Revente »), Cash Register and Tops & tendances —
  new `(demo)` routes over the SAME screens and the providers the runtime already mounted (products
  and sales). The fixtures add a retail shelf and product sales per profession; seeded stock is the
  initial stock minus the seeded sale lines, and a paid appointment settles its expected total
  (`getAppointmentExpectedTotal`). Accueil is the `accueil` route: the signed-out `(auth)/index`
  owns `/`. Payments are tracking records only, as in the product.
- Not implemented: a simulated authenticated session, persisted demos, the Plus tab (account,
  reminders and SMS settings, BeautIzzy Plus).

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
src/domain/calendar-blocks/
src/domain/clients/
src/domain/insights/
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
src/features/calendar-blocks/
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

`FormScrollView` is the ONE scroll container of forms (`src/shared/ui/FormScrollView.tsx`): a
ScrollView that keeps the focused input visible above the keyboard from measured geometry only
(`keyboard-visibility.ts` holds the pure rule, `form-scroll-geometry.ts` the two native
measurements). The sheet shells keep lifting their fixed actions (`KeyboardAvoidingView` on iOS,
the window resize on Android); the form scroll only moves its own offset once that layout has
settled. Screens never add keyboard code of their own: they use `FormScrollView` and the shared
`TextField`, or call `useFormScrollView().revealFocusedInput()` from a raw input's `onFocus`.

`PhotoSourceFlow` is the reusable photo-selection boundary shared by Product and Client photos:
source sheet (`PhotoSourceSheet`), camera permission resolved on the « Prendre une photo » tap
(`src/shared/lib/photo-acquisition.ts`), the photo camera (`PhotoCameraModal`) and the system
picker. It returns a local file URI and knows nothing about Products or Clients; what happens to the
photo (Product draft, Client photo upload) stays in each feature.

Photos that must reach every device (Client photos, Product photos) share ONE storage lifecycle,
`src/persistence/media/business-media.ts` (upload → commit the stable path → clean up, local cache
under the app documents), ONE normalization pipeline, `src/shared/lib/photo-normalization.ts`
(configurable crop / size / format), and ONE remote boundary provided by
`src/providers/BusinessMediaProvider.tsx` (bound to the private `business-media` Supabase bucket).

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

Image sharing and saving are one generic boundary, `src/shared/lib/share-image.ts`: it captures ONE
mounted view (`react-native-view-shot`) into a temporary PNG, then either hands it to the platform
share sheet (`shareViewAsImage`, `expo-sharing`, outgoing only — no share-into extension, no config
plugin) or adds it to Photos (`saveViewToPhotos`, `expo-media-library` `Asset.create`, after an
add-only permission on iOS / images-only on Android; its config plugin carries the French
`NSPhotoLibraryAddUsageDescription`). Either way the file is released as soon as the operation is
over. Only the save path can confirm an outcome: the share sheet reports none. The captured view is a `shared/ui/ImageExportFrame`, which lays its
content out at a fixed logical size with no transform and no density maths; the boundary then gives the
captured file the exact export pixel size (`shared/lib/image-pixel-size`), so an export never depends
on the device. Features build the view; the boundary knows nothing about them. Both are native
modules: a new development build is required.

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
src/providers/RootNavigator.tsx         root navigation gate over the Auth + Business states
src/providers/root-route.ts             pure route resolution (booting / auth / onboarding / app / …)
src/providers/first-run-seed.ts         one-time production seed (EMPTY since Account V1)
src/providers/development-seed.ts       synthetic clients, pilot catalogs + Agenda fixtures (__DEV__ reset / tests)
src/providers/persistence-failure.ts    the one concise "Enregistrement impossible" alert — and, given a
                                        `BusinessAccessDeniedError`, the BeautIzzy Plus explanation instead

src/features/auth/session/AuthProvider.tsx                     who is signed in?
src/features/business/session/BusinessSessionProvider.tsx      which Business, onboarding, binding
src/features/business/session/CurrentBusinessProvider.tsx      the bound Business for (app) screens
src/features/access/session/BusinessAccessProvider.tsx         what the signed-in professional may do
                                                               (BeautIzzy Plus): `full` / `read-only`,
                                                               resolved by `src/domain/access`; mounted
                                                               below BusinessSessionProvider, above the
                                                               root gate. Enforcement DISABLED: nothing
                                                               is restricted. The source is the RevenueCat
                                                               one when the build holds a valid SDK key
                                                               (Phase 6.1 below), the unconfigured one otherwise
src/features/access/write-guard.ts                             THE refusal of a business mutation under
                                                               read-only access: `useBusinessWriteGuard`
                                                               (called first by every user-initiated
                                                               mutation of the business providers) and
                                                               the typed `BusinessAccessDeniedError`
src/features/access/read-only-copy.ts                          ONE vocabulary for read-only access: a
                                                               sentence per `ReadOnlyReason`, the status
                                                               card lines, the denial alert copy
src/features/access/read-only/ReadOnlyStatusCard.tsx           the subtle read-only status of Accueil,
                                                               from `useBusinessAccess` only
src/features/access/status/                                    « Mon abonnement » (Plus): the verified
                                                               subscription status — pure wording from the
                                                               session's verification, the card, the section
src/features/access/session/use-paywall-offering.ts            the offering of the signed-in user: ONE
                                                               loading lifecycle over the provider's
                                                               `loadOffering`, account-isolated
src/features/access/session/use-plus-checkout.ts               the checkout of the signed-in user: the
                                                               provider's `purchase` / `restore` worded as
                                                               results by THE Plus rule; consumed by the
                                                               development preview only (Phase 6.3)
src/features/access/purchasable-stores.ts                      BUILD constant: the stores purchases are
                                                               enabled for — the Test Store only
src/features/access/paywall/                                   the BeautIzzy Plus paywall PRESENTATION:
                                                               offering boundary, pure presentation rules,
                                                               approved copy, checkout wording, screen and
                                                               components
src/infrastructure/revenuecat/                                 the RevenueCat integration (Phases 6.1–6.3):
                                                               key selection per build, the ONE SDK
                                                               binding, CustomerInfo → domain mapping,
                                                               offerings → PaywallOffering mapping, the
                                                               rejection classifier, the identified-only
                                                               SubscriptionSource with its transactions
```

Business mutation protection. Every user-initiated mutation exposed by the six (app) business
providers (Clients, Services, Products, Sales, Appointments and deposits, Calendar Blocks) and the
ENABLING of a reminder preference calls the write guard as its first statement — before any read
of the committed collection, SQLite write, outbox entry, upload, gateway call or state change — so a
refused operation is refused whole, and an operation legitimately started while access was full is
never rolled back by a later change. The refusal is thrown (`BusinessAccessDeniedError`, carrying
the domain's `ReadOnlyReason` and the operation), like every other refused write: screens already
catch at the call site, so a refusal can never read as a successful save. Two user-facing writes
outside the providers hold the same guard themselves: the Client photo save (before preparing or
uploading the photo) and the lifecycle SMS settings (the screen writes to the server directly).
Never guarded, on purpose and narrowly: remote changes adopted from the sync runner, the push of
entries already queued, previous-day Appointment finalization, local cache writes, the
development reset, onboarding's Business creation and starter catalog, Auth/session housekeeping,
and the WITHDRAWAL of a communication consent (reminders OFF, a lifecycle automation OFF). Tests
mount the real provider through `TestPersistenceProvider` (enforcement disabled by default — the
production state —, enabled with a fake `SubscriptionSource` to validate a refusal). With
enforcement disabled nothing is refused.

Read-only experience (Phase 5). Every catch site that reports a refused write passes its error to
`alertPersistenceFailure`, the ONE connection point: a `BusinessAccessDeniedError` is explained as
subscription access (« Action réservée à BeautIzzy Plus », the domain reason worded by
`read-only-copy.ts` — expired says "no longer active", never-subscribed stays generic, an
unverified subscription is "could not be verified", never expired, never a payment failure), every
other error keeps the generic alert exactly as before. No subscription-specific alert lives in a
feature screen. Accueil shows `ReadOnlyStatusCard` under its top area ONLY while `useBusinessAccess`
reports read-only with enforcement enabled: data kept, reading possible, modifications need Plus,
subscription management to come. No « Découvrir BeautIzzy Plus » action exists yet: it needs the
paywall routing below to lead somewhere real.

Paywall presentation (Phase 5, `src/features/access/paywall/`). A presentation boundary, not a
billing integration:

```text
paywall-offering.ts        PaywallOffering — what a store offers THIS user: `loading`, `unavailable`
                           (not-configured | store-unavailable) or `available` with one PaywallPlanOffer
                           per plan (amount, ISO currency, the store's own formatted string, an optional
                           free trial with its store-answered ELIGIBILITY). `unconfiguredPaywallOffering`
                           is the application's only default.
paywall-presentation.ts    pure rules: valid offers only, annual first and preselected, « Recommandé »
                           only when both plans are offered, « Économisez n % » only when comparable and
                           real, the equivalent monthly price of the annual plan, the trial only when
                           eligible, the primary action (subscribe / loading / not-configured / none),
                           the copy of each PaywallContext (initial-offer, read-only + reason, entitled,
                           verifying).
paywall-copy.ts            the approved copy; no price, period or trial length anywhere in product code.
PaywallScreen.tsx          props in, callbacks out: `onSubscribe(plan)`, `onContinueReadOnly`, `onClose`,
                           `onBack`, `onRestorePurchases`, `onOpenTerms`, `onOpenPrivacy`,
                           `onRetryOffering`. A missing callback renders no control.
testing/paywall-fixtures   the intended French prices and the 14-day trial — tests and the __DEV__
                           preview (Plus › Développement) only; guarded by `paywall-boundary.test.ts`.
```

Ownership: prices, currencies, billing periods and trial eligibility belong to the store adapter
that maps RevenueCat offerings into `PaywallOffering`; the UI formats (the store string first,
`Intl.NumberFormat` otherwise) and never fetches, purchases, restores or writes subscription state.
The screen reports intent only: `onSubscribe(plan)` / `onRestorePurchases` are wired by its caller
— today the development preview, through `usePlusCheckout` (Phase 6.3 below); an `activity`
(purchasing / restoring / verifying) disables and names the primary action and makes the restore
link inert. Where the next phase connects: the account-scoped routing decides the
`PaywallContext` and mounts the screen — after setup completes, for a read-only existing account,
never for an active subscriber — and wires « Explorer sans abonnement » to entering read-only use
without writing any entitlement. No product route mounts the paywall today.

Production activation still requires: enabling the App Store in `PURCHASABLE_STORES` after the
Apple Sandbox validation (purchase and restore exist since Phase 6.3 below, against the Test Store
only; Google Play is not configured); the account-scoped paywall routing; persisted verified
evidence and correct offline startup; server-side enforcement of business mutations on the backend
entitlement mirror (the mirror itself exists since Phase 6.5A below) and server-controlled reminder / SMS suppression; real privacy and terms
URLs; account deletion and privacy-data export. `SUBSCRIPTION_ENFORCEMENT` stays `disabled` until
then.

RevenueCat integration (Phase 6.1, `src/infrastructure/revenuecat/`). The first technical step of
the store integration: SDK, identity and READ-ONLY verification. No purchase, restore, offering,
routing or enforcement change: `SUBSCRIPTION_ENFORCEMENT` stays `disabled`, the paywall keeps its
development fixtures and no product route mounts it.

```text
config.ts                  THE key rule, pure: a development bundle (`__DEV__`) uses the Test Store key
                           (EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY); an iOS release — TestFlight included —
                           the Apple key (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY); an Android release nothing
                           until Google Play exists. APP_VARIANT never decides the compilation: it selects
                           identifiers — and, since Phase 6.4A, the ONE explicit Apple Sandbox opt-in of a
                           debug bundle (`apple-sandbox`, below). A missing key, a key of the wrong family
                           (`test_` / `appl_` prefixes) or a secret key leaves the build UNCONFIGURED — the
                           unconfigured source, never a crash, never a key in a message.
sdk.ts                     the ONE module importing `react-native-purchases`: configure, logIn,
                           getAppUserID, getCustomerInfo, invalidateCustomerInfoCache, the update listener.
                           No logOut (it would create an anonymous identity), no purchase, no restore.
customer-info.ts           pure: CustomerInfo → `SubscriptionVerification`. Only the entitlement `plus`
                           grants. isActive false → expired; no record → never, or expired when a known Plus
                           product was purchased, or unavailable when one is reported active without the
                           entitlement; PROMOTIONAL → complimentary (indefinite only without expiration);
                           TRIAL → trial; willRenew false → cancelled-active (a billing retry stays active
                           with the extended expiration); an expiration already behind now, a missing
                           expiration outside a promotional grant, a FAILED verification, a malformed record
                           → unavailable. The plan comes from an EXACT App Store product identifier,
                           `unknown` otherwise (a Test Store product): access never depends on it.
                           Freshness: an answer whose `requestDate` is older than five minutes (the SDK's
                           foreground cache lifetime) is unavailable, never a fresh revocation or renewal.
subscription-source.ts     the SubscriptionSource over the process-global SDK. Identified-only: configured
                           ONCE, at the first verification, with the Supabase user id as App User ID; another
                           account is switched to with `logIn` (no aliasing from an identified user); sign-out
                           touches the SDK in no way. Every operation runs on ONE serial chain, the SDK identity
                           is checked (`getAppUserID`) before every read, a failed switch leaves the source
                           identified as nobody and nothing is read as nobody. A stale cached answer is
                           invalidated and fetched again; every failure is `unavailable`. The SDK's update
                           event is a trigger, never a payload: the identified user is re-read on the chain and
                           its subscribers notified with a fresh answer — ONE SDK listener, installed with the
                           first subscriber, removed with the last.
index.ts                   `createAccountSubscriptionSource()`: the root's source, built once in `_layout.tsx`
                           and passed to `BusinessAccessProvider` exactly where the unconfigured one was.
```

Offline limitation, unchanged. The SDK's on-device CustomerInfo cache is read through the same
freshness rule, so after a restart without network it is unavailable, not a proof: the 72-hour
offline grace still rests on the in-memory evidence of the session and starts without one after a
restart. Persisted, trusted entitlement evidence remains a requirement before enforcement.
Client-side verification is not a security boundary: the backend entitlement mirror and
server-side enforcement remain mandatory before activation. A native development build must be
rebuilt after adding the SDK (`npx expo run:ios` with `APP_VARIANT=development`); a build that
predates it answers unavailable without crashing.

RevenueCat offerings and the subscription status (Phase 6.2). Still a READ integration: no
purchase, restore, routing or enforcement change.

```text
sdk.ts                     adds `getOfferings` and `checkTrialOrIntroductoryPriceEligibility` — the SDK's
                           own calls, bound here only — and re-exports the SDK enumerations the mapping
                           compares. Still no purchase, restore, sync or logOut.
offering.ts                pure: RevenueCat offerings → `StorePaywallOffering`. `offerings.current` only
                           (dashboard targeting works without a release); the two plans are the predefined
                           packages `$rc_monthly` / `$rc_annual`, read through the offering's `monthly` and
                           `annual` slots and confirmed by their package type — never the array order, a
                           price, a title or a localized name. Every figure comes from the store product:
                           `price` (decimal), `currencyCode` (ISO 4217), `priceString` (the storefront's own
                           string, preferred by the UI), `subscriptionPeriod` (a product whose period
                           contradicts its plan is dropped). A missing, malformed or contradictory package is
                           absent from `plans`; no current offering is an EMPTY offering, never a fabricated
                           plan. A trial exists only when `introPrice` exists AND is free (a paid introductory
                           price is a discount, never a trial); its length is the store's period — unit and
                           count × cycles — never a number written in the app.
subscription-source.ts     `loadOffering(userId)` on the SAME serial chain and the same identification as
                           `verify` (configure once / logIn, `getAppUserID` checked): the offerings, then —
                           for the products that carry a free trial only — the eligibility of THAT user. A
                           failed eligibility check keeps the offering and leaves every trial `unknown`;
                           every other failure (no native module, offline, rejected call, identity drift)
                           answers `store-unavailable`.
```

Trial eligibility rule. A free trial is ADVERTISED (« n jours gratuits », « Essayer gratuitement
n jours ») only when BOTH hold: the store product carries a free introductory period AND the SDK's
eligibility answer for that product identifier is ELIGIBLE. INELIGIBLE, UNKNOWN, a contradictory
NO_INTRO_OFFER_EXISTS, a missing entry or a failed check are `unknown` / `ineligible` and show the
standard price with no trial copy. The check is best-effort (Android always answers UNKNOWN; the
Test Store may too): the store's purchase sheet decides in the end. Dashboard configuration alone
never shows a trial.

Test Store versus Apple. A debug bundle uses the Test Store key (`config.ts`), so the current
offering it reads holds RevenueCat's Test Store products: other identifiers (the plan is then
`unknown` in a verification), possibly other amounts and currency, and possibly no introductory
offer or no eligibility. This is expected, never a defect: the mapping hands over whatever the
store says. TestFlight and App Store builds use the Apple key and read the real App Store
products and prices; Google Play stays unconfigured.

The feature side. `SubscriptionSource.loadOffering?` is the optional store half of the ONE boundary
(a source without a store has none). `BusinessAccessProvider.loadOffering()` binds it to the
signed-in user: `no-account` signed out, `not-configured` without a store, `store-unavailable` on a
rejection — it loads nothing of its own and keeps no offering state. `usePaywallOffering()` owns
the loading lifecycle for a screen: one request per signed-in user (and per `retry`), an explicit
`loading` / `unavailable` / `available` state keyed by the user id, the answer of an older request,
of another user's request or of an unmounted screen dropped — nobody ever reads a previous
account's plans, and nothing is fetched on a render. The paywall presentation is unchanged except
that a trial is a store period (`PaywallTrialPeriod`: day / week / month / year × count; weeks are
said in days) and `no-account` joined the unavailable reasons. The only consumer today is the
development preview's « Offre RevenueCat actuelle » entry (Plus › Développement, `__DEV__` only):
the same `PaywallScreen` over the real offering, with a primary action that says purchases are not
enabled. No product route mounts the paywall.

Subscription status UI (Plus › « Mon abonnement », `src/features/access/status/`). The verified
status, from `useBusinessAccess().verification` ONLY — never from `access.mode` or `canMutate`:
with enforcement disabled every account has full access, which proves no subscription. Pure
wording (`describeSubscriptionStatus`): a verified entitlement shows the « BeautIzzy Plus » badge
(`PlusBrandBadge`) with « Abonnement actif » + plan + « Période en cours jusqu’au … » (no renewal or
payment promised), « Essai gratuit » + « Fin de l’essai le … », « Actif jusqu’au … » + « Sans
renouvellement automatique. » for a cancelled-but-active subscription, « Accès offert » with
« Jusqu’au … » only when an end exists (no billing implied, no date invented); a verified `expired`
or `never` shows no badge, « Aucun abonnement actif », the read-only vocabulary's own sentence and
« Vos données sont conservées et restent consultables. » (true whatever the enforcement: no
permission claimed, no loss announced); a pending or
`unavailable` verification, or a lapsed entitlement (`isVerificationCurrent`), is a neutral
verification state: never "free", never expired, never active. The plan is written only when the
store established it (`unknown` for a Test Store product writes none). Dates: `Intl.DateTimeFormat
('fr-FR')`, day / long month / year. Read-only: no action is drawn (no inert « Gérer mon
abonnement »), no navigation, nothing persisted. Development fixtures of every status feed a
`__DEV__`-only preview sheet (Plus › Développement › « Statut BeautIzzy Plus (test) ») and the
tests; none reaches the provider.

RevenueCat purchases and restoration (Phase 6.3). The store transactions exist, against the
RevenueCat TEST STORE only, reachable from the development preview only. No routing or enforcement
change: `SUBSCRIPTION_ENFORCEMENT` stays `disabled`, no product route mounts the paywall, no
product screen can start a purchase.

```text
sdk.ts                     adds `purchasePackage(pkg)` — the SDK's own call, which sends the PACKAGE
                           identifier and its presented-offering context to the native layer, so only an
                           original package can be bought — and `restorePurchases()`. Re-exports
                           PURCHASES_ERROR_CODE. Still no purchase by product, option or discount, no sync,
                           no logOut.
purchase-error.ts          pure: a rejected transaction → cancelled / pending / a named failure. The SDK
                           rejects with a PLAIN OBJECT (not necessarily an Error) whose `code` is a NUMERIC
                           string once normalized ("1" cancelled, "20" payment pending, "2" store problem,
                           "5" product unavailable, "6" already purchased, "7" / "13" receipt of another
                           account, "3" / "19" not allowed, "10" / "35" / "32" / "33" network, "15" in
                           progress, "23" / "11" / "14" SDK unusable, "42" Test Store simulated failure);
                           a code nested under `userInfo` is read too; the SDK's own "not configured"
                           Error is `sdk-unavailable`; anything else `unexpected`. Nothing is logged.
offering.ts                adds `selectPlanPackages`: the very package object of each presented plan's
                           slot, confirmed by its package type — never a position, a price or a title.
subscription-source.ts     every loaded offering that sells something becomes a SNAPSHOT for the user
                           it was loaded for (the latest only): the package objects behind its plans under
                           an opaque `reference` returned with the offering. `purchase(userId, {reference,
                           plan})` buys the package of THAT snapshot and plan — a reference that is not the
                           user's latest (loaded again since, failed since, another account's, never loaded,
                           an empty offering) is `stale-offering`, and nothing else is bought instead — on
                           the SAME serial chain as every other operation: the identity is confirmed
                           (`getAppUserID`) before the sheet, and a `logIn` requested meanwhile waits for
                           the transaction, so a purchase is always posted for the account it was requested
                           for. A completed transaction answers the verification mapped from the CustomerInfo
                           the store returned WITH it (fresh by construction; `unavailable` when it cannot
                           be trusted, when the SDK drifted meanwhile, or when the record confirms nothing).
                           `restore(userId)` does the same over `restorePurchases`; a restore is never
                           "pending". Neither grants anything. The post-purchase SDK update event follows
                           the existing listener path (one listener, re-read on the chain).
index.ts                   passes the key's store (`test-store` / `app-store`) to the source as its `store`.
```

The feature side. `SubscriptionSource` gains `store`, `purchase?` and `restore?` (outcomes, never
rejections). `BusinessAccessProvider.purchase(request)` / `.restore()` bind them to the signed-in
user: `no-account`, `not-configured` (no transacting source), `not-enabled` (a purchase against a
store absent from `PURCHASABLE_STORES` — the Test Store only in this phase, so an iOS release bound
to the App Store starts no real-money transaction whatever calls it), `operation-in-progress`
(ONE transaction at a time for the whole session, decided by a ref in the provider — never in a
screen; `storeOperation` exposes it). A completed outcome's verification is applied through the
SAME pipeline as every verification (`apply`, then THE domain rule) and supersedes any
verification still in flight (dropped as stale); an outcome landing after the session changed
(sign-out, another account) is applied to nobody and reported as `account-changed`: a transaction
of account A never touches account B's state and is never reported as B's. Nothing restores at
launch, sign-in or foreground: a restore is user-initiated only. `refresh()` now resolves with
the verification it applied (undefined when dropped). `usePlusCheckout()` is the ONE hook a
screen uses: `purchase(offering, plan)` (the offering must carry the adapter's `reference` — a
fixture never does, so a fixture can never be bought from), `restore()`, `retryVerification()`
(a re-verification, never a second purchase), `activity`, `entitled`. It words the outcome with
THE rule of every Plus cue, `hasVerifiedPlusEntitlement`: `activated` / `restored` ONLY for a
verified entitlement in force for this account; a completed transaction the store has not
confirmed yet (unavailable, a lapsed record, no entitlement) is `received` / `restore-received`
— never active, never failed — and offers the re-verification; `nothing-to-restore` is a
confirmed absence, not an error; `cancelled`, `deferred` (a pending payment owns nothing),
`account-changed`, `failed` with its reason. `checkout-presentation.ts` holds the wording
(« Abonnement activé » for `activated` and nothing else; « Achat reçu. Vérification de votre
abonnement en cours. »; « Aucun achat n’a été effectué. »). Accueil's badge and « Mon
abonnement » change nothing: they keep reading the provider's verification.

The development test bench (Plus › Développement › « Aperçu BeautIzzy Plus (test) » › « Offre
RevenueCat actuelle », `__DEV__` only) is the ONLY purchase entry point of the application. Its
primary action is guarded by `test-store-purchase.ts` — every condition, each with its sentence:
a development bundle, a source bound to the TEST STORE (from the source's own `store`, never
APP_VARIANT), an authenticated account, the store's own offering, the plan it sells, nothing in
flight — then confirmed in an alert that names the plan, the exact store price and « Achat de test
— aucun paiement réel » (the Apple trial does not exist in the Test Store, and the screen says
so in an environment notice). The outcome is alerted; an inconclusive one offers « Vérifier à
nouveau ». Once the account holds a verified entitlement the live entry draws the ENTITLED
context (nothing to sell). The restore link runs the user-initiated restore in place, after an
alert stating the Test Store limitation. Fixture scenarios keep their inert action. RevenueCat's
server-side sandbox allowlist (« Allowed App User IDs only ») stays the primary account
restriction; no account is named in code.

The SDK dialog is a native presentation of its own, and the one-modal-at-a-time rule applies to
it. On iOS the Test Store purchase is a `UIAlertController` the SDK presents on the key window's
top-most presented view controller at the instant `purchasePackage` runs; React Native's `Alert`
lives in a `UIWindow` of its own (alert level) hidden as its button callback is dispatched, and
the paywall is a presented Modal. Started from the confirmation alert's callback over the
paywall Modal, the dialog came up drawn but unreachable (iPhone 17 simulator). So the purchase is
a STAGE of the preview sheet, the coordinator that stays mounted whatever is presented: the
confirmation captures the plan and the store offering (its reference) into `checkout-closing`
and the paywall Modal slides down; its real `onDismiss` (iOS; Android at once, the dialog goes
with the prop) enters `checkout`, where nothing of ours is presented and an effect of the sheet
starts the ONE purchase — never a callback of the unmounted paywall, never a timer; the SDK
presents its dialog alone; the outcome is alerted and « OK » presents the live paywall again
(its loader restarts, so an activated account meets the entitled context). The checkout hook is
therefore held by the sheet, not by the paywall it presents. A preview withdrawn during a
checkout drops the alert; the provider has still applied the outcome.

Test Store limitations, stated: no real money, no Apple receipt, no introductory offer, product
identifiers the mapping reads as plan `unknown`, and NO real store history — `restorePurchases`
answers the current customer, so the restore is unit-tested and callable but NOT validated end to
end there. Still required, in Apple Sandbox / TestFlight with the Apple key before `app-store`
joins `PURCHASABLE_STORES`: a real StoreKit purchase sheet, the 14-day trial eligibility, a real
restore on a second device / after reinstall, interrupted and deferred ("ask to buy")
transactions, a renewal and an expiration observed through the listener, and the receipt-of-
another-account case. Remaining before production subscriptions: that validation, the account-
scoped paywall routing, persisted verified evidence, the backend entitlement mirror with server-
side enforcement, real terms and privacy URLs, account deletion and privacy-data export, Google
Play.

Apple Sandbox offering verification (Phase 6.4A). A READ-ONLY development mode that fetches the
real Apple subscription products from the Apple Sandbox — offerings, prices, billing periods, trial
information — in an iOS DEBUG build. No purchase, no restore, no routing, no enforcement change:
`SUBSCRIPTION_ENFORCEMENT` stays `disabled`, `PURCHASABLE_STORES` stays `['test-store']`, the
Test Store remains the default development behaviour, and release / TestFlight builds are untouched.

```text
app.config.js              APP_VARIANT=apple-sandbox → name « BeautIzzy Sandbox », the APP STORE bundle
                           identifier (com.mortyflex.sourisapp, from app.json) and
                           `extra.revenueCat.appleSandbox = true`. ONE variant value sets both, so the `.dev`
                           identifier can never carry the flag. `development` and no variant keep the flag
                           false. No eas.json profile sets the variant: it is for `npx expo run:ios` only.
config.ts                  `RevenueCatBuild` gains `appleSandbox` and `bundleIdentifier`. In a DEBUG bundle
                           with `appleSandbox`: iOS only (`apple-sandbox-ios-only`), the App Store bundle
                           identifier only (`apple-sandbox-wrong-bundle`), then the Apple key
                           (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) bound to `app-store`, `appleSandbox: true`. The
                           Test Store key is never selected once the mode is requested; a release build ignores
                           the flag (same Apple key, `appleSandbox: false`). Refusals name the variant and the
                           bundle, never a key.
index.ts                   `readRevenueCatBuild()`: Platform.OS, `__DEV__`, and — from `expo-constants`'
                           `expoConfig` — the flag and the iOS bundle identifier. The SAME adapter is created;
                           its `store` is `app-store`, so the provider answers `not-enabled` to any purchase.
                           A dev-only console.info announces the mode (variant and bundle, never a key).
purchasable-stores.ts      UNCHANGED: `['test-store']`. An `appl_` key never enables a purchase.
development/               the live entry draws the App Store offering under « Apple Sandbox — lecture seule »,
                           its primary action only explains (`not-test-store`, now worded for the sandbox), NO
                           restore link is drawn (`resolveTestRestoreRefusal` guards the Test Store link the
                           same way the purchase is guarded), and the list row says « Lecture seule : aucun
                           achat, aucune restauration ». Loading, unavailable, retry, the entitled context, the
                           account-scoped loader and the Test Store bench are unchanged.
```

Launching Apple Sandbox mode on the iPhone 17 simulator. Simulator FIRST: a debug build of
`com.mortyflex.sourisapp` installed on a PHYSICAL device collides with the TestFlight installation of
the same bundle identifier: iOS either refuses the install (another signing team) or REPLACES the
TestFlight build with the debug one (iOS normally keeps the data container when the team matches —
do not rely on it). Never do this on the pilot phone; the next TestFlight install would replace the
debug build again. The simulator has no TestFlight installation, so nothing is overwritten and no
local data is touched. Requirements:
`.env` holds `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (`appl_…`), the Paid Apps Agreement is active, the
products are « Ready to Submit », the offering `default` carries `$rc_monthly` / `$rc_annual` bound to
`com.mortyflex.sourisapp.plus.monthly` / `.annual`, entitlement `plus`.

```bash
# 1. regenerate the native project for THIS variant: `expo run:ios` reuses an existing ios/ as is,
#    and the everyday one is BeautIzzyDev with the .dev identifier
APP_VARIANT=apple-sandbox npx expo prebuild --platform ios --clean

# 2. debug build (__DEV__ true), App Store bundle identifier, iPhone 17 simulator
APP_VARIANT=apple-sandbox npx expo run:ios --device "iPhone 17"

# 3. verify at launch (Metro console): the dev-only notice
#    [BeautIzzy] RevenueCat Apple Sandbox mode (APP_VARIANT=apple-sandbox, com.mortyflex.sourisapp): …
#    then sign in, Plus › Développement › « Aperçu BeautIzzy Plus (test) » › « Offre RevenueCat actuelle »

# back to the everyday development build afterwards (the .dev identifier, the Test Store)
APP_VARIANT=development npx expo prebuild --platform ios --clean
APP_VARIANT=development npx expo run:ios --device "iPhone 17"
```

If Metro is started on its own (`npx expo start`), start it with the SAME `APP_VARIANT` as the
installed binary: the flag and the bundle identifier the wiring reads come from the config Metro
evaluates. A mismatch is refused, not guessed: the `.dev` configuration with the flag is
`apple-sandbox-wrong-bundle`, unconfigured, with the explanation in the console.

What the mode can and cannot show. The current RevenueCat offering with the App Store products,
their storefront prices and `priceString`, their billing periods, their introductory offer and this
account's eligibility — exactly what the mapping (`offering.ts`) reads, so a wrong package, product
or period is visible as a missing plan. Known Apple Sandbox limitations: products appear only once
App Store Connect has propagated them (hours after creation or after the agreement became active);
on a simulator the storefront and currency may follow the simulator's region rather than the
sandbox tester's until a sandbox account is signed in; eligibility may answer `unknown` for an
account that never purchased, and StoreKit may prompt for an App Store sign-in — use the Apple
Sandbox tester only, never a real Apple ID; a product fetched here is NOT a proof that a purchase
succeeds (that is the next subphase). The verification of an account that never bought anything is `never`; nothing changes
on Accueil or in « Mon abonnement ».

Apple Sandbox purchase and restore test (Phase 6.4B). The SAME Apple Sandbox mode, now able to
TRANSACT — from the developer preview only, for DEDICATED TEST ACCOUNTS only, on a development-
signed build installed on a physical iPhone. `SUBSCRIPTION_ENFORCEMENT` stays `disabled`,
`PURCHASABLE_STORES` stays `['test-store']` (no product purchase is enabled for the App Store),
release and TestFlight builds, Android and the everyday development build are untouched. Nothing
is purchased or restored automatically, at launch, on a render or while reading the offering.

```text
subscription-source.ts     (features/access) `AppleSandboxMode { testAccounts }` on the source, absent from
                           every other build; a new refusal, `not-test-account`.
config.ts                  reads ONE more variable, EXPO_PUBLIC_REVENUECAT_APPLE_SANDBOX_TEST_ACCOUNTS — the
                           dedicated test accounts, Supabase user ids or emails, comma-separated —
                           normalized (trimmed, lowercase, deduplicated), carried in Apple Sandbox mode only
                           (empty for the Test Store and every release, whatever the variable says), never
                           logged. The dev-only notice COUNTS the declared accounts and names none.
index.ts                   hands `appleSandbox: { testAccounts }` to the adapter, which exposes it as is.
purchase-authorization.ts  THE authorization rule, pure, applied by the PROVIDER with the live `Platform.OS`
                           and `__DEV__`, whatever a screen already checked. A purchase is authorized when the
                           store is purchasable (the Test Store), OR when EVERY independent condition holds:
                           the caller explicitly asked for the Apple Sandbox TEST (`origin:
                           'apple-sandbox-test'` — a product purchase, the default, is never promoted), iOS, a
                           debug bundle, a source carrying Apple Sandbox mode, the App Store, and a signed-in
                           account that `isDedicatedTestAccount` (by id, or by email case-insensitively). A
                           restore is restricted in Apple Sandbox mode only, to the same accounts (a Sandbox
                           receipt is never attached to a real account's RevenueCat customer). Refusals:
                           `not-enabled`, `not-test-account`. The build is checked before the account.
BusinessAccessProvider     `purchase(request, origin = 'product')`; exposes `appleSandbox`; `transact` takes
                           the authorization and refuses before touching the source. One transaction at a
                           time, the session pipeline, `account-changed`: unchanged.
use-plus-checkout.ts       `purchase(offering, plan, origin?)`; exposes `account`, `appleSandbox`,
                           `dedicatedTestAccount` (THE rule read back) so a screen refuses before it asks.
test-store-purchase.ts     the bench guard now knows TWO testable stores: the Test Store, and the App Store in
                           Apple Sandbox mode for a dedicated test account. `store-not-testable` (the App Store
                           without the mode, or no store), `not-test-account`; the others unchanged.
development/               a dedicated test account meets the Apple Sandbox TEST bench: the live row says so,
                           the notice is « Apple Sandbox — achat de test » and states that the Sandbox
                           environment depends on the app's signature and the device's Apple account, not on
                           APP_VARIANT; the primary action confirms « Achat Apple Sandbox (test) » naming the
                           plan, the exact store price, Apple's sheet and « Compte : <email> », then the SAME
                           coordinator dismisses the paywall Modal and starts the ONE purchase with the explicit
                           origin; outcomes are worded by `checkout-presentation.ts` as before (« Abonnement
                           activé » for a verified entitlement only); the restore link runs the user-initiated
                           restore after « Restauration (Apple Sandbox) ». ANY OTHER account — or an App Store
                           source without the mode — keeps the read-only bench: « Apple Sandbox — lecture
                           seule », no restore link, the action only explains.
```

Independent safeguards, from the outside in: `APP_VARIANT=apple-sandbox` at build time (the App
Store bundle identifier AND the flag, from one value); the configuration boundary (iOS, debug, the
App Store bundle, the `appl_` key — the Test Store key is never used for an Apple transaction); the
source's `appleSandbox` (absent from every release); the provider's rule (iOS, `__DEV__`, the mode,
the explicit origin, the declared account); the preview's guard (same conditions, explained first);
the confirmation alert; Apple's own purchase sheet, which is never bypassed and the only place money
is confirmed. No transaction record is made up: the verification is the CustomerInfo the store
answered, through the existing pipeline, and the post-purchase SDK event follows the listener.

The mode is NOT a proof of the Sandbox environment. StoreKit decides it from the app's signature
(a development-signed build on a device → Sandbox) and the Apple account signed in on the device
(a Sandbox tester). The developer verifies both before confirming; the UI says so. A development-
signed build of `com.mortyflex.sourisapp` on a physical iPhone replaces a TestFlight installation
of the same bundle identifier (`docs/release/TESTFLIGHT.md` §2): never on the pilot phone.

Running the test (physical iPhone; the simulator does not fetch the App Store products — not fixed
in this phase):

```bash
# 1. .env: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY (appl_…) and the dedicated test accounts
#    EXPO_PUBLIC_REVENUECAT_APPLE_SANDBOX_TEST_ACCOUNTS=tester@example.com   (or the Supabase user id)
# 2. the native project of THIS variant exists already (ios/BeautIzzySandbox, Phase 6.4A); regenerate it
#    only if it was replaced by another variant: APP_VARIANT=apple-sandbox npx expo prebuild --platform ios --clean
# 3. Xcode › Product › Scheme › Edit Scheme › Run › Options › StoreKit Configuration = None
#    (no .storekit file in ios/, none referenced by the scheme: a local StoreKit configuration would
#    intercept the Sandbox transactions and present fake products)
# 4. device: Settings › App Store › Sandbox Account = the Apple Sandbox tester (never a real Apple ID)
# 5. restart Metro with the variant (the env is inlined at bundle time), run on the device:
APP_VARIANT=apple-sandbox npx expo run:ios --device
# 6. Metro console at launch: « RevenueCat Apple Sandbox mode (…): … 1 dedicated test account(s) declared … »
# 7. sign in with the dedicated test account → Plus › Développement › « Aperçu BeautIzzy Plus (test) »
#    › « Offre RevenueCat actuelle » → the row reads « Achat et restauration de test via la feuille Apple »
```

Still required, in the next subphases, before `app-store` joins `PURCHASABLE_STORES`: the real
device run of this bench (the 14-day trial sheet, a restore on a second install, interrupted and
deferred transactions, a renewal and an expiration observed through the listener, the receipt-of-
another-account case), then the product decision itself.

Server-side entitlement mirror (Phase 6.5A, `supabase/functions/revenuecat-webhook`,
`20261004120000_create_subscription_entitlements.sql`, `docs/architecture/SUBSCRIPTIONS.md`). The
BACKEND half of the subscription: RevenueCat posts every subscription event to a Supabase Edge
Function that authenticates it (the shared Authorization value in constant time, the optional HMAC
signature), validates it, and records it in an append-only history unique on the RevenueCat event
id, then rewrites the row of the PRODUCT the event concerns — one row per (user, environment,
entitlement, product), so a paid subscription and a promotional grant never overwrite each other
and PRODUCTION / SANDBOX never meet — through SECURITY DEFINER functions only the server role may
execute. Effective access is derived from all rows by `subscription_has_plus_access` (PRODUCTION
rows of production stores only, not EXPIRED, end not reached; wired to communications since Phase
6.5B below). The row
is computed from the authoritative fields (expiration, period type, store, grace end), never from
the event name: a paid cancellation keeps the access until its end, a billing issue keeps it
through the store's grace, a product change waits for the renewal, only an expiration ends a
product; a PROMOTIONAL grant without expiration is complimentary access with no end (the pilot's),
revoked deliberately from RevenueCat — a CANCELLATION that ends every grant at once and nothing
else; a delayed or out-of-order delivery is STALE for its product and never applied; a duplicate
changes nothing; a database failure answers 500 with nothing recorded so RevenueCat retries. When
the RevenueCat secret API key is configured, the subscriber's current state is fetched from the
REST API after each event and reconciled product by product, never expiring a row the answer does
not describe. The RevenueCat App
User ID is the Supabase user id and `businesses.owner_user_id` is UNIQUE, so the Business is
derived from the user, never sent. The app reads nothing from the mirror yet, `authenticated` may
only SELECT its own snapshot rows, and nothing is deployed or applied by the phase. The mirror
holds the end of access exactly as RevenueCat knows it: the 72-hour offline grace stays a device
rule for a last-trusted-active state whose renewal cannot be verified, never a server extension of a
confirmed expiration. `SUBSCRIPTION_ENFORCEMENT` stays `disabled`; the reminder / SMS suppression is
Phase 6.5B below; business-mutation enforcement in the sync RPCs, the scheduled re-verification and
the operator backfill tool are Phase 6.5C.

Server-side communication entitlement enforcement (Phase 6.5B,
`20261005120000_add_communication_entitlement_enforcement.sql`, `docs/architecture/COMMUNICATIONS.md`
§46). Email and SMS communications become a Plus capability on the server: behind a SERVER-SIDE
switch — one disabled row of the new `server_feature_flags` table, flipped by hand through an
operator-only function, never the app's build constant — a communication is scheduled and sent only
for a Business whose owner holds verified production Plus access per `subscription_has_plus_access`
(reused, never re-implemented: ACTIVE, TRIAL, a cancelled subscription until its end, a billing grace
until its confirmed deadline, a complimentary grant; never EXPIRED, never a Sandbox or Test Store
purchase, never an account without a mirrored row, no 72-hour server grace). Four boundaries decide
in the database: the appointment reminder reconciliation, the lifecycle SMS reconciliation, the
worker's final check immediately before dispatch (`communications_authorize_dispatch`, which cancels a
claimed record of an unentitled Business in the same call — the guard against a lapse by time and
against a queue filled before the switch), and a trigger on the mirror that suspends pending
communications at a confirmed loss and re-derives future reminders at a regain. Suspension is the
existing terminal CANCELLED state with the `ENTITLEMENT_SUSPENDED` marker: history, preferences and
consent are never touched, nothing is deleted, nothing is replayed on reactivation. The worker holds
no entitlement rule and merely obeys the database's verdict. While the switch is disabled — its
state after this phase — every Business behaves exactly as before. Nothing is applied, deployed or
enabled by the phase.

Sandbox entitlement isolation (Phase 6.5C, step 1, `src/infrastructure/revenuecat/`). The first
client-side step of 6.5C closes the one gap between the device and the mirror: RevenueCat reports,
on every entitlement record, the environment it was unlocked in (`isSandbox` — Apple's Sandbox and
the Test Store are sandbox; TestFlight purchases are Sandbox purchases), and the mapping did not read
it, so a Sandbox subscription read as `active` on the device while `subscription_has_plus_access`
denies it. `mapCustomerInfoToVerification` now takes an `EntitlementEnvironmentPolicy` and reads the
environment BEFORE anything else about the record: under `production-only` a Sandbox record — or one
whose `isSandbox` is not a boolean — is `unavailable` as a whole (never active, never a trial, and
never `expired`: an ended Sandbox subscription is no confirmed end of production access and erases
no production proof); under `sandbox-trusted` production and Sandbox records are read alike. THE
rule choosing the policy is `resolveEntitlementEnvironmentPolicy`, pure, in the adapter, resolved
ONCE per source from its binding and applied to every mapping (verification, push re-read, the
answer of a purchase or a restore): a source bound to the Test Store, or an App Store source in
Apple Sandbox mode with at least one dedicated test account declared, trusts Sandbox records; an
App Store source without the mode — every release, TestFlight included — or in the mode with nobody
allowed to transact reads production only. The policy follows the configuration boundary and the
allowlist of Phase 6.4B, never `__DEV__` alone; `revenuecat-boundary.test.ts` pins the rule, the
single reader of `isSandbox`, the two files that may name the trusting policy, and that no
application module names a mirror table or function (a device verification can never become server
evidence). Observable effect with enforcement disabled: a Sandbox entitlement on a release build
shows no « Plus » mark and « Abonnement non vérifié » instead of « Abonnement actif »; the
authorized Apple Sandbox bench and the Test Store bench are unchanged. Nothing else changes:
`SUBSCRIPTION_ENFORCEMENT` stays `disabled`, no routing, no persistence, no server change.

Persisted entitlement evidence (Phase 6.5C, step 2, `src/features/access/evidence/`). The proof of
the session — the domain's `EntitlementEvidence`, exactly as `updateEntitlementEvidence` produces
it — now survives a restart: `BusinessAccessProvider` receives an `EntitlementEvidenceStore` from
the root layout (ONE row of `souris_metadata`, key `business_access_evidence`, over the device
database; no new table, no new dependency) and mirrors every VERIFIED answer into it, in `apply`,
synchronously: a confirmed entitlement replaces the proof, a confirmed expiration or absence clears
it, an `unavailable` answer — offline, store unreachable — touches nothing. The wire form is
versioned and typed (`entitlement-evidence-store.ts`: version, the user id, the provenance, the
verification instant, the entitlement with its plan and end) and decoded strictly: anything else —
not JSON, another version, a malformed field, an unknown kind — reads as NO proof, never a partial
one, never a crash; `clear` removes an unreadable row too. Every proof carries the PROVENANCE of
the source that produced it (`SubscriptionEvidenceProvenance` on `SubscriptionSource`, declared by
the RevenueCat adapter from its environment policy: `production` for an App Store source without
Apple Sandbox mode — every release, TestFlight included —, `trusted-test-source` for the Test Store
and for Apple Sandbox mode with dedicated test accounts). THE restore rule
(`entitlement-evidence-policy.ts`, pure) decides what a starting session may rest on: the
signed-in user's own proof, trusted by the current source's provenance (a production proof
everywhere; a trusted-test-source proof in a trusted test source only — the Apple Sandbox bench
shares the App Store bundle identifier, and so the device database, with a release, which must
never honour the bench's proof), reliable by the domain's timestamps. Anything else starts the
session without a proof, as a fresh installation does. What the restored proof then GRANTS is the
unchanged domain policy: full until its end, the 72-hour grace from THAT end (never from the
restart) unless the entitlement was cancelled, read-only after; a complimentary grant without end
grants indefinitely. Restoring is synchronous and happens once per signed-in user, when the session
becomes theirs, so no asynchronous hydration exists that a later account could race; a late answer
of a previous session is dropped by the session generation before it could write. Sign-out
persists and clears nothing: like the business data, the proof stays on the device for its owner,
and another account never reads, inherits or erases it. The development data reset leaves the row
alone, like the account binding. The proof is written whatever the enforcement, so the first build
to enforce starts with it. Not a security boundary: a forged row buys at most the domain's 72-hour
grace of local-only access, and nothing in it ever reaches the server. Deferred to later steps: the
server-side refusal of business writes (steps 4 and 5), a clock high-water mark beside the proof (a
clock set back extends what the proof grants; the store is the natural place for the mark — step 7).

Entitlement-aware synchronization (Phase 6.5C, step 3, `docs/architecture/CLOUD_SYNC.md` §26). The
client is prepared for the server refusing business writes for lack of a Plus entitlement — the
structured `ENTITLEMENT_REQUIRED` answer of `sync_push_aggregate` that step 4 will add; the deployed
functions never give it yet. The gateway parses it; the worker treats it as a per-Business,
recoverable restriction: the refused entry stays exactly as it is (payload, operation, revision,
place) with the refusal and the ordinary bounded backoff recorded, nothing is acknowledged or
settled, the Business goes on a persisted HOLD (`persistence/sync/entitlement-hold.ts`, one metadata
row trusted for that Business only) during which not one write is sent — one request per elapsed
backoff, 1, 2, 4 … 60 minutes, never one per tick — and the run goes ON to the pull, so a device
without Plus keeps receiving what others changed. `CloudSyncRunner` reacts to ONE thing: the access
session turning from read-only to full, on which it lifts the hold (the record goes, the deferred
entries become eligible, counts kept) and runs once, in order, through the same single-flight
worker — assuming nothing about the server, whose refusal then records a fresh hold. Authentication
and permission failures, rejections, conflicts and the deployed behaviour are unchanged; with
enforcement disabled the access session never turns, so nothing fires.

Server-side business-mutation entitlement foundation (Phase 6.5C, step 4,
`supabase/migrations/20261006120000_add_business_mutation_entitlement_enforcement.sql`,
`docs/architecture/CLOUD_SYNC.md` §26). The server now holds what the step 3 client was prepared
for: behind a SECOND server-side switch — its own disabled row of `server_feature_flags`,
`BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT`, flipped by hand through an operator-only function,
independent of the communications switch and of the app's build constant — `sync_push_aggregate`
answers exactly `{ "status": "ENTITLEMENT_REQUIRED" }` for a write of a Business whose owner holds no
verified production Plus entitlement, and touches nothing: the check sits after the ownership
check and the argument validation (an ownership failure is still 42501, a malformed call still
22023) and before any row is read or locked, so no version, tombstone or history moves and a
DELETE is refused like an UPSERT. ONE rule decides, `business_mutation_is_entitled(business, at)`:
the signed-in caller owns the Business — the same FALSE for a foreign, a nonexistent or a NULL
Business, revealing nothing — AND either enforcement is disabled or `subscription_has_plus_access`
holds (reused, never re-implemented: ACTIVE, TRIAL, a cancelled subscription until its end, a
billing grace until its deadline, a complimentary grant; never EXPIRED, Sandbox-only, Test
Store-only or an account without a mirrored row; no server-side grace). It is SECURITY DEFINER out
of necessity — the access rule and the flag reader are executable by the schema owner only, so an
INVOKER wrapper running as the owner could not ask them — and is the one function granted to
`authenticated`, so the SECURITY INVOKER push RPC can ask it and the row-level policies of step 5
can reuse it without a second rule. While the switch is disabled — its state after this step —
every push behaves exactly as before, for every Business, including the accounts without any
mirrored row; the pull and count RPCs are untouched. BOUNDARY: this is the sync RPC only. The direct
PostgREST table writes the owner-only policies still permit, the Storage uploads of business media
and the communication preference RPCs are NOT gated yet: step 5. Server-side business-mutation
protection is not complete before it. Nothing is applied, deployed or enabled by the step.

Complete server-side business-mutation protection (Phase 6.5C, step 5,
`supabase/migrations/20261007120000_complete_business_mutation_entitlement_enforcement.sql`,
`docs/architecture/CLOUD_SYNC.md` §26.2, `docs/architecture/COMMUNICATIONS.md` §47). The three
write paths that went around the step 4 RPC are closed with THE SAME rule and no new subscription
interpretation: every INSERT and UPDATE policy of the eleven operational tables (the seven aggregate
families and the four nested child tables) requires ownership AND `business_mutation_is_entitled` in
its WITH CHECK, every child DELETE policy in its USING — replaced UNDER THEIR NAMES so no permissive
policy of the previous shape survives to OR around the rule; UPDATE keeps ownership alone in USING
so a refused update is an explicit 42501 on the new row; the business-media INSERT policy requires
ownership of the Business folder AND the rule through ONE helper mirroring the owner predicate
(`is_business_media_writable`), while SELECT and DELETE stay as they were and there is still no
UPDATE policy; the three communication preference RPCs refuse, with the push RPC's structured
answer `ENTITLEMENT_REQUIRED`, only a request that would turn a switch ON that is not already on —
disabling, keeping an ON switch on and every validation answer are byte-identical. What a read-only
account keeps: every read, the pull and count RPCs, Storage reading and listing, the Business
profile (`businesses` keeps its policies: onboarding and account management are not business
data), disabling any communication, removing a photo, and every service-role path. No broad
exception exists; a consent change the professional records on a client is a business mutation
guarded by the app since Phase 4, and the client's own STOP path is a server-side write. While the
switch is disabled the rule answers TRUE for every owner, so the effective write permissions of the
deployed builds are unchanged. PGlite limits, stated: real Storage API semantics, PostgREST's own
error mapping and Supabase's platform grants are rehearsed on Staging, not proven by the harness.
Production activation stays forbidden until the prerequisites of `SUBSCRIPTIONS.md` §12 hold.

Periodic reconciliation and operator backfill (Phase 6.5C, step 6,
`supabase/functions/subscription-reconciliation`,
`supabase/migrations/20261008120000_add_subscription_reconciliation.sql`,
`docs/architecture/SUBSCRIPTIONS.md` §13). The mirror learns about an account only when RevenueCat
delivers an event about it; two gaps remained — an account whose history predates the webhook, and
a delivery that never came. A second Edge Function closes both with the SAME reconciliation as the
webhook's (its mapping, its merge of the webhook facts, `subscription_apply_reconciliation`), run on a
bounded batch of accounts without a webhook: by an operator (the backfill: one explicit account, an
explicit list, or every Business owner, batch by batch with a continuation cursor) or by a pg_cron
job an operator creates by hand (the sweep: every mirrored account, least recently attempted first,
at most once per minimum age). Every pass is DRY_RUN unless the body says APPLY, and a dry run is
exactly the apply with the writes left out. The RevenueCat client is hardened on the documented v1
facts — the endpoint CREATES an absent customer (201), honoured as "no subscriber", never as a
verified absence; no `X-Platform`; `Retry-After` and a doubling backoff, three attempts, a
ten-second timeout, one request per second — and the pass reports one outcome per account
(APPLIED, CONFIRMED, STALE, NO_SUBSCRIBER, NO_SOURCES, INVESTIGATE, FAILED) in which an absence is
never an expiration, a failed read is never a lost entitlement, nothing is invented, and the three
answers that are not evidence (no customer, no source, a disagreement with a mirrored source in
force or a subscriber shared with another account) are handed to an operator instead of decided.
The migration adds bookkeeping, not rules: a per-account lease (no two passes on one account), the
last attempt and outcome, a bounded failure backoff, and one row per pass with its counts, requests
and report — two server-owned tables nobody reads directly, three SECURITY DEFINER functions the
server role alone may execute, `subscription_has_plus_access` asked for the report and never
re-implemented. The function is reachable through its own named secret key only, reads its own
dedicated RevenueCat secret, and nothing schedules it: no migration names a cron job, both switches
stay disabled, nothing is applied or deployed, the app is untouched.

Offline entitlement clock protection (Phase 6.5C, step 7, `src/domain/access`,
`src/features/access/evidence/`, `BusinessAccessProvider`). The offline policy compares the device
clock with the proof's end and the 72-hour grace after it, and a device clock can be set back. The
session now keeps the high-water mark of the instants it has OBSERVED on that clock — at every
resolution: a verification, a deadline, a foreground return, a restart — persisted beside the proof
(`observedAt`, the evidence row's version 2; a version-1 row is still read, its mark starting at its
verification instant, and rewritten as version 2 at its first observation; a build before this step
reads a version-2 row as no proof, by its own rule). THE domain rule judges what an unverified proof
GRANTS at the later of the clock and that mark (`assessClock`): an entitlement that had ended stays
ended, an elapsed grace stays elapsed, so setting the clock back wins back nothing. A clock behind
the mark by more than a documented tolerance (`CLOCK_ROLLBACK_TOLERANCE_MS`, five minutes — automatic
corrections move a clock by seconds, a manual change by more) is a ROLLBACK: a proven entitlement
still in force at the mark keeps full access until its trusted end, the store's instant, but the
conditional grace — which rests on time having progressed normally — is refused with the existing
`unreliable-evidence` read-only answer until the clock catches up with the mark or a verification
succeeds; a cancelled subscription past its end stays `subscription-expired`; an indefinite
complimentary grant has nothing to win back and nothing refused; a clock behind the proof's OWN
verification instant reads as before (no proof restored, read-only). A VERIFIED answer is never
judged against the mark and resets it to its own instant: the adapter accepts a store answer only
within minutes of the store's request instant, so the store has just agreed on the time — local
observed time and the authoritative verification instant stay two different things. A detection
deletes nothing: the proof, the business data, the outbox and the subscription history stay as
they are. The mark only advances, is restored with the proof it belongs to for the signed-in user
only (another account's mark never judges a session; a trusted-test-source proof and its mark
still authorize nothing in a release), is persisted only through the store's own de-duplicating
`observe`, and costs no timer, no background work and no request. With enforcement disabled
nothing is restricted and the mark is still kept. Limits, stated plainly: a device-only mark is
not trusted time and nothing here is cryptographic — a clock set back BEFORE the application
observed the later instant (while closed, or on a device that never ran through the grace) is not
detected, a tampered database can hold any mark or any proof, and the protection raises the cost
of the one cheap manipulation on an unmodified device to exactly what the server-side mirror
ignores anyway: every write that reaches the server is decided there.

Final enforcement exceptions and user-facing consistency (Phase 6.5C, step 8,
`supabase/migrations/20261009120000_add_client_consent_withdrawal_exception.sql`,
`src/domain/clients/consent-withdrawal.ts`, `docs/architecture/CLOUD_SYNC.md` §26.3,
`docs/architecture/COMMUNICATIONS.md` §47). Two gaps around an expired Plus are closed, nothing
else. First, a client's promotional SMS consent can be WITHDRAWN without Plus — the one business
write that protects the client rather than serving the business, and one the server must receive
to stop sending: ONE rule, mirrored on both sides, defines it (the next consent is OPTED_OUT and
every other identity field is unchanged); the client provider lets exactly that edit skip the write
guard, and the push RPC, in its refusal branch, hands exactly that payload to a SECURITY DEFINER
helper that writes the three consent columns of the owner's own client and nothing else — a grant,
a cleared consent, a bundled change, a new or tombstoned client, another owner's client and every
direct PostgREST write stay refused as before, and a held entry is never discarded. Second, the
server's `ENTITLEMENT_REQUIRED` answer to turning reminders or an automation ON is now parsed by the
communications gateway and explained in the settings screens in its own words
(« L’activation nécessite BeautIzzy Plus. Votre réglage actuel est conservé. »), the switch left at
its stored value; turning OFF never asks. Verified by eye and by the existing tests: the « Mon
abonnement » section already tells an active subscription, a trial, a cancelled subscription inside
its paid period, a confirmed expiration, a pending or unverified state apart, Accueil shows the
read-only card with the policy's own reason, and a reminder the server suspended never reads
« Programmé » (the projection derives the pre-queue state; a dedicated SUSPENDED status is a
documented follow-up). Both switches stay disabled, `SUBSCRIPTION_ENFORCEMENT` stays `disabled`,
nothing is applied, deployed or enabled; the Staging order for steps 4–8 is in `supabase/README.md`.

Business access is time-aware. The answer of `resolveBusinessAccess` holds for one instant, so the
provider re-resolves it — and asks the subscription source again — at every deadline the domain
announces (`nextBusinessAccessDeadline`: the end of the entitlement in force, then the end of the
72-hour offline grace) and whenever the app returns to the foreground (`AppState`), which catches
up on a deadline missed while suspended. One timer per session, aimed at the next deadline (in
steps beyond what a JavaScript timer can wait); a store answer whose entitlement has ended lapses
(`isVerificationCurrent`) and the in-memory proof speaks with the offline policy; a deadline is a
property of the proof and never moves with a retry. Deferred: evidence persistence (after a
restart the session starts without a proof until the store answers), the paywall and the root
subscription gate, and — REQUIRED before enforcement is enabled — the
server-side mirror of the verified entitlement with server enforcement of paid business
mutations, reminders and SMS: the client-side guards are a product boundary, not a security one.

Auth and Business are deliberately two providers (see `docs/architecture/AUTH.md`). Examples may
later include:

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
src/persistence/     expo-sqlite boundary, schema v1 → v8 (forward-only migrations), first-run seed, stores,
                     LocalFiles boundary for durable Product images (plain TypeScript)
src/providers/       PersistenceProvider: migrate → seed once → hydrate → render
```

The domain stays independent from it: `src/persistence` depends on domain types only, and row ↔
domain mapping happens exclusively inside the stores. Screens never see SQL or rows.

Schema v3 adds the local account binding (`business_profile`, one row). Operational cloud sync is
specified in `CLOUD_SYNC.md`: the local outbox (V1B), the push worker (V1C) and the pull / restore
side (V1D) live in `src/persistence/sync/`; SQLite stays the only thing screens read. Since V1D.1 the
first sync is seamless: `src/providers/CloudSyncRunner.tsx` uploads the first data of an account
and rebuilds a new device on its own, and a release build shows NO sync surface — the user
never sees, approves or triggers synchronization. The root navigator only holds an EMPTY device
back until its data is known in the current session (`data-loading` / `data-unavailable` routes,
`CLOUD_SYNC.md` §17.3); a device that holds
data always opens. Two populated sides stay blocked
(`RECONCILIATION_REQUIRED`); conflict resolution, Product image sync and any sync UI remain
deferred.

---

# 17. Networking

The only remote boundary is Supabase, under `src/infrastructure/supabase/`:

```text
config.ts            environment contract (EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY)
client.ts            the single client (expo-sqlite localStorage session storage, AppState refresh)
auth-gateway.ts      AuthGateway adapter        → src/features/auth/gateway.ts contract
business-gateway.ts  BusinessGateway adapter    → src/features/business/gateway.ts contract
```

Rules that already apply:

- transport concerns stay outside the domain (`src/domain/business` is plain TypeScript);
- external data is converted at the boundary (rows → `BusinessProfile`, errors → stable codes);
- remote API shapes never leak into screens or providers, which depend on the gateway contracts;
- tests inject fakes; Jest never reaches Supabase.

Remote scope in V1 is the account only: no operational data crosses this boundary.

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

A developer opening BeautIzzy should be able to answer quickly:

```text
Where is the business rule?
Where is the feature UI?
Where is the route?
Where is the shared visual primitive?
Where is the design specification?
```

If answering these questions becomes difficult, the architecture is becoming too complicated.

BeautIzzy should remain as simple internally as it aims to feel externally.
