# BeautIzzy — Appointment Domain

## 1. Purpose

This document defines the scheduling rules of BeautIzzy.

Appointment behavior is business-critical.

UI components, persistence adapters, future APIs, and future booking systems must respect these rules.

The Appointment domain must remain independent from React Native, Expo, persistence, and visual representation.

---

# 2. Core Model

A BeautIzzy Appointment is NOT defined only by:

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
├── discount?
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
- creation persists the Appointment snapshot rows ONLY (appointment + items + phases, one transaction) —
  plus, when the professional recorded a deposit already received on the Résumé, that deposit record in
  the SAME transaction (§25d « At creation »); no Service row is written, on success or otherwise;
- existing AppointmentItem snapshots are never retroactively modified;
- existing Appointment EDITING and Appointment Details keep the same snapshot-only semantics.

The ordering of the selected stack is the Appointment item order; reordering the draft therefore
recalculates the complete timeline through the normal domain functions.

# 15.3 Appointment Discount

An Appointment may carry ONE optional discount. It applies to the WHOLE services total — never to an
individual AppointmentItem, whose snapshot price is never modified to represent it.

```text
AppointmentDiscount
├── { type: PERCENT, percent }        whole number of percent, 1–50
└── { type: FIXED,   amountCents }    INTEGER CENTS, >= 1

appointment.discount absent = no discount
```

What is stored is what the professional CHOSE, never a pre-computed total. Every amount is derived:

```text
gross     Σ AppointmentItem snapshot prices                      (integer cents)
discount  PERCENT: gross × percent / 100, rounded HALF UP to the cent with integer arithmetic
                   floor((grossCents × percent + 50) / 100)      12,50 € at 15 % = 187,5 c → 188 c
          FIXED:   amountCents
          then clamped to [0, gross]                             50 € off a 30 € Appointment → 30 €
net       gross − discount                                        never negative
```

Examples: `100 € − 20 % = 80 €`; `100 € − 15 € = 85 €`; `30 € − 50 € = 0 €`.

ONE authoritative derivation (`src/domain/appointments`):

- `getAppointmentDiscountCents(grossCents, discount)` — the rounding and clamping rule above;
- `getAppointmentServicesTotal(appointment)` → `{ grossCents, discountCents, netCents }`;
- `getAppointmentExpectedTotal` (§25b) builds on it.

The creation and editing drafts, Appointment Details, the checkout sheet and the Client `Total dépensé`
metric all read these helpers. No screen computes a discount on its own, and no floating-point euro
arithmetic is involved.

**Scope: services only.** Products sold during the Appointment (« Revente ») are separate Sales with their
own snapshots (`docs/domain/SALES.md`); the Appointment discount never reduces them.

**One action.** `setAppointmentDiscount(appointment, discount | undefined)` is THE way a discount is added,
changed or removed (`undefined`). The editor uses it; the session exposes it as
`setAppointmentDiscount(appointmentId, discount)` (one transaction, state updated after the commit). Any
later surface that proposes a discount must call the same action — it never implements pricing. Checkout
does too: `checkoutAppointmentWithDiscount` applies the final discount through `setAppointmentDiscount`
before recording the payment (§25b).

**No origin, no reason.** The model is `type + value` only. There is no promotion engine, coupon, campaign
or `birthdayDiscount` field: a discount offered because of a birthday is this same generic discount.

