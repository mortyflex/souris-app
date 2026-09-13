# Souris — Product

## 1. Product Definition

Souris is a lightweight native mobile application for beauty professionals.

Its purpose is to make the professional's working day easier to understand and manage without the administrative weight of traditional salon-management software.

The first real-world implementation and validation context is:

- one hairdresser;
- one business;
- one professional;
- daily mobile usage.

Souris is not a hairdressing-only application.

The core product should remain appropriate for appointment-based beauty professionals such as:

- hairdressers;
- nail technicians;
- estheticians;
- lash and brow professionals;
- similar independent beauty professionals.

The guiding principle is:

> Generic in the data model, specific in the user experience.

---

## 2. Product Promise

Souris should provide the minimum tools required to manage a beauty professional's activity clearly and quickly.

The product should make the professional feel:

> “I know what my day looks like, who I am seeing, what I need to do, and what time I actually have available.”

Souris does not compete by offering the largest number of features.

It competes through:

- clarity;
- speed;
- excellent daily workflows;
- understanding of real service timing;
- low cognitive load;
- pleasant native mobile interaction.

---

## 3. Product Simplicity

Souris should remain deliberately small.

A feature should not be added merely because another salon-management product offers it.

New capabilities should normally improve at least one of:

- appointment management;
- understanding of the working day;
- client follow-up;
- service configuration;
- processing-time visibility;
- product retail;
- stock management;
- reduction of repetitive daily work.

If a feature does not materially improve one of these areas, it should be questioned.

Souris must not become an ERP.

---

## 4. Primary Navigation

The intended primary navigation is:

```text
Agenda
Clientes
Produits
Plus
```

There is no separate Home dashboard.

Agenda is Home.

The professional primarily opens Souris to understand and manage the working day.

---

## 5. Agenda

Agenda is the core product surface.

It must allow the professional to understand:

- what happens today;
- at what time;
- with which client;
- which service is being performed;
- when the professional is actively required;
- when a client is in processing time;
- where simultaneous clients exist.

The professional may intentionally manage several clients at the same time.

Overlapping appointments are therefore supported.

The visual representation must remain readable when appointments overlap.

Appointments should be shown side by side rather than visually covering one another.

The operational Agenda primarily represents the professional's occupied time. An Appointment may continue
through unattended processing time, but that interval is not rendered as an occupied Agenda card: the normal
grid remains visible so the professional can see the available time. Later staff-required phases appear again
as separate visible segments of the same Appointment.

`CANCELLED` and `NO_SHOW` appointments do not occupy this operational view. They render no Day segment, create no
overlap column, and appear as no active Week row; another appointment at the same time therefore uses its normal
available width. The records remain available through Appointment Details and Client history. `COMPLETED`
appointments remain visible because they represent professional time that was actually occupied.

Agenda provides two complementary views:

- **Jour** is the detailed operational view of professional occupancy, processing gaps, reprises, and overlaps;
- **Semaine** is a compact smartphone overview grouped vertically by day, showing appointment summaries without
  exposing internal phases.

Both views share a single calendar context (`selectedDay`). Switching between Day and Week preserves the selected
calendar day. Day view supports direct week navigation (previous/next) and a shortcut to return to today, so the
professional never needs to switch to Week view solely to navigate the calendar period.

Tapping an appointment from either Agenda view opens its read-only Appointment Details experience.

---

## 6. Real Service Timing

Beauty services do not always consist of one uninterrupted block of professional work.

A service may contain multiple phases.

Example:

```text
Application
15 min
professional required

Processing
35 min
professional not required

Finish
10 min
professional required
```

The client remains in the appointment throughout all phases.

However, the professional may be available during unattended phases.

This distinction is one of the core product concepts of Souris.

It must not be reduced to a cosmetic UI detail.

---

## 7. Services and Techniques

Souris distinguishes two conceptual service types:

```text
SERVICE
TECHNIQUE
```

A SERVICE represents a simple service where the professional is actively required throughout the service.

A TECHNIQUE represents a service capable of containing multiple phases, including unattended processing phases.

The concept is intentionally generic.

Processing time must not be coupled specifically to hair coloring.

Other beauty professions may also use workflows with active and unattended phases.

---

## 8. Appointment Creation

The intended appointment creation experience is fast and mobile-first.

Conceptually:

```text
choose time
→ choose client
→ choose service(s)
→ review
→ create
```

An appointment may contain multiple services.

The resulting appointment timeline is derived from the ordered services and their ordered phases.

Processing time contributes to elapsed appointment duration.

This elapsed Appointment duration must be distinguished from professional visible occupancy in the Agenda.

The first native creation slice follows this interaction:

```text
tap an empty Day grid position
→ Cliente
→ Prestations
→ Résumé
→ Créer le rendez-vous
```

The selected grid position is local time, clamped to the displayed day, and rounded to a fifteen-minute
interval. The professional may tap a visible processing gap because that interval remains part of the
Appointment timeline while the professional is available. Existing appointment overlap never blocks creation.

