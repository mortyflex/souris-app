# Souris — Appointment Domain

## 1. Purpose

This document defines the scheduling rules of Souris.

Appointment behavior is business-critical.

UI components, persistence adapters, future APIs, and future booking systems must respect these rules.

The Appointment domain must remain independent from React Native, Expo, persistence, and visual representation.

---

# 2. Core Model

A Souris Appointment is NOT defined only by:

```text
start time + duration
```

An appointment contains ordered service items.

Each service item contains ordered phases.

Conceptually:

```text
Appointment
├── id
├── businessId
├── clientId
├── staffMemberId
├── startAt
├── status
├── items[]
├── notes?
├── cancellation?
├── noShow?
└── payment?
```

An AppointmentItem conceptually contains:

```text
id
serviceId
serviceOptionId?
order
serviceName
serviceType
price
phases[]
```

An AppointmentPhase conceptually contains:

```text
id
name
durationMinutes
requiresStaff
```

Exact TypeScript types will be created during the implementation phase.

This document defines behavior, not final syntax.

---

# 3. Service Types

Supported conceptual service types:

```text
SERVICE
TECHNIQUE
```

---

## 3.1 SERVICE

A SERVICE represents a simple service.

For scheduling purposes:

```text
requiresStaff = true
```

for its active duration.

A SERVICE must not create unattended processing time.

Example:

```text
Brushing
45 minutes
```

The professional is considered required throughout those 45 minutes.

---

## 3.2 TECHNIQUE

A TECHNIQUE contains ordered phases.

A phase may either require the professional or not.

Examples:

```text
Application
15 min
requiresStaff = true

Processing
35 min
requiresStaff = false
```

or:

```text
Application
15 min
true

Processing
35 min
false

Finish
10 min
true
```

or even:

```text
Phase A
true

Phase B
false

Phase C
true

Phase D
false

Phase E
true
```

Do NOT model TECHNIQUE as exactly:

```text
application + processing
```

The correct abstraction is:

```text
TECHNIQUE = ordered phases
```

A TECHNIQUE may have no unattended phase.

---

# 4. Phase Meaning

Every appointment phase contains:

```text
durationMinutes
requiresStaff
```

### `requiresStaff = true`

The professional is actively required during the phase.

### `requiresStaff = false`

The client remains in the appointment, but the professional is not actively required.

This is often called processing time or unattended time in the product UI.

It is a scheduling opportunity.

It is not empty appointment time.

---

# 5. Processing Time

Processing time contributes to:

- appointment elapsed duration;
- appointment end time;
- timeline placement.

Processing time does NOT represent:

- cancellation;
- absence;
- free calendar outside the appointment;
- an invalid interval.

The appointment continues during processing.

The professional may potentially serve another client during that period.

The operational Agenda may therefore leave the processing interval visually empty for the professional while
the Appointment continues in the domain timeline. Any later `requiresStaff = true` phase may appear as a
separate presentation segment; this does not change appointment end time, history, or domain calculations.

---

# 6. Ordered Appointment Items

Appointment items have an explicit order.

Example:

```text
1. Couleur racines
2. Coupe
3. Brushing
```

The complete appointment timeline follows this order.

Changing item order changes the timeline.

The order must not rely implicitly on array insertion history without an explicit domain decision.

---

# 7. Ordered Phases

Phases inside an appointment item are ordered.

Example:

```text
1. Application
2. Processing
3. Finish
```

Timeline calculations must preserve this order.

Do not reorder phases based on:

- duration;
- `requiresStaff`;
- display preference.

---

# 8. Timeline Calculation

Timeline calculation begins at:

```text
appointment.startAt
```

Phases are then placed sequentially following:

```text
appointment item order
→ phase order
```

For each phase:

```text
phaseStart = previous phase end
phaseEnd = phaseStart + durationMinutes
```

The first phase starts at `appointment.startAt`.

The final phase end determines the calculated appointment end.

---

# 9. Example Timeline

Appointment starts:

```text
09:00
```

Items:

```text
1. Couleur racines

Application
15 min
requiresStaff = true

Processing
35 min
requiresStaff = false

2. Coupe

Coupe
30 min
requiresStaff = true
```

Calculated timeline:

```text
09:00–09:15
Application

09:15–09:50
Processing

09:50–10:20
Coupe
```

Appointment elapsed duration:

```text
80 minutes
```

Professional active duration:

```text
45 minutes
```

Professional unattended opportunity:

```text
35 minutes
```