**Birthday recognition at Client selection (creation).** On the Client step, choosing a Client whose birthday
is the Appointment DATE (`isClientBirthdayOnDate(client, draftStartAt)` — never today's date) shows a compact
reminder under the context row at once: « C'est l'anniversaire d'Amel ce jour-là. » (« aujourd'hui » only when
the Appointment date is today's local date) and « Vous pourrez lui proposer une réduction sur ce rendez-vous. ».
The same short confetti burst as the Client Profile and ONE `success` haptic play for that selection (the
Client row has no selection haptic of its own). The celebration belongs to the selection EVENT: a re-render, a
re-tap of the chosen Client or a step round trip never replays it; choosing another Client removes the reminder
(and any running burst) at once; choosing her again, or another birthday Client, celebrates again. Reduce Motion
skips the confetti only. This step is awareness; the financial action stays on the Résumé (below). Editing is
unchanged: no confetti when an editor opens.

**Birthday suggestion.** When the Appointment DATE (the draft date in creation and editing — never today's
date) is the Client birthday (`isClientBirthdayOnDate`, `docs/domain/CLIENTS.md` §2), creation and editing
show a reminder right above « Réduction » (`AppointmentDiscountSection`): « Anniversaire du client — Vous
pouvez appliquer une réduction anniversaire. » with the action « Appliquer une réduction ». The action ONLY
opens the generic discount editor: it selects no preset, applies no value and writes nothing. The reminder is
derived on every render, so changing the Client or the date updates it at once. Once a discount is set the
reminder states « Une réduction est déjà appliquée à ce rendez-vous. » and offers no action; the wording never
claims the discount is a birthday discount, because its origin is not recorded. A terminal Appointment is not
editable, so no birthday discount action exists for it. Appointment Details shows a static « Anniversaire du
client » line under the date (not on a cancelled or no-show Appointment): no confetti, no discount control in
the body — « Modifier » and the checkout sheet are the places to edit the discount; checkout shows no birthday
reminder. Nothing is ever discounted automatically, and pricing,
checkout, the Cash Register and `Total dépensé` are unchanged.

**Editing rule.** The discount follows the ONE editing eligibility rule (§29, `canEditAppointment`): it can
be added, changed or removed while the Appointment is `SCHEDULED` / `CONFIRMED` / compatibility
`IN_PROGRESS`. Once `COMPLETED`, `CANCELLED` or `NO_SHOW` it is frozen — the domain action returns the same
Appointment, the store refuses the write (`AppointmentDiscountConflictError`), and « Modifier » is not
offered. A checked-out Appointment keeps its discount, so its history still explains the amount. The only
financial correction available after checkout remains « Modifier l’encaissement » (§25b).

**History.** The discount is part of the Appointment's own state, like its item snapshots: a later catalog
price change alters neither the gross, nor the discount, nor the net. The editor presets (5 → 50 % and
5 → 50 €) are a UI convenience; the Appointment stores the chosen value, so changing the presets later
never alters an existing Appointment. The domain accepts any valid value: a whole percentage from 1 to 50
(`MAX_DISCOUNT_PERCENT`) or any positive integer cents. The maximum of 50 % is ONE rule, enforced identically by
the domain, the SQLite CHECK, the Supabase CHECK and the sync / restore validation.

**Free entry.** Next to the presets, the editor offers ONE free entry of the current mode — « Autre
pourcentage » (whole percent, number pad) or « Autre montant » (euros, decimal pad, comma or dot, at most two
decimals). It is read by the pure feature rules (`src/features/appointments/editor/discount-entry.ts`) into the
SAME `AppointmentDiscount` the presets produce: `7,50` → `{ FIXED, 750 }`, `7` → `{ PERCENT, 7 }`. Nothing is
stored differently for a typed value: a custom amount is integer cents, a custom percentage is a whole percent
within the ONE bound, and the applied cents stay derived. The entry refuses, in words and without applying
anything, an unreadable value, `0`, a fractional percentage (`7,5 %`) and a percentage above 50 % — 100 % included.
A fixed amount above the services total is accepted, applied in full by the clamp above (the net is `0 €`) and
said so (« Limitée au total des prestations. »). A preset and the entry are two ways of choosing one value: a
preset selects its chip and empties the entry; a typed value deselects the chips; a stored custom value reopens
in the entry.

**Known limitation — percentages above 50 %.** The 50 % bound is a CHECK of the SQLite and Supabase columns.
Raising it (to 100 %) would need a SQLite table rebuild (a CHECK cannot be altered) and a hand-applied Supabase
migration replacing the column constraint, plus the sync validation; it is deliberately NOT done here. Until that
dedicated phase, a larger reduction is entered as a fixed amount, up to the services total.

**Where it shows.** Creation (Résumé step) and editing: a collapsed, secondary « Réduction » row.
Appointment Details: `Prestations` (gross) → `Réduction -20 %  -20,00 €` → `Total à encaisser`; the
discount line does not exist without a discount. Checkout sheet: the same line above « Total attendu ».
Agenda cards never show discount pricing.

**At checkout.** While the Appointment is still editable, the checkout sheet (§25b) shows the SAME
`AppointmentDiscountEditor` above its expectation, collapsed (`Réduction · Aucune`, `Réduction · -20 % · -19,00 €`),
so the professional may add, change or remove the discount right before collecting payment, without going
through « Modifier ». Its choice is a LOCAL DRAFT of that presentation:

- every opening starts from the STORED discount (never from an abandoned draft);
- the expectation (`Prestations` → `Réduction` → `Produits` → `Total attendu`) and the `Reste …` shortcuts
  are recomputed at once from the Appointment carrying the draft, through `setAppointmentDiscount` and
  `getAppointmentExpectedTotal` — the sheet computes nothing itself; Products stay undiscounted;
- closing or cancelling the sheet writes nothing: the Appointment keeps exactly the discount it had;
- « Encaisser » writes the final discount and the payment in ONE transaction (§25b).

A `COMPLETED` Appointment — the correction « Modifier l’encaissement », or « Enregistrer un encaissement » on
an automatically completed visit — keeps its frozen discount: the sheet shows the read-only line and no editor.

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

## 18.1 The one explicit exception — Calendar Blocks

The product rules changed explicitly once (September 2026), for ONE case: **personal unavailability**.
A Calendar Block (`docs/domain/CALENDAR_BLOCKS.md`) is the professional declaring herself unavailable,
which is different in kind from two clients sharing her time. So:

```text
Appointment  vs  Appointment       overlap allowed, NON-BLOCKING                       (§16–§17, unchanged)
Appointment  vs  Calendar Block    same staff member + a STAFF-REQUIRED interval of the
                                   Appointment intersects the block                     → the save is refused
Calendar Block vs Calendar Block   same staff member + intersecting intervals           → the save is refused
```

The Appointment side of that rule is judged on the staff-required intervals of §19
(`getAppointmentStaffBusyIntervals`, `src/domain/appointments/occupancy.ts`): consecutive
`requiresStaff = true` phases merged across items, split by unattended phases, zero-duration phases
ignored, ends exclusive. Processing time may therefore cross a block, and a block may be taken during
processing time. `CANCELLED` and `NO_SHOW` Appointments occupy nothing
(`doesAppointmentOccupySchedule`) — the same rule the Agenda uses to decide what reserves space.

It applies when a client Appointment is CREATED (Résumé step) or CHANGED — through the full editor or
through the quick edits of Appointment Details (phase durations, reorder, item removal). ONE rule
decides every change, `findAppointmentChangeCalendarBlockConflict`: the candidate is computed first;
when its staff-required intervals are identical to the current ones nothing is checked (a price, Client
or discount edit is never held back, not even by a pre-existing overlap); otherwise the candidate is
validated against the blocks of its staff member, and a refused change writes nothing. Nothing else
about overlap changed.

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
`IN_PROGRESS` remains a supported compatibility state, but BeautIzzy V1 creates no transition into it.

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
finished AND records how much was actually received. This is not payment processing — BeautIzzy never charges a
card, talks to a terminal, or acts as a fiscal point of sale.

The Appointment owns its payment; there is no parallel payment subsystem:

```text
AppointmentPayment
├── paidAt            when the money was received — its Cash Register day
├── cardAmountCents   integer cents >= 0
└── cashAmountCents   integer cents >= 0
```

Rules:

- amounts are **integer cents**; `totalPaidCents = cardAmountCents + cashAmountCents` is derived, never stored;
- a checkout may be 100 % card, 100 % cash, or mixed; nothing forces exactly one method;
- **exact settlement** (since September 2026 — it replaces the former tolerance for tips and adjustments): a
  new final payment settles EXACTLY the checkout due, `cardAmountCents + cashAmountCents === due`. Less is not
  a partial payment (not a V1 concept); more is not a tip. To charge less, the professional applies the
  explicit Appointment **discount** — never a silent under-payment. See *Checkout due and exact settlement*
  below;
- **one final payment per Appointment**: an existing payment means no new checkout. An Appointment whose
  ACTIVE deposits already cover the whole expected total receives no payment either — not even `0 €` — even
  once `COMPLETED`: it completes with « Terminer » (§25d);
- **manual checkout is allowed** from `SCHEDULED` / `CONFIRMED` / compatibility `IN_PROGRESS` once
  `appointment.startAt <= now` (the former `Terminer` eligibility), and for a `COMPLETED` Appointment that
  carries no payment yet (« Enregistrer un encaissement » — status stays `COMPLETED`);
- `CANCELLED` and `NO_SHOW` can never be checked out; an already paid Appointment cannot be checked out twice;
- **automatic previous-local-day completion never records a payment**: it only sets `status = COMPLETED`.
  Existing `COMPLETED` Appointments keep `payment = undefined`; BeautIzzy never fabricates historical revenue;
- a checkout is atomic: `status = COMPLETED` and the payment are written together in ONE transaction, and
  the session state changes only after the commit. On failure nothing changes and nothing appears in the
  Cash Register;
- **discount chosen at checkout** (§15.3): `checkoutAppointmentWithDiscount(appointment, discount, amounts,
  now, paidAt?)` validates the final discount, applies it through `setAppointmentCheckoutDiscount` and records
  the payment as ONE next record. The checkout discount may change while the Appointment is editable AND while
  it is `COMPLETED` without its final payment (`canChangeAppointmentCheckoutDiscount`): exact settlement needs
  the discount to charge less on a late checkout. Once a payment exists it is frozen. Outside checkout, the
  generic editing rule (`setAppointmentDiscount`) is unchanged: a `COMPLETED` Appointment is frozen. The
  checkout discount may not take the total below the ACTIVE deposits (`findAppointmentCheckoutDiscountShortfall`,
  the same rule as §25d, extended to a completed-unpaid Appointment). The store writes the discount, then status
  + payment, in the SAME transaction; a refused or failed step rolls both back, so a completed Appointment never
  exists without the discount its payment was taken against;
- **correction**: a completed Appointment with a payment may have its card/cash split edited. The status and
  the original `paidAt` are preserved (no date choice is offered again); no second record is created. The new
  total stays within `[min(due, recorded), max(due, recorded)]` — see *Legacy payments* below;
- **with deposits** (§25d): the payment records ONLY the money received at the final checkout. The sheet
  shows `Total attendu`, then `Acomptes déjà versés` and `Reste à encaisser`; the `Reste` shortcut and the
  acceptability of the entry are measured against the checkout due (expected − ACTIVE deposits), never against
  the whole expected total. `100 €` expected with a `30 €` deposit is checked out as EXACTLY `70 €` — the Caisse
  then holds `30 €` on the deposit day and `70 €` on the checkout day, never `130 €`.

**Checkout due and exact settlement.** ONE derivation (`src/domain/appointments/checkout.ts`):

```text
expectedTotalCents = services gross − discount + linked products     (getAppointmentExpectedTotal)
activeDeposits     = Σ ACTIVE deposits                               (getAppointmentActiveDepositTotal)
checkout due       = max(expectedTotalCents − activeDeposits, 0)     (getAppointmentCheckoutDueCents —
                                                                       the deposit position's remainingCents)
```

`validateAppointmentCheckoutAmounts` / `validateCheckoutAmounts` answer `INVALID_AMOUNT`, `ALREADY_SETTLED`
(a payment exists, or ACTIVE deposits cover everything), `UNDER_DUE` or `EXCEEDS_DUE`. A free Appointment
without deposits (due `0`) is settled by a `0 €` payment. Example: services `120 €`, discount `10 €`, deposit
`20 €` → the final checkout settles exactly `90 €`.

Enforcement is layered — never a UI-only guard:

- **domain**: the rules above, integer cents;
- **checkout sheet**: the same bounds (`getCheckoutPaymentBounds`, `getPaymentCorrectionBounds`) decide whether
  « Encaisser » is enabled;
- **store**: `checkoutAppointment` and `updateAppointmentPayment` re-read the stored Appointment, its linked Sale
  lines and its deposits inside their transaction (the deposit pattern, `readAppointmentDepositPosition`) and
  throw `AppointmentCheckoutAmountError` — nothing written — when the amounts do not settle what is allowed;
- **server**: NOT enforced in V1. A remote hard check could strand an offline device's push (a deposit recorded on
  one device while another checks out), would reject legitimate history (a Revente removed after checkout lowers
  the total below the payment) and legacy payments. A later hardening could check only the first appearance of a
  payment (`paid_at` NULL → set) through the existing `FINANCIAL_CONFLICT` answer (`CLOUD_SYNC.md` §21.2).