The Agenda tap is the initial proposal, not a lock: during creation the professional may adjust the start
time in ±5-minute steps on the same local date, within the operational Agenda day — earliest 08:00, latest
19:55, strictly before the 20:00 end boundary. All creation calculations (context, Summary, appointment end)
follow the edited draft start time.

### Prestations step — fast multi-selection

The Prestations step is optimized for fast multi-selection: a compact wrapping two-column grid grouped by
type (`Services`, `Techniques` — never legacy categories), fed by the active shared Service
catalog. Cards show name, concise duration (with quiet `dont X de pose` context for techniques), and price.
Selection is communicated by surface state and a small check indicator; a lightweight count
(`N sélectionnées`) replaces the old sticky selected-services stack. Search filters both sections
independently and selections survive search changes. Selecting a card adds the Service to the end of the
current Appointment order; tapping it again deselects it.

### Résumé step — ordered editable Summary

The Résumé step hosts the selected services as a vertical ordered stack (drag handle + disclosure chevron,
cards collapsed by default, one expanded at a time). The stack order IS the Appointment item order and
therefore the timeline. Expanded cards expose quick adjustments:

- SERVICE: `Prix` and `Durée` (the canonical single staff-required phase);
- TECHNIQUE: `Prix` and a compact per-phase duration editor (`Durées`) — no phase rename, add, remove,
  reorder, or active/processing switching (those structural changes belong to Prestations & tarifs);
- durations must stay positive integer minutes; prices use the supported euro input.

### Creation adjustments become future catalog defaults

During NEW Appointment Creation, adjusted prices and phase durations also update the Service catalog so
future Appointments use them. This is deliberately communicated by a quiet line inside the expanded editor:
« Les modifications seront enregistrées pour les prochains rendez-vous. »

The commit is atomic with creation:

- nothing is written to the catalog on keystrokes — the draft owns the values;
- only Services still selected at successful creation update the catalog (same stable Service id, same
  phase ids and order);
- abandoning or cancelling creation leaves the catalog unchanged;
- deselecting a modified Service drops its draft and never commits it;
- the Appointment snapshot and the catalog update use exactly the same final draft values;
- existing historical Appointments keep their snapshots untouched.

Existing Appointment EDITING keeps its snapshot-specific semantics: retained item adjustments never
rewrite the catalog.

The initial address book and catalog use normalized legacy sources. The Cliente step reads the shared
Client source — the same directory as the Clientes tab — and a new Client can be added directly from
the picker when the person is not found. Client search uses only identity and contact fields. The
Prestations step reads the single shared in-memory Service catalog (`ServiceCatalogProvider`): active
services only, in deterministic import order. Services and techniques preserve their type, ordered
phases, duration, price, and processing semantics; invalid non-numeric prices are excluded with a
diagnostic rather than invented as zero.

The first slice is intentionally in-memory for the current app session. Agenda Day, Agenda Week, and
Appointment Details read the same collection, so newly created, edited, or lifecycle-updated appointments appear
immediately in all three surfaces. Persistence remains outside this slice. Explicit permanent deletion removes an
incorrect or duplicate Appointment from the same in-memory collection; cancellation and no-show remain historical
outcomes handled separately by the lifecycle behavior below.

### Appointment-specific adjustments during creation

During NEW Appointment Creation the professional may adjust, inside the Résumé step's expanded cards:

- the snapshot price of a selected service;
- the duration of a simple Service's single staff-required phase;
- the duration of each TECHNIQUE phase (active and processing).

The Summary step always reflects the adjusted draft values: price, durations, appointment end, elapsed
duration, and total price are recalculated from the adjusted draft.

The FINAL Appointment Creation UX pass changed the previous override rule: on successful creation these
adjusted values are ALSO committed to the Service catalog (`ServiceCatalogProvider`) so future Appointments
use them as defaults — see « Creation adjustments become future catalog defaults » above. The Appointment
snapshot and the catalog update are both built from the same final draft. Abandoning creation, cancelling,
or deselecting a modified Service never touches the catalog. Existing Appointment EDITING remains
snapshot-specific and never rewrites the catalog.

### Service order during creation

The Résumé step hosts selected services as a vertical ordered stack with explicit drag handles. The stack
order defines the AppointmentItem order and therefore the complete appointment timeline: reordering
immediately reorders the draft, and Summary, item start times, and the created Appointment follow the new
order. Catalog grouping is for discovery only — Summary ordering is Appointment ordering. Returning to the
Prestations step preserves selections and draft values, and newly selected services append to the end of
the current order.

---

## 9. Appointment Editing

Existing appointments support service-composition editing:

- adding services from the current catalog;
- removing services, except the final remaining service;
- reordering services;
- editing appointment-specific processing duration where appropriate;
- changing appointment-specific price.

Editing starts from the AppointmentItem snapshots already stored on the appointment. Existing prices, names, phase
structure, and phase durations therefore remain visible even when the catalog has changed. A newly added service
starts from the current catalog configuration and becomes a new AppointmentItem snapshot only when saved.

