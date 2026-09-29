# Souris — Calendar Blocks (Personal Unavailability)

## 1. Purpose

The professional must be able to block a period of her calendar for something that is NOT a client
Appointment — a break, travel, admin work, training, a medical appointment — without creating a fake
client, a zero-price service or a pretend Appointment.

A **Calendar Block** is that period. In the product it always reads as:

```text
Indisponible
```

It is calendar availability and nothing else:

```text
client Appointment   → client / services / pricing / payment lifecycle
Calendar Block       → staff member + interval + reason
```

The two are deliberately different entities. A Calendar Block is NOT an Appointment variant, a status,
or an item type. There is no generic "calendar event" abstraction in Souris, and none was introduced:
the only thing the two share is a place on the Agenda, which is a presentation concern (§7).

Source: `src/domain/calendar-blocks/` (plain TypeScript, no React / Expo / persistence import).

---

## 2. Model

```ts
interface CalendarBlock {
  id: string;             // UUID v4 generated on the device
  businessId: string;
  staffMemberId: string;  // the professional who is unavailable
  startAt: Date;          // exact instant, like Appointment.startAt
  endAt: Date;            // EXCLUSIVE end, strictly after startAt
  reason: string;         // normalized free text, never blank
}
```

Rules (`validation.ts`):

```text
END_NOT_AFTER_START   endAt <= startAt, or an invalid instant
REASON_REQUIRED       the reason is empty or whitespace
```

- `normalizeCalendarBlockReason` trims the edges, collapses inner whitespace to one line and bounds the
  text to 80 characters. A blank reason is `undefined`, never an empty string.
- `createCalendarBlock` returns a valid, normalized copy or throws `CalendarBlockInvalidError` listing
  the broken rules (never a value). The editor, the session and the store all go through it.
- The quick suggestions of the editor (« Pause », « Personnel », « Déplacement », « Administratif »,
  « Formation », « Autre ») are a UX shortcut ONLY. What is stored is ordinary text; there is no enum,
  no category and no vocabulary CHECK anywhere. « Autre » is not a reason: it opens the free-text field.

### What a block does NOT have

```text
no clientId            no items / phases        no price, discount or payment
no status              no notes                 no cancellation / no-show outcome
```

Its lifecycle is "exists" or "deleted". `SCHEDULED … NO_SHOW` are Appointment statuses and are never
reused here. Sync metadata (`created_at`, `updated_at`, `sync_version`, `deleted_at`) is NOT part of the
domain value: like every Souris aggregate it lives in the sync layer (`CLOUD_SYNC.md` §20).

---

## 3. Financial and client isolation

A Calendar Block never participates in:

- checkout, the Cash Register (Day or Month), payment lists, expected-total calculations;
- Client « Total dépensé », Client activity counts, Client appointment history, purchased products;
- appointment discounts, service statistics, the Client directory, Client search, Sales.

This is structural, not a filter. A block lives in its own table and its own session
(`CalendarBlockSessionProvider`); every derivation above takes `Appointment[]` and `Sale[]` — types a
block cannot be — from the Appointment and Sale sessions. No financial code contains a "skip blocks"
branch and none invents a zero-amount row. Covered by `financial-isolation.test.ts` and
`calendar-blocks-store.test.ts`.

---

## 4. Time semantics

- A block is defined explicitly by its start and its end, chosen on the same 5-minute wheels as an
  Appointment start (`TimeWheelPicker`, `START_TIME_MINUTE_STEP`).
- It stays on the Agenda day it was created from. Both instants are built with local wall-clock
  construction (`new Date(y, m, d, 0, minutes)`), the same way as `creation/draft-start.ts`; nothing is
  ever converted through UTC, and the stored instants are exact (ISO-8601 UTC text in SQLite, like
  `appointments.start_at`).
- Editor bounds: start `08:00 … 23:50` (the first hour the Agenda canvas shows), end `(start … 23:55]`.
- Defaults: the start inherits the Agenda context (the tapped time, or the time already chosen on the
  creation context row); the end is `start + 30 minutes`.
- Moving the start keeps the chosen duration (the end follows, clamped to the day). Moving the end
  never moves the start: an end that is not after the start is reported inline and the save is
  disabled — it is never silently "fixed".

Source: `src/features/calendar-blocks/editor/block-times.ts`.

---

## 5. Schedule conflicts — the one blocking availability rule

`APPOINTMENTS.md` §16–§19 stands: overlap between client **Appointments** is allowed and NON-BLOCKING.
A Calendar Block is different in kind — it is the professional declaring herself unavailable — so it
is the ONE rule of manual scheduling that blocks a save (explicit product decision, September 2026).

```text
Calendar Block  vs  Calendar Block     same staff member, intervals intersect             → refused
Calendar Block  vs  client Appointment same staff member, the block intersects an
                                       interval where the Appointment REQUIRES her        → refused
client Appointment created or moved    same rule, seen from the Appointment's side        → refused
```

Precisely (`conflicts.ts`, `domain/appointments/occupancy.ts`):

- **Ends are exclusive.** `10:00–11:00` and `11:00–12:00` are adjacent, not overlapping.
- **Staff-aware.** Only the same `staffMemberId` is ever compared. One professional being unavailable
  never prevents another from working.
- **An Appointment occupies the professional only during its staff-required phases.**
  `getAppointmentStaffBusyIntervals` merges consecutive `requiresStaff = true` phases (across items)
  and splits on unattended phases — the very intervals the Agenda draws as cards. A pause taken while
  a colour processes is legitimate; an Appointment whose processing time alone crosses a block is
  accepted. Zero-duration phases occupy nothing.