**Split autofill (checkout sheet).** Each amount has an owner. A typed amount is *manual* and is never
rewritten. The other one, while *automatic*, becomes what remains to reach the target (the due; the recorded
total in a correction): Carte `30` → Espèces `70`; Carte `45` → Espèces `55`; Carte `100` → Espèces empty.
Typing Espèces makes it manual; a later Carte change leaves it alone, and the sheet says
« Reste à répartir : 20,00 € ». Clearing an amount releases it without refilling it on the spot; the next edit of
the other amount, or the explicit « Reste » shortcut, fills it again. A discount draft that moves the due moves
the automatic amount only. Above the maximum the typed value is never capped: « Le montant dépasse le reste à
encaisser. » and confirmation stays disabled. Nothing changes before the professional interacts — a correction
opens on the recorded amounts exactly. The standalone Sale payment keeps its own tolerant behaviour
(`docs/domain/SALES.md`) and none of this.

**Payment date (« Encaissé le »).** The Cash Register counts money on the day it was RECEIVED (`paidAt`); the
Agenda summaries follow the Appointment day (`startAt`, §25c). The two stay separate. When the FIRST final
payment of an Appointment of an EARLIER local day is recorded (typically one completed automatically), the
sheet offers « Encaissé le : Jour du rendez-vous · Aujourd’hui », « Jour du rendez-vous » by default:

- « Jour du rendez-vous » → `paidAt` is the end of the Appointment (`getAppointmentEndAt`, processing included),
  or 23:59 of its local day when it runs past local midnight (`getAppointmentDayPaymentInstant`). Built from
  local calendar fields, so the Caisse places it on the appointment day across UTC offsets and DST changes;
- « Aujourd’hui » → `paidAt = now`;
- a same-day checkout shows no choice: `paidAt = now`. There is no free date picker in V1.

`paidAt` is set on the device and synced unchanged: a checkout recorded offline and pushed the next day keeps its
Caisse day — never the record, push or server insertion time. Payments recorded before this rule keep their
`paidAt` (no backfill, nothing rewritten). Appointment Details shows « Encaissé le 28 septembre 2026 » under the
received total only when the payment day differs from the Appointment day.

**Legacy payments.** Payments recorded before exact settlement may differ from today's due (a tip, an
adjustment, or a Revente removed after checkout). They are never invalidated or rewritten. A correction keeps
the total within `[min(due, recorded), max(due, recorded)]`: with `100 €` due and `120 €` recorded, `120 €`,
`115 €` and `100 €` are accepted, `125 €` is refused; with `100 €` due and `60 €` recorded, `60 €` to `100 €` are
accepted, below `60 €` or above `100 €` refused. A payment recorded under the exact rule (recorded = due)
therefore stays exactly the due. This range is legacy compatibility ONLY: a NEW checkout is always limited to the
exact due.