Appointment Editing is ONE continuous editor with tight vertical rhythm: an editable context surface
(`Modifier la cliente` reassigns the Appointment's Client through the shared picker — identity stays
`clientId`-only; `Changer la date` / `Changer l'heure` edit the draft start), the retained AppointmentItem
stack, and the SAME shared grouped `Services` / `Techniques` compact card grid inline directly below it —
there is no separate add-service screen or mode. Tapping a catalog Service card IMMEDIATELY appends a new
draft built from the current catalog values to the end of the ordered stack (no intermediate add
confirmation); the scroll position stays stable so several Services can be tapped in a row. A catalog card
whose Service is already present in the draft communicates the "already added" state and cannot create a
duplicate; removing the corresponding Appointment item makes the catalog card available again. Retained
items never appear as grid selections and never need their catalog Service to exist, be active, or match
current values; duplicate retained items with the same `serviceId` stay independent drafts with unique
AppointmentItem ids.

Client, `Date`/`Heure`, and service changes all live in the editing draft: they participate in dirty-state
detection; saving writes `clientId`, `startAt`, and items together through the normal Appointment update
boundary (preserving id, business/staff metadata, lifecycle, and notes), so the Appointment immediately
moves between Client histories through existing `clientId`-derived projections. Cancelling/discarding leaves
the original Appointment unchanged. Editing an existing Appointment never writes the Service catalog:
adjustments stay snapshot-specific.

Reordering services recalculates the complete timeline.

The user interface must never independently invent timing behavior.

Timing is a domain concern.

---

## 10. Appointment Lifecycle

Appointments may have lifecycle states such as:

```text
SCHEDULED
CONFIRMED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

Cancellation, no-show, and deletion are different concepts.

The V1 lifecycle is exception-first. A normal appointment requires no administrative start or finish action:

```text
same local calendar day
→ remains SCHEDULED / CONFIRMED / compatibility IN_PROGRESS

next local calendar day
→ automatically COMPLETED
```

There is no `Démarrer` action. Manual completion is `Encaisser` (checkout): once the appointment start time has
been reached, the professional confirms the appointment is finished AND records what was actually received by
card and/or cash. It is available from `SCHEDULED`, `CONFIRMED`, and compatibility `IN_PROGRESS`. The former
plain `Terminer` action no longer exists in the interface; automatic previous-day completion remains the normal
path and never records a payment.

Appointment Details exposes only relevant actions:

- a future `SCHEDULED` / `CONFIRMED` appointment can be modified or cancelled;
- once its start time is reached, it can also be checked out (`Encaisser`) or marked as no-show;
- compatibility `IN_PROGRESS` exposes only checkout as a lifecycle outcome action;
- `COMPLETED`, `CANCELLED`, and `NO_SHOW` are read-only terminal lifecycle outcomes, while permanent deletion
  remains available as a separate secondary data-correction action — refused with « Suppression impossible »
  when the appointment carries a recorded checkout or a linked Product Sale;
- a `COMPLETED` appointment without a recorded checkout (automatic completion, historical records) offers
  `Enregistrer un encaissement`, which records the amounts without changing its status.

### Appointment Details layout

```text
Rendez-vous · Cliente · date · heure · statut
Prestations (ordered services, expandable phases)
Durée totale · Total                          (one banner; no separate active / processing breakdown)
Produits vendus                               (only when a linked Product Sale exists; Total produits)
Note
Encaissement                                  (once checked out: total, Carte / Espèces, Modifier l’encaissement)
[ Revente ] [ Encaisser ]                     (side by side, same height; Encaisser is the primary violet action)
Absence · Annuler · Modifier                  (lifecycle actions, below)
Supprimer                                     (secondary destructive text action)
```

### Checkout (« Encaisser »)

Tapping `Encaisser` opens the canonical Souris sheet `ENCAISSEMENT — Encaisser le rendez-vous` with the keyboard
closed. It shows a compact expectation (`Prestations`, `Produits` when linked Sales exist, `Total attendu`) as a
helper, then two payment rows — `Carte` and `Espèces` — with editable French decimal amounts (`75`, `75,50`)
normalized to integer cents, a `Reste …` shortcut that fills the remaining expected amount with one explicit tap,
`Total encaissé`, and a restrained `Écart : ±…` when the received total differs. Card only, cash only, or a mix
are all valid; a positive total is required unless the appointment costs nothing. Confirming writes the completed
status and the payment in one transaction; the sheet closes and Details shows the `Encaissement` summary.
`Modifier l’encaissement` reopens the same sheet prefilled to correct the split without creating a second record.

Souris does not process payments: no card is charged, no terminal or provider is involved. `Encaisser` records
what the professional received.

Untouched previous-local-day appointments are reconciled at the Appointment session boundary when the app starts,
returns active on a new local day, or crosses a local-day boundary while open. The operation is idempotent. Same-day
appointments are never auto-completed merely because their start time has passed.

### Cancellation

The appointment remains part of history. The professional confirms who cancelled (`CLIENT` or `BUSINESS`) and
may add an optional reason. Cancellation metadata contains:

```text
cancelledAt
cancelledBy
reason?
```

### No-show

The appointment remains part of history. Once the appointment start time has been reached,
`Marquer comme absence` requires an explicit confirmation and records:

```text
recordedAt
```

### Permanent deletion

Permanent deletion is reserved for exceptional cases such as:

- duplicate appointments;
- incorrect entries;
- accidental creation.

Appointment Details exposes `Supprimer définitivement` only in its secondary/destructive actions. Tapping it opens
a focused confirmation explaining that the Appointment will disappear from both Agenda and Client history and
that the operation is irreversible. Confirming removes the exact record from the in-memory Appointment session,
uses restrained destructive feedback, and returns to the previous screen without showing a not-found state.

Cancellation and no-show must never silently delete historical information. Their metadata remains attached until
the professional explicitly chooses permanent deletion.

Agenda Day and Week keep completed appointments visible with calmer treatment. Cancellation and no-show remain in
history but are excluded before Agenda occupancy and overlap placement, so their former time becomes visibly free.
Active/completed geometry, ordered phases, processing gaps, reprises, and overlaps remain unchanged.

---

## 11. Clients

Clients are a core Souris entity.

The Client model is one stable identity used everywhere:

```text
id
firstName
lastName?
phone?
email?
birthday?    { month, day } — day + month only, never a year
```

A Client selected during Appointment creation is the SAME Client later used
by the Agenda, Appointment Details, Client Profile, and Client history.
Relationships use `clientId` only. Editing a Client's identity never rewrites
Appointments — every surface resolves identity through the stable id.

### Directory and search

The Clientes tab is the complete Client directory: a prominent, fast search
over first name, last name, full name, and phone. Search is case-insensitive,
accent-insensitive, and tolerant of ordinary phone formatting differences
("06 12 34 56 78" finds "0612345678"). The default list order is a
deterministic French alphabetical order (firstName, then lastName) — never
the import order.

The directory groups Clients by lifecycle:

```text
Clientes
  search
  Actives     every Client in daily use
  Archivées   archived Clients — visually secondary, still searchable