These concepts must remain distinguishable.

---

# 10. Reordering

If the professional changes:

```text
Couleur
→ Coupe
```

into:

```text
Coupe
→ Couleur
```

the complete timeline must be recalculated.

Individual item start times are derived values.

They must not become stale independent state.

---

# 11. Derived Values

Prefer deriving values such as:

```text
appointment end
item start
item end
phase start
phase end
elapsed duration
active duration
processing duration
```

from the appointment timeline when practical.

Avoid storing duplicate calculated values unless a concrete persistence/performance requirement later justifies it.

Duplicated derived values create synchronization risk.

---

# 12. Appointment Snapshots

Appointment items represent historical snapshots.

When a service is selected, the appointment should preserve the relevant service state at booking time.

The snapshot may include:

```text
serviceId
serviceOptionId?
serviceName
serviceType
price
phases
```

If the catalog changes later, existing appointments must not silently change.

Example:

A service booked at:

```text
55 €
```

must not become:

```text
60 €
```

in historical appointments merely because the catalog price changed.

The same applies to:

- name;
- phase durations;
- phase structure;
- service type.

---

# 13. Service IDs vs Snapshots

`serviceId` identifies the catalog service from which the appointment item originated.

Snapshot fields preserve historical truth.

Both concepts are useful.

Do not use the current service catalog as the only source for displaying historical appointments.

---

# 13.1 Service Catalog vs AppointmentItem Snapshot

The single in-memory Service catalog (see `docs/domain/SERVICES.md`) is a SELECTION source for new
Appointment additions. An `AppointmentItem` is a booking-time copy.

The boundary is strict:

- Appointment Creation and Editing additions read CURRENT active catalog services only, through the
  same shared grouped `Services` / `Techniques` selection grid.
- Once selected, the draft owns its name, type, price, and ordered phases; saving never re-reads
  the catalog.
- The selection grid is for ADDITIONS only: existing retained items hydrate from their
  `AppointmentItem` snapshots, never from the catalog, and never need their catalog Service to
  exist, be active, or match current values.
- Editing the catalog (name, price, phases, activation) NEVER mutates an existing `AppointmentItem`.
  A new addition made later snapshots the new catalog values.
- `serviceId` may reference a Service that is inactive or no longer present in the catalog. The
  snapshot remains valid and is displayed everywhere.

No Appointment presentation or timeline may look up current catalog values for retained items.

# 13.2 Appointment startAt Editing

Existing Appointment Editing keeps `startAt` in the editing draft:

- the initial value hydrates from the Appointment's current local `startAt`;
- `Date` and `Heure` changes update the draft only — `AppointmentSessionProvider` is untouched before save;
- date changes preserve the local time of day using local civil calendar semantics (never UTC-string round-trips);
- saving writes the draft `startAt` together with the items through the normal Appointment update boundary, so
  Appointment Details, Day Agenda, Week Agenda, and Client Profile projections all observe the updated Appointment;
- cancel/discard leaves the original `startAt` unchanged;
- `startAt` changes participate in dirty-state detection like any other draft change.

# 13.3 Appointment clientId Editing

Existing Appointment Editing may reassign the Appointment's Client through the shared client picker.
The relation remains `clientId` only — never display names:

- choosing another Client updates the local editing draft only;
- saving writes the draft `clientId` through the normal Appointment update boundary, preserving every other
  field; the Appointment immediately appears under the new Client's history and leaves the former Client's
  history through existing `clientId`-derived projections — no history is edited manually;
- cancel/discard leaves the original `clientId` unchanged;
- `clientId` changes participate in dirty-state detection like any other draft change.

---

# 14. Appointment Phase Timing Editing

Every phase duration of an existing Appointment is **snapshot data** and may be edited after creation,
directly from Appointment Details (expanded Service) or from Appointment Editing.

Example:

```text
Processing
35 min
```

may become:

```text
Processing
45 min
```

Changing a phase duration recalculates all following:

- phase times;
- item times;
- appointment end.

The modification affects the appointment snapshot only.

## 14.1 Service catalog timing vs Appointment timing

Service catalog timing and Appointment timing are NOT the same mutable object:

- a Service defines the DEFAULT timing of FUTURE Appointments;
- an AppointmentItem carries the SNAPSHOT timing of ONE Appointment.

Editing the timing of an existing Appointment updates only that Appointment's `AppointmentPhase`
snapshot durations. It never writes the Service, its `ServicePhase` defaults, other Appointments, or
history. Tomorrow's Balayage still initializes from the catalog (Application 45 / Pose 40) even if
today's was adjusted to 30 / 5.

