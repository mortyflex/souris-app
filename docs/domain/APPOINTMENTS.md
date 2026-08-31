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
└── noShow?
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

- Appointment Creation and Editing additions read CURRENT active catalog services only.
- Once selected, the draft owns its name, type, price, and ordered phases; saving never re-reads
  the catalog.
- Existing retained items always hydrate from their `AppointmentItem` snapshots, never from the
  catalog.
- Editing the catalog (name, price, phases, activation) NEVER mutates an existing `AppointmentItem`.
  A new addition made later snapshots the new catalog values.
- `serviceId` may reference a Service that is inactive or no longer present in the catalog. The
  snapshot remains valid and is displayed everywhere.

No Appointment presentation or timeline may look up current catalog values for retained items.

---

# 14. Processing Duration Editing

Processing duration may be editable after appointment creation when the relevant feature is implemented.

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

The modification affects the appointment snapshot.

It must not silently modify the original catalog service.

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
phase durations (processing phases)
```

The created snapshot may therefore intentionally differ from the catalog defaults for these values.
The catalog Service itself is never modified, and future appointments keep the catalog defaults.
Adjusting a phase duration recalculates the complete timeline (phase times, item times, elapsed duration,
processing duration, and appointment end) through the normal domain timeline functions.

This is the same snapshot principle as §12: the appointment preserves booking-time reality, which may be a
deliberate business decision rather than a copy of catalog defaults.

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

The in-memory Appointment session applies this reconciliation at initial state creation, after a local-day rollover,
and when the app becomes active on a new local day. Rendering components never perform lifecycle mutation.

The operational Agenda is a projection of professional occupancy, not a complete historical view. It includes
`SCHEDULED`, `CONFIRMED`, compatibility `IN_PROGRESS`, and `COMPLETED` appointments. It excludes `CANCELLED` and
`NO_SHOW` before Day segments, overlap columns, or Week rows are calculated. Those outcomes therefore leave the
time slot visually free and never reduce the width of another appointment at the same time.

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

Permanent deletion is not a lifecycle transition. The in-memory Appointment session removes the exact record by
id without mutating the source collection; an unknown id is a no-op. Once removed, the Appointment naturally
disappears from Agenda Day, Agenda Week, Appointment Details, Client history, and every Client activity value
derived from Appointment state. No Client counter is updated manually.

Appointment Details exposes deletion only as a secondary destructive action, including for `COMPLETED`,
`CANCELLED`, and `NO_SHOW` records. It requires a focused irreversible-action confirmation, then removes the
record and returns to the previous screen. Cancellation and no-show never trigger deletion automatically.

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
```

These invariants are the foundation of Souris scheduling.
