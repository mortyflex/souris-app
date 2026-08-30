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

The canonical Client contains identity/contact fields only:

```text
id         string
firstName  string
lastName?  string
phone?     string
email?     string
birthDate? string   YYYY-MM-DD
```

`id` is a stable identity and never changes — including when identity/contact
information is edited.

### birthDate

`birthDate` is a CIVIL calendar date, stored canonically as:

```text
YYYY-MM-DD
```

Example:

```text
1994-10-12
```

It is NOT a timestamp and never a JavaScript Date at local midnight, so
stored birthdays never shift with timezone. Conversions to/from `Date` happen
only at input boundaries using local calendar components.

The value is either a full `YYYY-MM-DD` date or absent — there is no
partial-date model.

Future birthday features (promotions, reminders) will consume this field;
they are NOT implemented now.

Activity statistics (appointment counts, total spent, upcoming appointments)
are never stored on the Client. They are always DERIVED from Souris
Appointment state through `clientId`.

Future fields (notes, formulas, photos, purchased products, visit frequency)
are separate future features and must not be added speculatively.

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
birthdate → birthDate   only valid YYYY-MM-DD civil dates
```

The legacy `birthdate` field is mapped ONLY when it is a valid `YYYY-MM-DD`
civil date. `null`, missing, and non-conforming values (other formats,
partial dates) are discarded — never converted or invented. The current
legacy dataset contains no usable birthday value, so imported clients start
without a `birthDate`.

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

## 7. Future Client Capabilities

Client deletion is a future increment with its own deliberate rules
(relationship/history consequences).

Notes, photos, technical formulas, and statistics are separate future
features and remain outside the Client domain.

Purchased-product history will derive from the future Sales/Transaction
domain through `clientId` — it is never stored on the Client.