**Ownership rule.** `Prestations & tarifs` (the Service catalog editor) is the ONLY place that modifies
official Service timing. Appointment creation, Appointment editing, and Appointment Details are ALL
snapshot-only: none of them may write a Service, a ServicePhase, or any catalog default, implicitly or
through an explicit option.

## 14.2 Step rule and zero

- Timing is adjusted in **5-minute steps** relative to the CURRENT value (`current ± 5`), clamped at
  **0**. A legacy value that is not a multiple of five is never normalized on its own: 7 → 12 / 2 / 0.
- **0 minutes is a valid duration.** It is persisted explicitly as zero, the phase is kept, and the
  timeline places it as a point (start = end). Zero is never read as missing or invalid.
- Timing changes follow the ONE editing eligibility rule (`canEditAppointment`): `SCHEDULED`,
  `CONFIRMED`, and compatibility `IN_PROGRESS` are editable; `COMPLETED`, `CANCELLED`, and `NO_SHOW`
  stay read-only. A paid Appointment is `COMPLETED` and therefore never re-timed; payment, `paidAt`,
  Sale links, and the Cash Register are never touched by a timing change.
- The durations of one AppointmentItem are written **atomically**: one transaction re-verifies that the
  stored Appointment exists and is editable, updates every targeted phase row, then commits; the session
  state changes only after the commit. No derived duration is stored — `Durée totale`, the end time, and
  the Agenda geometry are recalculated from the snapshot through the normal timeline functions.
- Multiple services: items are addressed by their stable `AppointmentItem` id; editing one item never
  changes the others.

## 14.3 Agenda visual range for late Appointments

The operational Agenda day normally spans 08:00 → 20:00, but 20:00 is a display default, not a clipping
boundary. The visible end of the selected day is derived as
`max(default end, latest visible block end + 30 min)` rounded up to the next full hour, so a 19:00 + 3 h
or a 20:00 → 23:00 Appointment stays fully visible and scrollable. An Appointment that runs past
midnight keeps extending the same start-day canvas (offsets may exceed 24 h internally; labels stay
clock time: 23:00, 00:00, 01:00). It remains ONE Appointment on its canonical start date; no next-day
duplicate is created. Ordinary days keep the compact default range. Occupancy semantics are unchanged:
only staff-required phases are drawn, using the current snapshot values.

---

# 15. Price Editing

The architecture should remain compatible with explicit appointment-specific price adjustments.

If supported later, a price adjustment applies to the appointment snapshot.

It must not silently alter the catalog service price.

---

# 15.1 Intentional Snapshot Differences During Creation

Appointment Creation supports appointment-specific adjustments that apply only to the snapshot being created:

```text
price
phase durations (active and processing), in 5-minute steps, 0 allowed
```

The created snapshot may therefore intentionally differ from the catalog defaults for these values.
The catalog Service itself is never modified, and future appointments keep the catalog defaults.
Adjusting a phase duration recalculates the complete timeline (phase times, item times, elapsed duration,
processing duration, and appointment end) through the normal domain timeline functions.

Example — catalog Balayage: Application 45 / Pose 40. Appointment A is created with Pose → 0: A stores
Pose 0, the catalog keeps Pose 40, and Appointment B created tomorrow initializes at Pose 40, not 0.
Editing A later to Pose 10 changes A only; the catalog and every new Appointment still use 40.

This is the same snapshot principle as §12: the appointment preserves booking-time reality, which may be a
deliberate business decision rather than a copy of catalog defaults.

# 15.2 Final Creation Draft as Snapshot Source

The creation draft boundary:

- selecting a Service copies the CURRENT catalog timing and price into the draft;
- the final AppointmentItem snapshot is built directly from the creation draft (name, type, price, and
  ordered phases with their final durations) — never re-read from the current catalog at save time;
- creation persists the Appointment snapshot rows ONLY (appointment + items + phases, one transaction);
  no Service row is written, on success or otherwise;
- existing AppointmentItem snapshots are never retroactively modified;
- existing Appointment EDITING and Appointment Details keep the same snapshot-only semantics.

The ordering of the selected stack is the Appointment item order; reordering the draft therefore
recalculates the complete timeline through the normal domain functions.

---

# 16. Appointment Overlap

Appointment overlap is explicitly allowed.

Example:

```text
Client A
09:00–10:00

Client B
09:20–09:50
```

This is a valid professional schedule.

Do NOT automatically reject:

- creation;
- movement;
- reordering;

because an appointment intersects another appointment.

---

# 17. Why Overlap Is Allowed

A professional may intentionally use processing phases to serve another client.

Example:

```text
Client A
09:00 Application
09:15 Processing
09:50 Finish

Client B
09:20 Brushing
```

This may be intentionally valid.

The domain must not assume:

```text
one professional = exactly one appointment at a time
```

---

# 18. Overlap Detection

Overlap detection may still be useful.

Future use cases include:

- visual information;
- warnings;
- suggestions;
- schedule optimization;
- online booking;
- multiple staff members.

However:

```text
overlap detection != scheduling permission
```

Do not create a blocking scheduling rule from overlap detection unless the product rules explicitly change.

---

# 19. Staff Requirement Intersections

Future scheduling intelligence may distinguish between:

```text
appointment elapsed overlap
```

and:

```text
staff-required phase overlap
```

Example:

Two appointments may overlap in elapsed time while their staff-required phases do not overlap.

This distinction is valuable.

Do not implement advanced conflict intelligence before it is needed.

The current rule remains:

```text
professional scheduling overlap is allowed
```

---

# 20. Manual Scheduling vs Online Booking

These are separate domain concerns.

### Manual professional scheduling

The professional may create unusual or overlapping arrangements.

The system should preserve that control.

### Customer online booking

Future customer booking must use a dedicated availability policy.

Do not reuse:

```text
can professional manually create this appointment?
```

as the definition of:

```text
should this slot be offered publicly?
```

---

# 21. Future Availability Policy

A future booking availability layer may consider:

```text
business hours
staff hours
breaks
time off
existing appointments
service phases
staff-required phases
processing phases
blocked periods
booking lead time
booking horizon
configured concurrency policy
```

This availability layer is future scope.

Do not build it during the initial Appointment domain implementation.

---

# 22. Staff Identity

Appointments preserve:

```text
staffMemberId
```

even when the current business contains one professional.

Do not replace this with:

```text
currentUser
```

or an implicit singleton inside the Appointment domain.

Identity should remain explicit.

---

# 23. Business Identity

Appointments preserve:

```text
businessId
```

This does not imply current multi-business functionality.

It simply keeps business ownership explicit.

---

# 24. Client Identity

Appointments relate to clients using:

```text
clientId
```

Client relationships must use stable identifiers.

Do not relate appointments to clients using:

- names;
- phone matching;
- fuzzy matching.

---

# 25. Appointment Status

Conceptual statuses:

```text
SCHEDULED
CONFIRMED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

Lifecycle V1 deliberately avoids a complex state machine and does not expose a `Démarrer` action.
`IN_PROGRESS` remains a supported compatibility state, but Souris V1 creates no transition into it.

The permitted V1 transitions are:

```text
SCHEDULED / CONFIRMED / IN_PROGRESS
→ COMPLETED
once appointment.startAt <= now

SCHEDULED / CONFIRMED
→ CANCELLED

