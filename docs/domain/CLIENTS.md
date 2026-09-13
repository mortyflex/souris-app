# Souris — Client Domain

## 1. Purpose

This document defines the Client identity model of Souris.

A Client selected during Appointment creation is the SAME Client later used by:

```text
Agenda
Appointment Details
Appointment Editing
Client Profile
Client Appointment History
```

Relationships use:

```text
clientId
```

only.

Appointments are never related to clients through:

```text
name matching
phone matching
fuzzy matching
```

---

## 2. Canonical Client

The canonical Client contains identity/contact fields plus one lifecycle marker:

```text
id          string
firstName   string
lastName?   string
phone?      string
email?      string
birthday?   { month, day }   day + month only, never a year
archivedAt? Date             lifecycle marker, absent while active
```

`id` is a stable identity and never changes — including when identity/contact
information is edited, archived, or restored.

### birthday

Souris needs a Client birthday to recognize an upcoming birthday, offer a
birthday promotion and show it — never to compute an age. The canonical value
is therefore a DAY + MONTH pair with no year:

```text
birthday?: { month: 1..12, day: 1..monthLength }
```

Examples:

```text
{ month: 7, day: 21 }   → « 21 juillet »
{ month: 2, day: 3 }    → « 3 février »
{ month: 2, day: 29 }   → « 29 février » (always allowed: no year qualifies it)
```

Rules (`src/domain/clients/birthday.ts`):

- the year is never asked for, stored, or invented — no `2000-07-21`
  sentinel, no fake civil date;
- impossible pairs (`02-30`, `04-31`, month 13) are invalid; the UI selector
  cannot build them and changing the month clamps a day the new month lacks;
- the persistence key is the civil `MM-DD` string (`formatBirthdayKey` /
  `parseBirthdayKey`); the domain value stays the pair;
- a historical full `YYYY-MM-DD` date (legacy import, schema ≤ v3 rows) maps
  through `birthdayFromCivilDate`, which keeps day + month and discards the
  year without validating it — a recorded `1990-02-29` still yields
  `{ month: 2, day: 29 }`;
- presentation is French, day first (`formatClientBirthday`: « 1er janvier »).

The value is either a complete day + month pair or absent — there is no
partial-date model.

Future birthday features (promotions, reminders) will consume this field;
they are NOT implemented now.

Activity statistics (appointment counts, total spent, upcoming appointments)
are never stored on the Client. They are always DERIVED from Souris
Appointment state through `clientId`.

Purchased products are derived from Sales through `clientId` and never
stored on the Client. Future fields (notes, formulas, photos, visit
frequency) are separate future features and must not be added speculatively.

---

## 3. Legacy Import Contract

The old Souris address book may contain records with fields such as:

```text
_id
firstName
lastName
telephone
email
birthdate
```

plus old commercial data:

```text
stats
notes
importedVisitNotes
lastVisitDate
visitNb
ticketAverage
totalSpent
no-show information
age
address
```

The import rule is STRICT.

Allowed mapping:

```text
_id       → id
firstName → firstName
lastName  → lastName
telephone → phone
email     → email
birthdate → birthday    day + month of a well-formed YYYY-MM-DD only
```

The legacy `birthdate` field is mapped ONLY when it is a well-formed
`YYYY-MM-DD` value with a real day + month pair; the year is discarded.
`null`, missing, and non-conforming values (other formats, partial dates,
impossible pairs) are dropped — never converted or invented. The current
legacy dataset contains no usable birthday value, so imported clients start
without a `birthday`.

EVERYTHING ELSE is ignored. In particular, Souris never imports:

```text
old visits
old visit counts
old spend
old average basket
old last visit
old no-show history
old notes
old imported visit notes
```

Souris commercial and appointment history starts from zero.

Empty optional values become `undefined`.

---

## 4. Relationships

Appointments reference clients through `clientId` only.

Client display names are always resolved from the Client source at render
time; they are never duplicated into the Appointment model or its session
entries. Editing a Client's identity never rewrites any Appointment — the
relationship and resolution both go through the stable id.

---

## 5. Souris-Generated History

A Client's appointment history contains only Appointments created in Souris:

```text
appointment.clientId === client.id
```

Historical terminal outcomes (`CANCELLED`, `NO_SHOW`) remain part of history.