- **Cancelled and no-show Appointments occupy nothing** (`doesAppointmentOccupySchedule`, the same
  rule the Agenda uses for operational visibility). Every other status, `COMPLETED` included, holds
  its place.
- A block being edited never conflicts with itself.

This is NOT visual overlap handling. The Agenda column layout (`calculateDayIntervalLayout`) keeps its
own geometry and draws whatever exists; the functions above answer one question — may this be saved? —
and nothing reads them to draw.

Where it is enforced:

```text
Calendar Block create / edit   CalendarBlockForm shows the conflict inline and disables the action;
                               CalendarBlockSessionProvider re-verifies it and throws
                               CalendarBlockConflictError — nothing is written
Appointment creation           Résumé step: inline notice above the actions, « Créer le rendez-vous »
                               disabled, judged on the DRAFT (start + ordered services + phases)
Appointment editing            inline notice, « Enregistrer les modifications » disabled — ONLY when
                               the staff-required intervals changed. A price / Client / discount edit is
                               never held back by an overlap that already existed
Appointment Details            the quick edits — « Enregistrer » of a Service's phase durations, the
  quick edits                  reorder drag, the swipe removal — are refused BEFORE any write, with an
                               inline notice under « Prestations »; the timing draft is kept
```

### One rule for every change of an existing Appointment

`findAppointmentChangeCalendarBlockConflict(current, candidate, calendarBlocks)` is what the full editor
AND the Details quick edits call. The candidate Appointment is computed first, by the very domain
operations the session applies (`updateAppointmentItemPhaseDurations`, `reorderAppointmentItemsByIds`,
`removeAppointmentItem`, or the editor's draft), then:

```text
occupied intervals identical   → nothing is checked. Price, Client, discount, a longer trailing
                                 unattended phase, a split of one staff phase in two: the professional
                                 is not busier, so not even a PRE-EXISTING overlap holds the edit back
occupied intervals changed     → the candidate is validated against the Calendar Blocks of its staff
                                 member (a reduction that still overlaps is refused like the editor does)
```

"Occupied" is `getAppointmentStaffBusyIntervals` — never the start/end envelope — compared with
`areStaffBusyIntervalsEqual`. A refused quick edit persists nothing: no clamped duration, no moved
Appointment, no moved block. Appointment-versus-Appointment overlap is not an input of the rule at all.
Status and editability rules are untouched: a quick edit that was not offered is still not offered.

Messages:

```text
Ce créneau est marqué comme indisponible de 10:00 à 11:30.                   Indisponible — Déplacement
Un rendez-vous est déjà prévu sur ce créneau.                                Rendez-vous de 10:00 à 10:45
Ce changement ferait empiéter le rendez-vous sur un créneau indisponible.    Indisponible — Pause, 10:00–11:00
```

Known limit (deliberate):

- Sync never enforces the rule: two devices editing offline can produce an overlap. Both records are
  kept and drawn side by side; nothing is dropped.

---

## 6. Staff scope

A block belongs to ONE professional. The staff identifier comes from the same single source as client
Appointments — `src/features/appointments/current-staff-member.ts` — so the two are always stamped
with, and checked against, the very same `staffMemberId`. Single-professional V1 exposes no staff
picker (`CLAUDE.md` §18); the data model is staff-scoped all the same.

---

## 7. Product surfaces

```text
Creation     the existing « + » / timeline tap → « Client | Personnel » (shared SegmentedControl).
             « Client » is the unchanged three-step flow. « Personnel » replaces it by ONE direct
             form: date context, Début / Fin, Motif chips (+ free text behind « Autre »),
             « Bloquer le créneau ». The two drafts never meet.
Agenda Day   drawn through the SAME interval layout, visible range and minute scale as Appointment
             segments: exact start, exact duration, shared overlap columns.
             ≥ 32 pt   Indisponible / reason      two lines
             16–32 pt  Indisponible · Pause       ONE line (15–25 minute blocks)
             < 16 pt   colour only                the spoken label still says everything
Agenda Week  a row in the day's chronological list: mauve marker, glyph, « Indisponible », then
             « reason · jusqu'à 11:30 ». Never counted as a « rendez-vous ».
Details      a dedicated content sheet (NOT Appointment Details): Motif, Date, Horaire — Modifier,
             Supprimer, Fermer. Swipe-down, outside tap and « Fermer » all close it.
Editing      the same form, « Enregistrer les modifications »; the draft is protected from a swipe.
Deletion     confirmation dialog, permanent; a remote tombstone under the sync layer.
```

Accessibility: `Rendez-vous client` / `Rendez-vous personnel`, `Heure de début`, `Heure de fin`,
`Motif`, `Bloquer le créneau`, and blocks announced as
`Indisponible, Déplacement, de 10 heures à 11 heures 30`. Nothing relies on colour. No special motion.

Design: `docs/design/DESIGN_OVERRIDES.md` §24.

---

## 8. Persistence and sync

```text
local    SQLite schema v11 — table calendar_blocks            docs/architecture/PERSISTENCE.md §4, §7f
cloud    aggregate CALENDAR_BLOCK through the existing sync   docs/architecture/CLOUD_SYNC.md §20
         supabase/migrations/20260923120000_create_calendar_blocks.sql   (applied BY HAND)
```

---

## 9. Not implemented

- recurring blocks (a daily lunch break), all-day or multi-day blocks, time off / holidays;
- working hours, breaks as business settings, an availability policy for online booking
  (`APPOINTMENTS.md` §20–§21 — a Calendar Block is one future INPUT of that layer, not the layer);
- a staff picker; blocks for several professionals at once;
- suggestions of the next free slot.

Do not build these before their dedicated phase.