**Expected total.** ONE canonical derivation (`getAppointmentExpectedTotal`, `src/domain/appointments`)
feeds both the Appointment Details ticket (`Total à encaisser`) and the checkout sheet (`Total attendu`), so the
two can never disagree:

```text
servicesCents      = Σ AppointmentItem snapshot prices                       (the GROSS services amount)
discountCents      = what the Appointment discount takes off the services    (0 without a discount, §15.3)
productsCents      = Σ SaleItem snapshot lines of every Sale where sale.appointmentId === appointment.id
expectedTotalCents = servicesCents − discountCents + productsCents
```

Without a discount `discountCents = 0` and the expected total is exactly what it was before discounts
existed. The checkout sheet prefills from this value, so a `100 €` Appointment with `20 %` is checked out —
and lands in the Cash Register — as `80 €`. An Appointment checked out before it had a discount is never
recalculated: the Cash Register follows its recorded payment alone.

Integer cents, snapshots only: the current Service catalog and the current Product catalog are never consulted,
so later catalog price changes leave historical tickets untouched. A Sale of the same Client without the
Appointment id, a standalone Sale, or a Sale of another Appointment contributes nothing. Without any linked
Sale the expected total is simply the services total — it is always shown, never hidden. It recomputes
immediately when a Revente is added or a sold Product row is deleted (`docs/domain/SALES.md` §10).

**Expected vs. received.** `appointment.payment` is the amount actually received. A new checkout settles the
exact due, so they match at checkout; they may still differ afterwards — a sold Product deleted after checkout,
or a legacy payment recorded before exact settlement (a tip, an adjustment). Deleting a
Product row never rewrites the payment: after `services 80 € + products 20 €` were checked out as `100 €`, removing
the 20 € Product gives `Total attendu 80 €` while `Encaissement 100 €` stays recorded, and Details shows the restrained
`Écart : +20,00 €` (received minus expected). `Modifier l’encaissement` remains the only way to change the recorded
amount, and the Cash Register follows that payment alone.

The **Cash Register** (`src/domain/cash-register`) derives ONLY from money explicitly recorded through
BeautIzzy: every `appointment.payment`, `sale.payment` of STANDALONE Sales (no `appointmentId`,
`docs/domain/SALES.md` §4b), and every ACTIVE Appointment deposit on its own `paidAt` (§25d). A Sale sold during an Appointment is never counted separately — the Appointment
checkout already recorded that money (services 75 € + linked products 20 € recorded as 95 € → Caisse 95 €, not
115 €). Each payment is grouped by the device-local civil day or calendar month of its own `paidAt` — never
from status alone, from the Client `Total dépensé` metric, or from Sale snapshot totals. Totals are never stored.

Client `Total dépensé` (`docs/domain/CLIENTS.md` §6) is independent of any recorded payment: for
Appointments it reads the expected total of `COMPLETED` Appointments from their snapshots — services NET of
the Appointment discount (§15.3) plus the Products sold during the Appointment — so a `100 €` Appointment
with `20 %` counts `80 €`. An Appointment without a discount counts
exactly the sum of its item snapshot prices, as before.

## 25c. Day Summary (« Résumé du jour »)

`getAppointmentDaySummary({ appointments, sales, deposits }, day)` (`src/domain/appointments/day-summary.ts`) derives
what ONE device-local civil day of Appointments represents. Pure, derived on demand, never stored. The
Agenda opens it for the day it is showing, which is not necessarily today.