```

Search covers both groups and keeps the grouping, so an archived Client can
always be found again. Empty groups do not render. An archived row keeps its
name and phone with muted colors and a subtle `Archivée` mention — it never
looks deleted or erroneous.

### Creating and editing a Client

A restrained `Ajouter une cliente` action opens the shared Client form
(Prénom required; Nom, Téléphone, Email, Anniversaire optional). A new
Client appears immediately in the directory and in the Appointment Creation
picker, and can be created directly from the picker when the person is not
found.

The same form, in edit mode, is opened from the Client Profile via
`Modifier`. Existing values hydrate the form; saving updates the Client
immutably (stable id) and propagates immediately to every surface.

### Client Profile

The Client Profile is a full business screen containing:

- identity (name, subtle initial);
- contact information (phone, email, birthday) — only existing fields;
- the next upcoming Appointment when one exists;
- derived activity: Rendez-vous réalisés, Total dépensé, Absences,
  Annulations — always derived from Souris Appointment state, never stored;
- upcoming Appointments and Souris history (terminal outcomes included).

The Client Profile structure stays stable from client to client: the
`Activité` section is always visible (zero values are valid information) and
the `Rendez-vous` section always shows its restrained empty state when there
is no Souris history.

Activity rules are explicit: completed and no-show counts come from their status; `Annulations` counts only
`CANCELLED` appointments whose recorded actor is `CLIENT`. A `BUSINESS` cancellation remains visible in history as
`Annulé par le salon` but does not count against the Client. `Total dépensé` is the sum of AppointmentItem snapshot
prices for COMPLETED appointments only. History rows open the existing Appointment Details. Permanently deleting an
Appointment removes its history row and all derived count or spending contributions without mutating the Client.

### Client lifecycle — archive, reactivate, permanent deletion

Archiving is the normal way to remove a Client from daily use; it is
reversible and keeps every history. Permanent deletion exists only for
Clients without any history, and only from an archived profile:

```text
Active  →  Archiver la cliente  →  Archivée  →  Réactiver la cliente  →  Active
                                       ↓
                            Supprimer définitivement   (only if safe)