SCHEDULED / CONFIRMED
→ NO_SHOW
once appointment.startAt <= now
```

Completion through `Terminer` is optional. The normal workflow requires no end-of-appointment administration:
an untouched `SCHEDULED`, `CONFIRMED`, or compatibility `IN_PROGRESS` appointment becomes `COMPLETED` when its
device-local calendar day is strictly before the current device-local calendar day.

Automatic completion must:

- leave every same-day appointment untouched for the whole day, even after its start time;
- leave future appointments untouched;
- leave `COMPLETED`, `CANCELLED`, and `NO_SHOW` untouched;
- compare local civil calendar fields rather than UTC date strings;
- be pure, immutable, deterministic with an injected `now`, and idempotent.

The persistent Appointment session applies this reconciliation at initial hydration, after a local-day rollover,
and when the app becomes active on a new local day; every finalized record is written to SQLite in one transaction
before state changes. Rendering components never perform lifecycle mutation.

The operational Agenda is a projection of professional occupancy, not a complete historical view. It includes
`SCHEDULED`, `CONFIRMED`, compatibility `IN_PROGRESS`, and `COMPLETED` appointments. It excludes `CANCELLED` and
`NO_SHOW` before Day segments, overlap columns, or Week rows are calculated. Those outcomes therefore leave the
time slot visually free and never reduce the width of another appointment at the same time.

## 25b. Checkout and Payment (« Encaisser »)

Manual completion from Appointment Details is a **checkout**: the professional confirms the Appointment is
finished AND records how much was actually received. This is not payment processing — Souris never charges a
card, talks to a terminal, or acts as a fiscal point of sale.

The Appointment owns its payment; there is no parallel payment subsystem:

```text
AppointmentPayment
├── paidAt            instant of the explicit checkout
├── cardAmountCents   integer cents >= 0
└── cashAmountCents   integer cents >= 0
```

Rules:

- amounts are **integer cents**; `totalPaidCents = cardAmountCents + cashAmountCents` is derived, never stored;
- a checkout may be 100 % card, 100 % cash, or mixed; nothing forces exactly one method;
- the recorded total may legitimately differ from the snapshot total (discount, tip, adjustment). When the
  expected total is positive, the recorded total must be positive; a zero checkout is valid only for an
  Appointment that costs nothing;
- **manual checkout is allowed** from `SCHEDULED` / `CONFIRMED` / compatibility `IN_PROGRESS` once
  `appointment.startAt <= now` (the former `Terminer` eligibility), and for a `COMPLETED` Appointment that
  carries no payment yet (« Enregistrer un encaissement » — status stays `COMPLETED`);
- `CANCELLED` and `NO_SHOW` can never be checked out; an already paid Appointment cannot be checked out twice;
- **automatic previous-local-day completion never records a payment**: it only sets `status = COMPLETED`.
  Existing `COMPLETED` Appointments keep `payment = undefined`; Souris never fabricates historical revenue;
- a checkout is atomic: `status = COMPLETED` and the payment are written together in ONE transaction, and
  the session state changes only after the commit. On failure nothing changes and nothing appears in the
  Cash Register;
- **correction**: a completed Appointment with a payment may have its card/cash split edited. The status and
  the original `paidAt` are preserved; no second record is created.

The **Cash Register** (`src/domain/cash-register`) derives ONLY from money explicitly recorded through
Souris: every `appointment.payment`, plus `sale.payment` of STANDALONE Sales (no `appointmentId`,
`docs/domain/SALES.md` §4b). A Sale sold during an Appointment is never counted separately — the Appointment
checkout already recorded that money (services 75 € + linked products 20 € recorded as 95 € → Caisse 95 €, not
115 €). Each payment is grouped by the device-local civil day or calendar month of its own `paidAt` — never
from status alone, from the Client `Total dépensé` metric, or from Sale snapshot totals. Totals are never stored.

Client activity keeps its existing semantics: `Total dépensé` remains the sum of AppointmentItem snapshot
prices of `COMPLETED` Appointments, independent of any recorded payment.

---

# 26. Cancellation

Cancellation does not delete the appointment.

A cancellation contains:

```text
cancelledAt
cancelledBy
reason?
```

Possible actors:

```text
CLIENT
BUSINESS
```

Historical information remains available.

A cancelled Appointment remains a session and Client-history record, including its actor and optional reason, but
it no longer occupies the operational Agenda.

V1 cancellation is allowed only from `SCHEDULED` or `CONFIRMED`. It requires an explicit `CLIENT` or `BUSINESS`
actor, records the injected cancellation time, and may preserve a trimmed optional reason. `IN_PROGRESS` cannot be
cancelled in V1.

---

# 27. No-show

No-show does not delete the appointment.

A no-show may contain:

```text
recordedAt
```

This historical outcome must remain attached to the appointment.

A no-show Appointment remains a session and Client-history record, including `recordedAt`, but it no longer
occupies the operational Agenda.

V1 no-show is allowed only from `SCHEDULED` or `CONFIRMED`, and only once `appointment.startAt <= now`. It records
the injected observation time and never creates cancellation metadata. `IN_PROGRESS` cannot be marked as no-show
in V1.

---

# 28. Permanent Deletion

Permanent deletion is separate from lifecycle status.

It is reserved for exceptional data correction such as:

- duplicate;
- incorrect entry;
- accidental creation.

UI wording must distinguish:

```text
Annuler
Absence
Supprimer définitivement
```

Permanent deletion is not a lifecycle transition. The Appointment session deletes the exact record by id — the
row and every nested item/phase row — then removes it from state without mutating the source collection; an
unknown id is a no-op. Once removed, the Appointment naturally
disappears from Agenda Day, Agenda Week, Appointment Details, Client history, and every Client activity value
derived from Appointment state. No Client counter is updated manually.

Appointment Details exposes deletion only as a secondary destructive action, including for `COMPLETED`,
`CANCELLED`, and `NO_SHOW` records. It requires a focused irreversible-action confirmation, then removes the
record and returns to the previous screen. Cancellation and no-show never trigger deletion automatically.

**Deletion guard.** An Appointment that carries a recorded payment (Cash Register history) or that a Product
Sale references (`sale.appointmentId`) cannot be permanently deleted: historical integrity wins. The session
pre-checks the stored references so Details shows « Suppression impossible » instead of a confirmation, and the
store re-verifies inside the deletion transaction (`canDeleteAppointmentPermanently`). There is no cascade and
no hidden `appointmentId = NULL` rewrite of Sales.

---

# 29. Terminal Appointments

`COMPLETED`, `CANCELLED`, and `NO_SHOW` are terminal historical outcomes.

`COMPLETED` remains visible in the operational Agenda because it represents work that occupied professional time.

`CANCELLED` and `NO_SHOW` do not occupy Agenda Day and do not appear as active Agenda Week rows, but they remain
available to Appointment Details and Client history. The domain must not erase them merely because the operational
calendar excludes them. Only an explicit permanent deletion removes a terminal Appointment record.

---

# 30. Notes

Appointments may contain optional notes.

Notes are appointment-specific.

Do not confuse them with:

- client notes;
- service notes;
- internal catalog configuration.

---

# 31. Domain Independence

Appointment domain code must remain framework-independent.

It must not import:

```text
React
React Native
Expo
Expo Router
UI components
Supabase
AsyncStorage
```

Pure TypeScript is preferred.

---

# 32. Domain Testing Priorities

When implementation begins, tests should progressively verify at least:

```text
SERVICE behavior
TECHNIQUE behavior
ordered phases
requiresStaff behavior
processing duration
timeline calculation
multiple items
item reordering
phase duration change
5-minute timing step, zero duration, legacy non-multiple values
atomic per-item timing persistence and catalog isolation
dynamic Agenda day range (late and cross-midnight appointments)
appointment end calculation
active duration
processing duration
snapshot independence
overlap allowed
cancellation preservation
no-show preservation
operational Agenda exclusion for cancellation/no-show
overlap calculation without cancellation/no-show
manual completion eligibility
manual checkout (card / cash / mixed, invalid amounts, eligibility)
payment correction (split changes, status and paidAt preserved)
automatic completion without payment
cash register day / month derivation with local civil dates
deletion guard (payment, linked Sale)
previous-local-day automatic completion
same-day non-completion
terminal-state preservation
idempotent session reconciliation
immutable permanent deletion
derived Client activity after deletion
```

Tests should validate behavior, not implementation structure.

---

# 33. Non-Goals for Initial Domain Phase

Do not initially build:

```text
online booking engine
staff schedule engine
opening hours engine
room scheduling
equipment scheduling
optimization AI
automatic conflict resolution
payment logic
notifications
persistence repositories
sync infrastructure
```

These are separate concerns.

---

# 34. Fundamental Invariants

The following must remain true unless an explicit product decision changes them:

```text
1. An Appointment contains ordered items.