Counted Appointments: those that START on the day AND occupy the schedule (`doesAppointmentOccupySchedule`,
the Agenda's own rule). `CANCELLED` and `NO_SHOW` are left out. Calendar Blocks are never an input (§18.1).

| Value | Derivation |
| --- | --- |
| `potentialRevenueCents` — « CA potentiel » | Σ `getAppointmentExpectedTotal(...).expectedTotalCents`: services net of the discount (§15.3) + Sales sold during the Appointment — exactly the « Total à encaisser » of Details |
| `collectedCents` — « Déjà encaissé » | Σ, for the counted Appointments, their ACTIVE deposits (§25d) + their recorded final checkout (card + cash) — whatever the day that money was received |
| `remainingToCollectCents` — « Reste à encaisser » | Σ, for the counted Appointments NOT settled, `max(expected − ACTIVE deposits, 0)`. Settled = a final checkout is recorded, or the Appointment is `COMPLETED` and fully prepaid (`isAppointmentSettled`) |
| `totalDurationMinutes` — « Temps total » | Σ `getElapsedDurationMinutes`: booked time, processing included; overlapping Appointments both count |
| `averageBasketCents` — « Panier moyen » | `potentialRevenueCents` / counted Appointments, rounded to the cent; `0` on an empty day |
| `rows` | chronological (ties by id): the Appointment, its expected total, its ACTIVE deposits, what was collected, what remains, whether it is settled |

A checkout settles its Appointment. A new checkout records exactly the due (§25b), but a legacy payment
recorded before exact settlement (a tip, an adjustment) or a Revente removed after checkout still settles it
with a different amount: `collected + remaining` may therefore differ from the potential revenue. An Appointment
completed automatically without checkout still counts as remaining — its checkout can be recorded afterwards.

Worked example — an Appointment of the day expected at `100 €`, a `30 €` deposit paid two weeks earlier, no
final checkout yet: `CA potentiel 100 €`, `Déjà encaissé 30 €`, `Reste à encaisser 70 €`. After the final
checkout of `70 €`: `100 € / 100 € / 0 €`. A legacy final payment that differs from what was due (a tip
recorded before exact settlement) keeps its recorded amount in `Déjà encaissé` and owes nothing. VOIDED deposits count nowhere. A `CANCELLED` or `NO_SHOW`
Appointment is not counted, so its deposits are not either (they stay in the Caisse of the day they were paid).

This is NOT the Cash Register. The Caisse groups money by the day it was RECEIVED (`paidAt`) and also counts
standalone Sales; the day summary follows the Appointments of a day, whenever their money came in. The two
legitimately differ.

### Week summary (« Résumé de la semaine »)

`getAppointmentPeriodSummary(sources, { firstDay, lastDay })` applies EXACTLY the rules above to a range of
device-local civil days, both bounds included (compared as civil dates, never timestamps).
`getAppointmentDaySummary(sources, day)` is that function with `firstDay = lastDay = day`. The Agenda opens
the week summary for the seven days of the week it shows (`getWeekDays`: Monday → Sunday), so every weekly
figure equals the sum of the seven day summaries; `averageBasketCents` is the weekly potential revenue divided
by the weekly counted Appointments.

`getAppointmentPeriodActivity(appointments, period)` counts outcomes by stored status over the same days:

| Value | Statuses |
| --- | --- |
| `completedCount` — « Réalisés » | `COMPLETED` |
| `plannedCount` — « Prévus » | `SCHEDULED`, `CONFIRMED`, `IN_PROGRESS` |
| `cancelledCount` — « Annulés » | `CANCELLED`, whoever cancelled |
| `noShowCount` — « Absences » | `NO_SHOW` |

`completedCount + plannedCount` is the counted Appointments (« N rendez-vous »); cancellations and no-shows
are reported beside it, never inside it. Deleted Appointments no longer exist; Calendar Blocks are never an
input.

## 25d. Deposits (« Acomptes »)

A deposit is money ACTUALLY received in advance for an existing Appointment. It is its own record — never a
column of the Appointment (`appointment.depositAmount` does not exist) and never a discount: the expected
total of the Appointment never changes because of a deposit; only what is still to be collected does.

```text
AppointmentDeposit                      src/domain/appointments/types.ts, deposit.ts
├── id                 UUID v4, created once per « Prendre un acompte » presentation
├── businessId
├── appointmentId
├── amountCents        integer cents >= 1
├── paymentMethod      CARD | CASH           (THE PaymentMethod vocabulary of the domain)
├── paidAt             when the money was received — its Cash Register day
├── status             ACTIVE | VOIDED
├── voidedAt?          present exactly when VOIDED
└── createdAt          when it was recorded (persisted as `recorded_at`)
```

An Appointment has zero, one or several deposits.

**At creation (« Ajouter un acompte reçu »).** The creation Résumé offers ONE optional, collapsed « Acompte »
row (after « Réduction ») to record money the professional has ALREADY received for the Appointment being
created. It is the SAME record, the SAME rules and the SAME write as « Prendre un acompte » on an existing
Appointment — not a second deposit system, not a column of the Appointment:

- inactive by default; nothing is preselected or prefilled. The no-show warning suggests a deposit in words
  only (« Pensez à demander un acompte. ») and never fills the row in;
- the entry (`src/features/appointments/creation/deposit-draft.ts`) asks `validateAppointmentDepositAmount`
  against the position of the NEW Appointment — expected = services net of the discount, nothing paid ahead —
  so `> 0`, exact cents, `<= expected`. The amount is kept AS TYPED and re-read on every render: a lower
  price or a new discount re-validates it at once, the refusal is shown inline and « Créer le rendez-vous »
  is held until it is corrected or removed. Nothing is clamped;
- the method is Carte or Espèces; `paidAt` is the instant of the save (its Cash Register day), exactly as
  the sheet records it;
- the deposit id is created once per draft and reused by a retry, so a repeated save is refused, never
  duplicated — on top of the one-creation guard of the sheet itself;
- the save is ONE transaction (`insertAppointmentWithDeposit`: the Appointment rows, then THE deposit write
  re-verifying the rows just inserted): never an Appointment without its requested deposit, never an orphan
  deposit, both outbox entries marked together — the push worker sends the Appointment before its deposit
  (`CLOUD_SYNC.md` §21). A refusal rolls everything back and is reported; nothing reads as saved;
- it is offered only while the new Appointment will be financially open: an Appointment of a PREVIOUS local
  day is finalized `COMPLETED` on insert (§24) and receives no deposit, so its Résumé shows no row.

Once saved, the Appointment reads exactly like one whose deposit was taken later: Details lists it under
« Acomptes », the Cash Register counts it once on the save day by its method, and the final checkout settles
only the remaining amount.

**Statuses.** `ACTIVE` counts wherever money is counted. `VOIDED` is a CORRECTION of a mistaken entry — not a
refund: it stays in the Appointment's financial history (shown « Annulé », subdued), and counts in no total:
not the Appointment, not the Caisse, not the day summary. A deposit is never edited and never deleted by a user
action; to correct an amount the professional voids it and takes a new one. There is no refund workflow and no
negative cash movement in V1, so there is no refund-date accounting: voiding simply removes the entry from the
totals, including those of the day it was paid (**known V1 limit**: a Caisse day already read keeps changing
after a void).

**Authoritative helpers** (`src/domain/appointments/deposit.ts`) — nothing else sums deposits or compares totals:

```text
getAppointmentActiveDepositTotal(deposits, id)      Σ ACTIVE amounts
getAppointmentDepositPosition(appt, sales, deps)    { expectedTotalCents, activeDepositTotalCents, remainingCents }
getAppointmentRemainingAmount(appt, sales, deps)    max(expected − ACTIVE deposits, 0) — « Reste à encaisser »
validateAppointmentDeposit(appt, sales, deps, c)    APPOINTMENT_NOT_OPEN | INVALID_AMOUNT | EXCEEDS_REMAINING | ok
canRecordAppointmentDeposit / getMaximumAppointmentDepositCents
canVoidAppointmentDeposit / voidAppointmentDeposit
findAppointmentChangeDepositShortfall               THE rule against later edits (below)
isAppointmentSettled / completePrepaidAppointment
```

`expectedTotalCents` is THE canonical expected total of §25b — services net of the discount + the Sales sold
during the Appointment. There is no second definition.

**Eligibility.** Receiving a deposit and CORRECTING one are two different questions:

```text
                        new deposit    void (correction)
SCHEDULED / CONFIRMED / IN_PROGRESS  yes            yes
CANCELLED / NO_SHOW                  no             yes      (canCorrectAppointmentDeposits)
COMPLETED                            no             no       (settled history, frozen)
```

A deposit is RECEIVED only while the Appointment is financially open — THE editing rule. A mistaken entry,
however, stays a mistaken entry after the visit was cancelled or missed, and voiding it takes no money and
creates no movement: it removes one. `COMPLETED` stays completely frozen — its checkout, its `Écart` and its
Cash Register history are settled.

**The invariant.** For a financially open Appointment:

```text
ACTIVE DEPOSITS <= CURRENT EXPECTED TOTAL
```

- a new deposit must be `> 0`, exact integer cents, and `<= remaining` (a deposit equal to the remaining amount
  is fine);
- a change that LOWERS the expected total of an open Appointment may not take it below its ACTIVE deposits
  (`findAppointmentTotalChangeDepositShortfall`): a larger or new discount, a lower price, a removed service, a
  removed linked Product, a full « Modifier » edit, the checkout discount. It is refused with « Ce changement
  ferait passer le total du rendez-vous sous les 50,00 € déjà versés en acompte. » Deposits are never silently
  reduced or voided;
- a change that does NOT lower the total (timing, order, notes, lifecycle) is never refused, even if the
  record was already inconsistent (two devices offline): it can still be moved, cancelled or completed.

Enforcement is at the persistence level, not only in the UI: the store records a deposit after re-reading the
stored Appointment, its linked Sale lines and its deposits in the same transaction, and every write that can
lower the total (`updateAppointment`, `removeAppointmentItem`, `updateAppointmentDiscount`, the linked-Product
removal) re-verifies the rule before it commits — a refusal rolls everything back. The screens ask the same
domain rule first so they can explain the refusal inline (Details quick edits, « Modifier le rendez-vous »,
the checkout sheet).

**Fully prepaid.** When ACTIVE deposits cover the whole expected total, the Appointment completes with
« Terminer le rendez-vous » and NO payment: nothing new was received, so no Cash Register movement is
created and no fake `0,01 €` is ever entered. It is then settled (`isAppointmentSettled`) and offers no further
checkout. No payment can be recorded on it at all — no tip, no `0 €` — including once it is `COMPLETED`
(`validateCheckoutAmounts` → `ALREADY_SETTLED`, re-verified by the store).

**Settled by deposits after a late discount.** A `COMPLETED` Appointment without its final payment whose
checkout discount brings the expected total down to EXACTLY its ACTIVE deposits
(`canSettleCompletedAppointmentWithDeposits`) has nothing left to receive. The sheet says « Le rendez-vous est
entièrement couvert par les acomptes. » and its action becomes « Enregistrer »: the store
(`settleCompletedAppointmentWithDeposits`) writes ONLY the discount — through the checkout discount write, never
below the deposits — and verifies, in the same transaction, that the deposits now cover the whole total. No
payment, no `paidAt`, no amounts; the Appointment stays `COMPLETED` and is settled (`isAppointmentSettled`). The
Caisse gains no receipt: the deposits stay counted once, on their own `paidAt`. Example: `100 €` expected, `70 €`
deposit, `30 %` discount → saved, nothing received. A discount leaving `10 €` due still requires the exact `10 €`
checkout. This path is only for deposits covering the total: a free Appointment without deposits is still settled
by an ordinary `0 €` checkout.

**Cash Register.** An ACTIVE deposit is a real money movement on its own `paidAt`, by its own method: a `30 €`
card deposit received on 22 September counts on 22 September (card total, « Acompte · <services> » entry that
opens the Appointment), never again on the Appointment day; the final checkout on 5 October records only the
`70 €` still due.

**Client spending.** Deposits are not an input of `Total dépensé`: an Appointment counts its expected total
once `COMPLETED` (`100 €` paid as `30 €` + `70 €` counts `100 €`, never `130 €`). They create no Client history row
either.

**Deletion.** An Appointment holding a deposit — even a VOIDED one — cannot be permanently deleted (§28).

**When the invariant does not hold.** Two devices editing OFFLINE can each make a locally valid write that is
invalid once merged: one lowers the total to `50 €` while the other records a `60 €` deposit. The remote is the
authority on the financial state of an Appointment and refuses the SECOND of those writes
(`docs/architecture/CLOUD_SYNC.md` §21.2), so the invalid state never becomes authoritative; the refused write
stays queued on its device, which keeps its record.

A device can still HOLD such a state — its own pending write plus what it pulled, a restore of a remote written
before the rule existed, an administrator's edit. `findAppointmentDepositInvariantBreach` detects it (for every
status but `COMPLETED`, whose `Écart` is legitimate history) and returns the two amounts and the excess. It is
never silently accepted:

- `remainingCents` stays `0` — never negative — and no surface may present that `0` as « nothing is due »: the
  Appointment reads « Conflit financier à résoudre », with the deposits, the total and the excess;
- while it stands: no checkout (the fully prepaid completion included) and no new deposit;
- the two ways out are the ordinary financial actions, both traceable: VOID a deposit recorded by mistake, or
  RAISE the total back (a change that does not lower it is never refused). Nothing is clamped, no deposit is
  silently voided, no price is silently raised, no device's change is silently overwritten.

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

**Deletion guard.** An Appointment that carries a recorded payment (Cash Register history), holds a deposit
(§25d, VOIDED included), or that a Product Sale references (`sale.appointmentId`) cannot be permanently
deleted: historical integrity wins. The session
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

# 30b. Client Reminder Flag

```text
clientReminderEnabled?: boolean
```

The per-appointment override of the automatic client email reminders
(Communications Lot B, `docs/architecture/COMMUNICATIONS.md` §12).

- absent = ENABLED: only an explicit professional choice stores `false`;
- ONE domain rule reads it: `isAppointmentClientReminderEnabled(appointment)` —
  never compare the raw field in a screen;
- the GLOBAL business preference (server-authoritative, OFF by default) is the
  master switch: this flag alone never sends anything;
- scheduling, cancellation and content of the reminder are decided SERVER-side
  from synced state; the domain stores the intent only.

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
exact settlement (checkout due, under / over refused in domain, sheet and store, deposits, prepaid refused)
checkout discount of a completed-unpaid appointment (frozen once paid, deposit shortfall, settled by deposits)
late checkout payment date (appointment day / today, cross-midnight, DST, Caisse day, offline sync)
split autofill (automatic / manual owners, clearing, discount retarget, correction opens unchanged)
payment correction (split changes, status and paidAt preserved, legacy overpaid range)
appointment discount (percentage half-up cent rounding, fixed clamping, never negative,
  services only, terminal appointments frozen, snapshot prices untouched)
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

These invariants are the foundation of BeautIzzy scheduling.