```

On an ACTIVE profile, `Archiver la cliente` is a restrained tertiary
management action placed after the history sections, away from the business
actions. Archiving asks no confirmation (it is reversible), gives restrained
haptic feedback, and moves the Client under `Archivées`.

On an ARCHIVED profile:

- a subtle `Archivée` mention sits under the name;
- `Réactiver la cliente` replaces `Vendre un produit` as the lifecycle action;
- no NEW business action is offered (`Vendre un produit` is hidden, and
  Appointment Details hides `Revente` for an archived Client);
- Activité, contact information, Rendez-vous, and Produits achetés remain
  fully visible — history is never hidden;
- `Modifier` still edits identity without changing the lifecycle;
- `Supprimer définitivement` appears as tertiary destructive text.

Archived Clients are never offered by the Client pickers (Appointment
creation, Appointment editing, Sale creation), and a stale route parameter
never preselects one for a new Sale. Reactivating restores every normal
action immediately; an action attempt never reactivates a Client by itself.

Tapping `Supprimer définitivement` first checks the stored references. When
the Client has no Appointment and no Sale, a focused confirmation asks
`Supprimer définitivement cette cliente ?` — `Cette action est irréversible.`
— then deletes her from Souris (directory, session, database). When ANY
Appointment (whatever its status) or Sale references her, Souris shows a
concise explanation instead of a confirmation that could never succeed:

```text
Suppression impossible
Cette cliente possède un historique de rendez-vous ou de ventes.
Conservez-la archivée pour préserver cet historique.
```

There is no cascade option and no anonymization. Deletion gives warning
haptic feedback only after it actually succeeded.

### Birthday

`birthday` is an optional day + month pair (`{ month, day }`), never a
timestamp and never a year: Souris only needs it to recognize an upcoming
birthday, offer a birthday promotion and show it. The Client form asks for the
day and the month with an inline selector (no keyboard, no year wheel;
February offers 29 days), and the profile shows a friendly French day + month
(e.g. `12 octobre`). Birthday promotions and reminders are future features;
age display is out of scope by design (`docs/domain/CLIENTS.md` §2).

### Purchased products

The `Produits achetés` section of the Client Profile derives from the Sale
session through `sale.clientId` (Sales V1, §12). The profile identity block
carries the `Vendre un produit` action, which opens the Sale flow with this
Client preselected. The section lists completed Product purchases newest first, rendered from Sale snapshots (`productName`,
`quantity`, `unitPrice`) with a per-sale total, and shows a restrained empty
state otherwise. It is never stored on the Client, and it does not change the
Appointment-derived `Total dépensé` metric.

### Legacy import

Initial client data may be migrated from an existing address book.

Only identity/contact information is imported:

```text
_id       → id
firstName → firstName
lastName  → lastName
telephone → phone
email     → email
birthdate → birthday (day + month of a well-formed YYYY-MM-DD; the year is dropped)
```

Existing commercial history is intentionally not migrated.

Souris starts its own activity history from zero.

Do not import legacy:

- visit counts;
- spending;
- average basket;
- last visit;
- no-show history;
- old notes.

Do not invent missing client information.

---

## 12. Products

Products are a primary product area.

### Produits V1 — catalog & current stock

The `Produits` tab hosts the professional-managed Product catalog:

- the canonical catalog lists `Actifs` / `Inactifs` groups in deterministic French alphabetical
  order, seeded once from the normalized legacy product dataset (one-way import);
- search covers name, brand, category, and barcode (case- and accent-insensitive; barcodes match
  exactly as entered, leading zeroes preserved);
- catalog rows keep a compact management layout and add one small primary-image thumbnail; Products
  without a photo use the same restrained lavender package fallback rather than fabricated imagery;
- `Ajouter un produit` opens the shared Product form (Photo, Marque, Catégorie and Code-barres
  optionnels; Nom, Prix and Stock requis — stock defaults to 0 for a new product);
- product details show identity, an optional primary image, price, optional informations
  (brand/category/barcode, omitted when absent), and current stock (`Stock épuisé` when zero);
- `Modifier` reuses the same form with exact hydration; `id`/`businessId` are stable;
- `Désactiver` / `Réactiver` move the product between management groups (details close after the
  state change); `Supprimer définitivement` removes an erroneous/duplicate record after explicit
  confirmation;
- current stock is direct V1 state — no stock-movement history, thresholds, or alerts yet.

### Product Photos V1

Each Product may have one optional primary photo. In the shared create/edit form the image area
itself is the interaction: tapping it opens a compact Product photo sheet offering `Prendre une
photo`, `Choisir dans la photothèque` and, when a photo exists, `Supprimer la photo`. Taking a photo
closes that sheet and then presents a dedicated in-app Product camera (large native sheet with a
live preview, one instruction, one shutter); the library uses the system picker. Acquisition and removal update only the local form
draft: cancelling keeps the canonical Product unchanged, while Save commits the final `imageUri`
together with the other Product fields. Photo actions never create a Product, change stock, or
change activation state.

Camera and photo-library permissions are requested only from the corresponding user action. Both
paths return a local URI suitable for the current in-memory session; Souris does not persist,
upload, synchronize, or fabricate Product images in V1. Legacy Products therefore start without
images.

On iOS 17 and later, a small local Apple Vision enhancement automatically attempts foreground
subject extraction (`VNGenerateForegroundInstanceMaskRequest`) after acquisition, crops the result
to the subject bounds with a small transparent margin, and writes a new transparent PNG to the app
cache, so the Product naturally fills its presentation surface. The original camera/library asset is
never changed. Unsupported iOS versions, Android, processing errors, no detected subject, and
processing timeout all keep the original photo, so image processing never blocks Product creation or
editing. The native enhancement requires a development build; no server or third-party segmentation
service is involved.

### Barcode Scanner V1

Barcode scanning accelerates catalog lookup and Product data entry without changing Product or
stock semantics:

- the catalog search field exposes a camera action; one exact match opens Product Details, no match
  offers `Ajouter un produit` with the exact scanned barcode prefilled, and multiple matches require
  the professional to choose rather than opening an arbitrary Product;
- create and edit forms expose the same scan action beside the optional barcode field; a detection
  updates only the local form draft and reaches the canonical catalog only through the normal save
  action;
- manual barcode entry remains available, leading zeroes are preserved, and duplicate barcodes are
  allowed (with a quiet informational hint in the form);
- opening or completing a scan never changes `stockQuantity` and never creates a Sale.

Camera permission is requested only when the scanner opens. Permanent denial explains that manual
entry remains possible and offers a direct route to device settings.

### Sales V1 — completed Product sales

Product sales primarily happen from the Client context. Three entry points open the SAME
`Nouvelle vente` flow:

```text
Client Profile        → Vendre un produit   (primary — Client preselected)
Appointment Details   → Revente             (primary — the Appointment's Client preselected)
Produits              → Nouvelle vente      (secondary — walk-in, no Client)
```

From the Client Profile and Appointment Details the Client is resolved on the first render — the
professional never selects them again and never sees a transient « Aucune cliente ». A Sale opened
through `Revente` also carries the Appointment it was sold during, so Appointment Details lists it
under `Produits vendus` (name, quantity, snapshot unit price, line total, `Total produits`) as soon
as the professional returns — a Sale opened from Produits or the Client Profile carries no
Appointment. `Revente` stays available on completed appointments because that is a natural moment
to sell a Product. The wording is context-specific: `Revente` in Appointment Details,
`Vendre un produit` on the Client Profile, `Nouvelle vente` in Produits. On success the flow simply returns to where it was opened
(Client Profile, Appointment Details, or Produits), and a Client-attached Sale appears in that
Client's `Produits achetés`.

In Appointment Details, `Revente` (shopping-bag icon + label, lavender) sits side by side with
the primary `Encaisser` (card icon + label, violet) in one row of equal height, ABOVE the
lifecycle actions (`Absence` / `Annuler` / `Modifier`); it is never presented as another lifecycle
outcome. When the Client is archived, `Revente` is withheld and `Encaisser` takes the row. The Produits tab keeps `Nouvelle vente` beside
`Ajouter un produit` as the walk-in entry.

The flow is one focused native form sheet (`Nouvelle vente`), presented like the other Souris
creation flows; a draft holding lines asks « Abandonner la vente ? » before `Annuler`, swipe, or
back can discard it. The flow itself:

- `Cliente` is optional — `Aucune cliente` when opened from Produits (a walk-in sale).
  `Choisir une cliente` reuses the shared Client picker; once chosen or preselected, `Modifier`
  and `Retirer` stay available until completion. Selecting a Client never mutates the Client
  session;
- `Produits`: the same search field as the catalog (name, brand, category, barcode — ACTIVE
  Products only) with the camera action. Tapping a result adds the Product immediately with a
  restrained selection haptic; tapping it again increments its line — the same Product is one
  line with a quantity, never a duplicated row. Scanning reuses the shared scanner: a unique
  active match is added/incremented, an inactive-only match shows « Ce produit est inactif. »,
  an unknown barcode shows « Produit introuvable » with `Fermer` (no Product creation from a
  Sale), several active matches ask which one to add;
- each line shows the Product thumbnail/fallback, name, unit price, a quiet `Stock N` hint, a
  `−  n  +` control and the line subtotal, plus an explicit remove action. `+` is disabled at
  current stock, `−` at quantity 1; zero-quantity lines never exist; adding a Product without
  remaining stock is refused with a concise notice;
- `Total` is derived (`Σ unitPrice × quantity`) with the usual money formatting — no tax or
  payment breakdown;
- `Valider la vente` is enabled only when at least one line exists and every line is valid
  against the CURRENT catalog (Product exists, is active, stock sufficient). Success creates the
  immutable completed Sale, decrements every involved Product stock, gives a success haptic, and
  returns to `Produits` where the updated stock is visible immediately. A final stock failure
  keeps the screen open, explains which Product lacks stock, and mutates nothing.

Sales V1 deliberately excludes: pending orders, payment methods on standalone Sales, card
terminal, refunds, returns, discounts, per-sale price editing, VAT, receipts, accounting, revenue
dashboard, a Sales history screen or tab, and loyalty. Stock remains direct V1 state: there is
still no stock-movement history — a completed Sale simply decrements the quantity.

**Standalone Product Sale payment.** `Produits → Nouvelle vente`: after `Valider la vente` the same
Souris checkout sheet (`ENCAISSEMENT — Encaisser la vente`) shows `Total vente` and the `Carte` /
`Espèces` rows, keyboard closed; card only, cash only, or mixed; a positive received total is
required when the Sale total is positive; the received total may differ. Confirming completes the
Sale with its payment and decrements stock in one operation; `Annuler` returns to the draft with
nothing sold. A Sale opened through `Revente` from Appointment Details skips this step: its money is
recorded by the Appointment checkout. Historical Sales without payment are never assigned a method.

Product management should remain simple.

Souris should not become a full retail or ERP platform.

---

## 13. Prestations & Tarifs

Service catalog management belongs under:

```text
Plus
→ Gestion
→ Prestations & tarifs
```

It is business configuration, not a hidden technical setting.

The screen lists the canonical catalog grouped by activation and then by type — `Actives`
(`Services`, `Techniques`) and `Inactives` (same split). Rows use the
professional-facing summary: name, price, duration, and processing context (`dont X de pose`).
Only non-empty subsections render; legacy categories never reappear.
`Ajouter une prestation` opens a dedicated sheet where the professional first chooses:

```text
Prestation simple
Prestation technique
```

A simple service has one duration; a technique exposes an ordered phase editor where each phase
is `Temps actif` (professionnelle occupée) or `Temps de pose` (professionnelle disponible).
Phases can be added, edited, removed, and reordered. The phase editor is an accordion: only one
phase is expanded at a time; adding a phase collapses the current one and expands the new one, and
collapsed phases show a compact identity (index, name, semantic type, duration, drag handle).
A processing phase has one canonical user-facing identity — `Temps de pose` — and therefore has no
custom name field; only its duration and type are configured. Switching a phase back to active
restores its previous draft name when available, and an active phase always requires a real name.

The current product classification is explicit: a `Service` has NO pose (the professional is
occupied for the whole duration), while a `Technique` contains at least one `Temps de pose`. A
technique cannot be saved without a processing phase, an existing technique cannot save after
losing its final processing phase, and a Service can never acquire one — the type is immutable.
No fake zero-minute processing phase is ever created.

Existing services open in read mode with `Modifier`, `Désactiver` (or `Réactiver` when inactive),
and a tertiary `Supprimer définitivement` text action. Deactivation simply removes the service
from new Appointment selection while existing Appointment snapshots remain untouched.

Permanent deletion removes the catalog record only: it requires explicit destructive confirmation
explaining that existing Appointments remain unchanged, then closes the Service Details sheet.
Deletion never cascades into AppointmentItems, Agenda timelines, or Client history — a deleted
Service simply cannot be newly added anymore. Deletion is available for both active and inactive
services.

The catalog is the SINGLE runtime service source shared by Prestations & tarifs, Appointment
Creation, and Appointment Editing additions. It is seeded once from normalized legacy data
(`legacy-services` / `legacy-techniques`), which are one-way import sources and never parallel
runtime catalogs. The catalog is in-memory for the current session.

Future directions (not implemented): category, online-booking visibility.

---

## 14. Existing Service Interaction

For an existing service:

```text
read mode
→ Modifier
→ Désactiver / Réactiver
→ Supprimer définitivement
```

After entering edit mode:

```text
Annuler
Enregistrer les modifications
```

`Désactiver` closes the details sheet after confirmation and moves the service to `Inactives`;
`Réactiver` does the same toward `Actives`. The exported design showing `Fermer / Enregistrer`
for an existing service is explicitly overridden by `docs/design/DESIGN_OVERRIDES.md`.

---

## 15. Remises

Simple discounts may eventually be managed under:

```text
Plus
→ Gestion
→ Remises
```

Potential examples include:

- manual discounts;
- birthday discounts;
- student discounts;
- simple commercial offers.

The feature must remain simple.

Do not build an advanced promotion-rule engine without a concrete product need.

---

## 16. Plus

The `Plus` area contains less frequent business management.

Intended direction:

```text
Gestion
- Prestations & tarifs
- Remises
- Réservation en ligne — future

Salon
- Informations du salon
- Horaires & disponibilités
- Équipe — future

Préférences
- Notifications
- Préférences Agenda
- Apparence — only if useful

Compte
- Profil
- Sécurité
- Abonnement — future
- Aide
```

Current implementation: the `Gestion` section holds `Prestations & tarifs` and `Caisse`.

### Caisse (Cash Register V1)

`Plus → Caisse` shows, in one glance, the money the professional received:

```text
Jour | Mois                              (segmented control; Jour is the default)
‹  Samedi 12 septembre 2026  ›           (previous / next day; « Aujourd’hui » shortcut when elsewhere)

1 240,00 €                               (large, navy)
encaissé aujourd’hui                     (« encaissé ce jour » / « encaissé ce mois-ci » / « encaissé ce mois »)
3 encaissements

[ Carte   980,00 € ]  [ Espèces   260,00 € ]
```

- `Jour` sums the payments whose `paidAt` falls on the selected device-local civil day; `Mois` sums the
  selected calendar month (never a rolling 30-day window); previous / next navigate freely into history, and
  tapping the displayed day opens the canonical Souris date picker to jump to any historical day;
- the amounts derive ONLY from money explicitly recorded: appointment checkouts (`appointment.payment`) and
  standalone Product Sale payments (`sale.payment`). Automatically completed appointments, cancellations,
  no-shows and Sales without payment contribute nothing; a Sale sold during an appointment is already inside
  the appointment's recorded amount and is never added a second time;
- the wording is « encaissé » — what was received — never an accounting-grade turnover claim;
- editing a checkout updates the register immediately; nothing is stored or cached;
- an empty day or month simply shows `0,00 €` with `Carte 0,00 €` / `Espèces 0,00 €` — no illustration;
- no chart, accounting table, VAT, expense, or profit view. Not V1.

The Client `Total dépensé` metric is unchanged and independent from the Cash Register.

Account & Onboarding V1: a `Compte` section shows the Business identity
(name + activity, e.g. `Maison Léa` / `Coiffure`) and opens a restrained account sheet (activity,
responsable, email, phone, `Se déconnecter`). Sign-out asks for an explicit, non-alarming
confirmation: "Les données restent enregistrées sur cet appareil." Souris never claims local data is
backed up or synchronized — operational cloud sync does not exist yet. The Souris brand block stays
at the bottom of Plus.

Do not implement future entries merely because they are documented here.

They describe product direction, not current implementation scope.

---

## 17. Onboarding

Onboarding should be short.

Implemented (Account & Onboarding V1) — four steps, no tutorial carousel:

```text
1. Welcome        brand composition, one promise, `Commencer` / `J'ai déjà un compte`
2. Account        email + password (create or sign in; email confirmation handled when enabled)
3. Business setup prénom *, nom, nom de votre activité *, votre activité *, téléphone professionnel
4. App
```

Wording: "Nom de votre activité" (never "Nom du salon") — Souris serves every appointment-based
beauty profession and independent workers; placeholders never imply hairdressing only. Activities:
Coiffure, Barbier, Onglerie, Esthétique, Cils & sourcils, Autre. Nothing else is asked at first run
(no address, SIRET, VAT, hours, social links, logo, staff, banking, subscription).

A fresh install starts empty: no pilot Clients, Appointments, Products, Services, or Sales. An
existing install keeps its local data; completing Business setup binds that data to the new
account without duplication or reset. Password recovery is intentionally absent from the UI in V1.
See `docs/architecture/AUTH.md`.

The three content screens below remain the documented direction for a later, optional
introduction; they are not implemented.

Target:

approximately three content screens before authentication.

The experience should introduce:

### Screen 1

```text
Votre journée, plus légère.
```

Introduce Souris and the Agenda.

### Screen 2

```text
Voyez votre temps autrement.
```

Explain active time versus processing time visually.

### Screen 3

```text
Votre activité. Sans la lourdeur.
```

Introduce the essential ecosystem:

- Agenda;
- Clientes;
- Produits.

Primary final CTA:

```text
Commencer
```

Do not build a long tutorial.

---

## 18. Future Customer Self-Booking

Customer self-booking is an intended future capability.

It is not part of the initial implementation.

A customer may eventually select:

```text
service
→ available slot
→ personal information
→ confirmation
```

This capability must use a dedicated booking availability policy.

It must not simply expose every time where the professional could technically force an appointment into the agenda.

---

## 19. Professional Scheduling vs Customer Booking

These are explicitly different concepts.

### Professional scheduling

The professional controls their own agenda.

They may intentionally overlap appointments.

Overlap is non-blocking.

### Customer self-booking

The customer must only be offered slots that the business considers bookable.

Future booking availability may consider:

```text
working hours
staff availability
breaks
time off
existing appointments
service phases
processing time
booking lead time
booking horizon
blocked periods
concurrency policy
```

Do not implement these rules before the dedicated booking phase.

---

## 20. Multi-Staff Direction

The first real-world context contains one professional.

The domain nevertheless preserves concepts such as:

```text
businessId
staffMemberId
clientId
```

This allows future evolution without changing the identity model.

It does not mean Souris should currently implement:

- staff management;
- roles;
- permissions;
- multi-location;
- rooms;
- equipment scheduling.

---

## 21. Product Design

Approved design sources live under:

```text
docs/design/
```

Runtime brand assets live under:

```text
assets/brand/
```

The design language should feel:

- warm;
- light;
- calm;
- premium;
- native;
- slightly playful;
- professional.

Avoid generic SaaS visual language.

---

## 22. Product Decision Rule

When product decisions are ambiguous, prioritize:

```text
clarity
→ speed
→ touch comfort
→ correctness
→ visual elegance
```

If a visually sophisticated interaction makes daily usage slower or harder to understand, simplify it.

Souris exists to make the professional's day lighter.