2. An AppointmentItem contains ordered phases.

3. Processing phases remain part of elapsed appointment time.

4. requiresStaff=false means the professional is not actively required.

5. Item reordering recalculates the timeline.

6. Historical appointments preserve snapshots.

7. Professional scheduling overlaps are allowed.

8. Cancellation and no-show preserve history.

9. Permanent deletion is different from cancellation/no-show.

10. Manual scheduling permission is not future online-booking availability.

11. businessId, staffMemberId and clientId remain explicit identities.

12. Appointment business rules remain independent from React Native and persistence.

13. Normal appointments require no manual end-of-appointment action; previous local days reconcile to COMPLETED.

14. CANCELLED and NO_SHOW remain historical records but do not occupy the operational Agenda.

15. Permanent deletion explicitly removes an incorrect or duplicate Appointment and all values derived from it.

16. A payment exists only through an explicit checkout; automatic completion never records one.

17. The Cash Register derives only from recorded payments (Appointment checkouts and standalone Sale payments), never counting an Appointment-linked Sale twice; an Appointment with a payment or a linked Sale is never deleted.

18. Appointment phase timing is snapshot data: creating, editing, or re-timing an Appointment never changes the Service catalog (only Prestations & tarifs does), and a zero-minute phase is valid.
```

These invariants are the foundation of Souris scheduling.
