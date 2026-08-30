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

The initial address book and catalog use normalized legacy sources. The Cliente step reads the shared
Client source — the same directory as the Clientes tab — and a new Client can be added directly from
the picker when the person is not found. Client search uses only identity and contact fields. Services
and techniques preserve their type, ordered phases, duration, price, and processing semantics; invalid
non-numeric prices are excluded with a diagnostic rather than invented as zero.

The first slice is intentionally in-memory for the current app session. Agenda Day, Agenda Week, and
Appointment Details read the same collection, so newly created, edited, or lifecycle-updated appointments appear
immediately in all three surfaces. Persistence remains outside this slice. Explicit permanent deletion removes an
incorrect or duplicate Appointment from the same in-memory collection; cancellation and no-show remain historical
outcomes handled separately by the lifecycle behavior below.

### Appointment-specific adjustments during creation

During Appointment Creation the professional may adjust, for the appointment being created only:

- the snapshot price of a selected service;
- the duration of unattended processing phases (`requiresStaff = false`) of a selected TECHNIQUE.

These adjustments apply exclusively to the AppointmentItem snapshot being created. The normalized catalog
Service and the raw legacy sources remain unchanged, and future appointments keep the catalog defaults.
The Summary step always reflects the adjusted snapshot values: price, processing duration, appointment end,
elapsed duration, and total price are recalculated from the adjusted snapshot. A SERVICE never exposes a
processing editor.

### Service order during creation

Multiple selected services can be reordered by dragging their explicit drag handle in the `Sélectionnées`
area. The selection order defines the AppointmentItem order and therefore the complete appointment timeline:
reordering immediately reorders the draft, and Summary, item start times, and the created Appointment follow
the new order. Reordering never rebuilds a draft from catalog defaults — custom prices and processing
durations travel with their service.

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

There is no `Démarrer` action. `Terminer` is an optional immediate shortcut once the appointment start time has
been reached. It is available from `SCHEDULED`, `CONFIRMED`, and compatibility `IN_PROGRESS`.

Appointment Details exposes only relevant actions:

- a future `SCHEDULED` / `CONFIRMED` appointment can be modified or cancelled;
- once its start time is reached, it can also be completed or marked as no-show;
- compatibility `IN_PROGRESS` exposes only completion as a lifecycle outcome action;
- `COMPLETED`, `CANCELLED`, and `NO_SHOW` are read-only terminal lifecycle outcomes, while permanent deletion
  remains available as a separate secondary data-correction action.

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
birthDate?   YYYY-MM-DD civil calendar date
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

### Creating and editing a Client

A restrained `Ajouter une cliente` action opens the shared Client form
(Prénom required; Nom, Téléphone, Email, Date de naissance optional). A new
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

### Birthday

`birthDate` is an optional civil calendar date (`YYYY-MM-DD`), never a
timestamp. It is displayed as a friendly French date (e.g. `12 octobre
1994`). Birthday promotions, reminders, and age display are future features.

### Purchased products

A future `Produits achetés` section of the Client Profile will derive from
the future Sales/Transaction domain through `clientId`. It is never stored on
the Client itself, and no purchased-product data or sales architecture
exists yet.

### Legacy import

Initial client data may be migrated from an existing address book.

Only identity/contact information is imported:

```text
_id       → id
firstName → firstName
lastName  → lastName
telephone → phone
email     → email
birthdate → birthDate (only valid YYYY-MM-DD civil dates)
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

Future capabilities may include:

```text
product catalog
search
categories
brand
barcode
price
stock
retail sale
```

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

A service may eventually expose:

```text
name
category
type
price
phases
durations
processing time
active/inactive
```

Future online-booking visibility may also be configurable.

---

## 14. Existing Service Interaction

For an existing service:

```text
read mode
→ Modifier
→ Supprimer
```

After entering edit mode:

```text
Annuler
Enregistrer les modifications
```

The exported design showing:

```text
Fermer
Enregistrer
```

for an existing service is explicitly overridden by:

```text
docs/design/DESIGN_OVERRIDES.md
```

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

Do not implement future entries merely because they are documented here.

They describe product direction, not current implementation scope.

---

## 17. Onboarding

Onboarding should be short.

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