Cancellation history distinguishes the recorded actor:

```text
CLIENT   → Annulé par la cliente
BUSINESS → Annulé par le salon
```

Both remain historical records. Only explicit permanent Appointment deletion removes a row from Client history.

History is sorted by appointment date, newest first, and never mutated.

---

## 6. Derived Client Activity

The following values are DERIVED from Souris Appointment state and are never
persisted on the Client:

```text
Rendez-vous réalisés  → appointments with status COMPLETED
Annulations           → appointments with status CANCELLED
                        and cancellation.cancelledBy === CLIENT
Absences              → appointments with status NO_SHOW
Total dépensé         → sum of AppointmentItem snapshot prices for
                        COMPLETED appointments only
```

`Total dépensé` uses AppointmentItem snapshot prices — never current catalog
prices — and excludes SCHEDULED, CONFIRMED, IN_PROGRESS, CANCELLED, and
NO_SHOW appointments.

A `BUSINESS` cancellation remains visible in history with its actor and optional reason, but it does not increment
the Client `Annulations` metric. That metric describes Client behavior only. `NO_SHOW` continues to increment
`Absences` according to its status.

Deleting an erroneous or duplicate Appointment automatically removes all of its contributions from Client history
and activity. For example, deleting a `COMPLETED` Appointment removes its completed count and snapshot amount from
`Total dépensé`; deleting a `CANCELLED` or `NO_SHOW` Appointment removes the corresponding historical outcome.
These changes are derived from the remaining Appointment collection and never stored as Client counters.

Upcoming appointments are derived from status + date: CANCELLED, NO_SHOW, and
COMPLETED are excluded; the nearest future appointment by `startAt` is the
next appointment.

The Client Profile activity section is STABLE and remains visible at zero:
zero completed, zero spent, zero absences, and zero cancellations are valid
information, never replaced by a hidden section or an empty-state card.

---

## 7. Client Lifecycle

Archive is the normal way to remove a Client from daily use. Permanent
deletion is a separate, destructive operation allowed only when history is
safe. There is no status enum, no boolean flag, no `deletedAt`, no reason.

### Active / archived

```text
active   = archivedAt == null
archived = archivedAt != null
```

`archivedAt` is the exact instant of the archive (a `Date` in the domain,
an ISO instant in persistence, restored as the same `Date`). Archiving:

- never deletes the Client, an Appointment, or a Sale;
- never rewrites an Appointment or Sale snapshot;
- never alters derived activity metrics or purchase history;
- never touches identity fields (editing identity never archives or restores).

`archiveClient` and `restoreClient` are pure, idempotent domain operations:
restoring removes `archivedAt` entirely (no `null`).

### Selection rules

Every flow that chooses a Client for a NEW action reads ACTIVE Clients only:

```text
Appointment creation — Cliente step
Appointment editing  — Modifier la cliente
Sale creation        — Choisir / Modifier la cliente
```

An archived Client is never offered there, never preselected from a stale
route parameter, and never silently restored because an action was
attempted. Existing references keep resolving everywhere (`clientId` →
Client), so Agenda blocks, Appointment Details, Appointment history, and
`Produits achetés` still show the archived Client's identity. Her profile
stays reachable from the directory (`Archivées` group) and from history.

Reactivating (`restoreClient`) makes the Client selectable again immediately.

### Permanent deletion eligibility

```text
canDeleteClientPermanently = appointmentCount == 0 AND saleCount == 0
```

Any Appointment status counts (SCHEDULED, CONFIRMED, IN_PROGRESS,
COMPLETED, CANCELLED, NO_SHOW) and any Sale counts. Historical integrity
always wins: deletion never cascades, never nulls `clientId`, never
anonymizes. Persistence re-verifies the references inside the delete
transaction and raises a typed conflict; the rule is never trusted to
in-memory arrays alone (`docs/architecture/PERSISTENCE.md`).

Deletion is offered only from an ARCHIVED Client — the deliberate path is
`active → archived → deleted (if safe)`.

---

## 8. Future Client Capabilities

Notes, photos, technical formulas, and statistics are separate future
features and remain outside the Client domain.

Purchased-product history derives from the Sale domain through
`sale.clientId` (`docs/domain/SALES.md`) — it is never stored on the Client,
and it does not change the Appointment-derived activity metrics above.
