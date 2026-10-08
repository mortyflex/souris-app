# BeautIzzy — Client Domain

## 1. Purpose

This document defines the Client identity model of BeautIzzy.

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
notes?      string           free-text professional note written in BeautIzzy
smsMarketingConsent? record  explicit promotional SMS consent + audit pair, absent = UNKNOWN
archivedAt? Date             lifecycle marker, absent while active
```

`id` is a stable identity and never changes — including when identity/contact
information is edited, archived, or restored.

### birthday

BeautIzzy needs a Client birthday to recognize an upcoming birthday, offer a
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
- presentation is French, day first, through ONE shared formatter pair:
  `formatClientBirthday` (« 1er janvier », profile and form) and
  `formatClientBirthdayCompact` (« 21 sept. », compact form; no screen shows it
  at the moment);
- the birthday is ANNUAL: it recurs every year from day + month alone, so a
  Client whose birth year is unknown — every Client — is fully supported;
- it is a civil calendar value, never an instant: it is never converted
  through a `Date`, a timestamp or UTC, so no time zone can shift it;
- ONE rule answers « is it her birthday? »:
  `isClientBirthdayOnDate(client, date)`. It compares the birthday with the
  LOCAL calendar day of `date` (never UTC); the year of `date` only decides
  the leap rule. `isClientBirthdayToday(client, now)` delegates to it. Every
  screen uses this rule and none re-implements the comparison;
- **29 février.** A `29 février` birthday is celebrated on the 29th in a leap
  year and on the **28th** in a year without a 29th, so it is never skipped.
  This is the current product rule (kept as is; a « 1er mars » alternative
  would be an explicit product decision).

The value is either a complete day + month pair or absent — there is no
partial-date model.

The Clientèle directory rows show no birthday: the Client Profile shows it.

#### Birthday experience

Which date is compared depends on the screen:

```text
Client Profile                       → TODAY's local date
Appointment creation / editing / Details → the APPOINTMENT date
```

An Appointment booked on 10 septembre for the 21 septembre birthday therefore
gets the birthday suggestion, although today is not the birthday.

Implemented (`src/features/clients/birthday`):

- **profile reminder** — a « Joyeux anniversaire » card near the top of the
  profile (« C'est l'anniversaire de Léa aujourd'hui. » / « Vous pouvez lui
  proposer une réduction sur son rendez-vous. »), always visible that day;
- **short celebration** — one confetti burst (≈ 2.2 s, UI thread, decorative
  and hidden from assistive technology) and ONE success haptic when the
  profile opens. Played once per profile ENTRY (per mount of the screen):
  leaving the profile and opening it again celebrates again, on purpose; a
  re-render, a state update or a data refresh never replays it. No session or
  stored state is involved. Reduce Motion skips the confetti and keeps the
  card and the haptic;
- **recognition at Client selection** — in Appointment creation, choosing a
  Client whose birthday is the APPOINTMENT date shows a compact reminder on
  the Client step at once and plays the same burst and haptic
  (`docs/domain/APPOINTMENTS.md` §15.3). The copy says « aujourd'hui » only
  when the Appointment date is today, « ce jour-là » otherwise;
- **Appointment discount suggestion** — see
  `docs/domain/APPOINTMENTS.md` §15.3: a reminder next to « Réduction » whose
  action only opens the generic discount editor.

`today` is refreshed at local midnight and when the app returns to the
foreground (`useToday`), so a screen left open overnight stays right.

An archived Client is never celebrated: her profile shows no card, confetti or
haptic.

Nothing is persisted: no « confetti shown », no « dismissed », no discount
origin. No migration, no sync change.

Still NOT implemented:

- automatic birthday discount (nothing is ever discounted without the
  professional choosing it);
- birthday promotion history / discount source or reason;
- birthday reminders ahead of the day, notifications, marketing automation;
- any Cash Register change tied to a birthday.

### notes

One optional free-text note per Client, written in BeautIzzy by the
professional: allergies, product sensitivities, preferences, useful context,
practical information. Rules (`src/domain/clients/notes.ts`):

- plain text only — no categories, no medical model, no structured fields;
- `normalizeClientNotes` trims the edges and preserves every internal line
  break; a blank or whitespace-only note is NO note (`undefined` in the
  domain, `NULL` in SQLite and in the cloud) — there is no empty-string note;
- the form bounds the input at `CLIENT_NOTES_MAX_LENGTH` (2000 characters,
  several paragraphs). It is an input bound only: validation never rejects a
  Client because of its note, and no database CHECK depends on it;
- notes are read on the Client Profile (`Notes` section, line breaks
  preserved, absent when there is no note) and edited in the shared Client
  form. They never appear in the directory rows and are NOT searchable:
  search still matches names and phone only;
- notes are BeautIzzy-created data. The legacy `notes` / `importedVisitNotes`
  fields are still never imported (§3);
- notes and birthday never influence the active-Client count, archiving,
  ordering, or search results.

Activity statistics (appointment counts, total spent, upcoming appointments)
are never stored on the Client. They are always DERIVED from BeautIzzy
Appointment state through `clientId`.

Purchased products are derived from Sales through `clientId` and never
stored on the Client. Future fields (formulas, before/after photos, visit
frequency) are separate future features and must not be added speculatively.

### smsMarketingConsent

Explicit promotional SMS consent (SMS pivot Phase 2 —
`docs/architecture/COMMUNICATIONS.md` §34, `src/domain/clients/sms-consent.ts`):

```text
smsMarketingConsent?: { status: OPTED_IN | OPTED_OUT, updatedAt: Date,
                        source: PROFESSIONAL | CLIENT_STOP }
```

- ABSENT = UNKNOWN: never asked or never recorded. UNKNOWN and OPTED_OUT
  never receive a promotional lifecycle SMS; only OPTED_IN is eligible. A
  phone number by itself is never consent;
- the professional records the client's EXPRESSED choice in the shared
  Client form (« SMS promotionnels » — Non renseigné / Autorisés / Refusés,
  defaulting to Non renseigné). An unchanged choice keeps its original audit
  record; clearing back to Non renseigné removes the record entirely
  (`resolveClientSmsMarketingConsent`);
- Phase 2 captures are always `PROFESSIONAL`; `CLIENT_STOP` is reserved for
  a future inbound unsubscribe mechanism;
- the profile `Informations` section shows the recorded state (« Autorisés »
  / « Refusés »); UNKNOWN shows no row. The directory never shows consent
  and it is not searchable;
- never imported from legacy data (§3 still applies) and never backfilled:
  existing clients are UNKNOWN until the professional records a choice;
- persisted as three SQLite/remote columns travelling together
  (PERSISTENCE.md schema v16) and carried by the CLIENT aggregate through
  the normal sync with the usual missing-key rule.

### photoPath

One optional portrait per Client, taken or chosen in BeautIzzy
(`src/features/clients/photo`):

- the Client carries only `photoPath?: string` — the STABLE object path of
  the image in the private Business media storage,
  `<business_id>/clients/<client_id>/<photo_id>.jpg`. Never a device file
  URI, never a signed URL, never image bytes (not in the domain, not in
  SQLite, not in Postgres);
- every new photo is a NEW object (new `photo_id`), so the path changes with
  the photo; a replaced object is removed once the new path is committed;
- the Client Profile avatar (the 80 pt portrait `ClientAvatar`) is the
  control: a small camera badge, one tap opens the shared photo sheet —
  `Prendre une photo` / `Prendre une nouvelle photo`, `Choisir dans Photos`,
  `Supprimer la photo` when a photo exists, `Annuler`. Camera permission is
  asked on `Prendre une photo` only (shared with Product photos,
  `src/shared/lib/photo-acquisition.ts`);
- every photo is normalized the same way: orientation applied, centered
  square crop, at most 720 × 720, JPEG 0.8;
- save order: upload the object → commit the path on the Client → remove the
  replaced object. A failed upload or commit leaves the Client and its
  previous photo untouched (`Impossible d’enregistrer la photo.`). Saving
  needs the cloud: without it nothing is saved, and a photo is never
  local-only;
- removal clears the path at once (local-first, synced like any Client
  change), then removes the object; no confirmation — another photo can
  always be added back;
- each device keeps a cached copy under `<documents>/client-photos/`,
  derived from the path: shown offline once seen, downloaded once on
  another device, initials whenever it cannot be had;
- identity edits, archive and restore never touch the photo; photos are
  never imported from legacy data (§3) and appear only on the Client Profile
  (the directory keeps its initials).

---

## 3. Legacy Import Contract

The old BeautIzzy address book may contain records with fields such as:

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
impossible pairs) are dropped — never converted or invented. The pilot
legacy export contained no usable birthday value, so imported clients start
without a `birthday`.

A real address book is personal data: it is NEVER tracked in the repository.
The only tracked legacy-shaped dataset is the synthetic development one
(`src/features/clients/data/synthetic-legacy-clients.ts`: fictional names,
phone numbers from the ranges reserved for fiction, `example.com` emails),
which keeps this contract exercised by the development seed and the tests.

EVERYTHING ELSE is ignored. In particular, BeautIzzy never imports:

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

BeautIzzy commercial and appointment history starts from zero.

Empty optional values become `undefined`.

---

## 3b. Client Import — « Importer ma clientèle »

The professional's own address book enters BeautIzzy through ONE shared import pipeline, whatever
the source:

```text
source → extraction → parsing → normalization → validation
       → duplicate detection → review → confirmed import
```

Code: `src/domain/clients/import/` (pure TypeScript) and `src/features/clients/import/` (screen,
review, chunked run). Entry: Clientèle (see `docs/design/DESIGN_OVERRIDES.md` §41). The flow lives
in the authenticated, Business-bound `(app)` group only; onboarding does not use it yet.

### Sources

| Source     | State                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| `PASTE`    | Implemented: text pasted into a multiline field (system Paste; no clipboard API read).  |
| `CSV`      | Implemented: a file chosen in the system file picker, read in memory (`parseClientImportCsv`). |
| `CONTACTS` | Future adapter (phone contacts are not implemented).                                    |
| `OCR`      | Future adapter: recognized text will feed the SAME text parser (`parseClientImportText(text, 'OCR')`). |

Persistence never depends on the source.

### Candidate (staging only)

```text
ClientImportCandidate
├── key          stable within the batch
├── source       PASTE | CSV | CONTACTS | OCR
├── sourceRef?   « 3 », « 3-4 » (lines / rows)
├── firstName?   lastName?   phone?   email?   birthday?
├── raw?         the source text, shown for correction
└── issues[]     extraction issues
```

A candidate is NOT a Client: it may lack a first name, carry an invalid email, or hold warnings.
It exists in memory during the review only and is never persisted.

Allowed fields: first name, last name, phone, email, birthday — nothing else. Never imported:
notes, a photo, an archive state, external ids, SMS marketing consent. An imported Client's
promotional SMS consent is UNKNOWN (absent): nothing infers consent from a phone number, a
spreadsheet, pasted text or another software. Leftover text is reported (`IGNORED_TEXT`), never
turned into notes. §3's strict no-history rule applies to every source.

### Paste parser (`parseClientImportText`)

Deterministic extraction:

- emails: any token holding « @ » — kept even when invalid, so the review asks for a correction;
- phones: French national (`06 12 34 56 78`, dots, hyphens), `+33 6…`, `+33 (0)6…`, `0033…`,
  bare `33612345678`, other international numbers; any other 8–15 digit run is kept and flagged;
- birthdays after a marker: `anniv`, `anniversaire`, `né le` / `née le`, `ddn`;
- tab-separated rows (Excel, Numbers, Google Sheets): one row = one candidate; a header row maps
  `Prénom`, `Nom` (the whole name when there is no `Prénom` column), `Téléphone` / `Portable` /
  `Tél`, `Email` / `Mail`, `Anniversaire` / `Date de naissance`; unknown columns are ignored as a
  whole and listed once.

Records: a line with a name starts a candidate; a blank line closes it. A nameless line (phone,
email, birthday) completes the candidate — always inside blank-line blocks, and in a plain list
only when it fills a field the candidate lacks. A line with no name, phone, email or date is
reported as unread, never an empty candidate. A heading line ending with « : » is skipped.

Heuristics always produce a review issue:

| Issue                  | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `AMBIGUOUS_NAME_SPLIT` | 3+ name words, or an ALL-CAPS first word taken for the last name           |
| `AMBIGUOUS_BIRTHDAY`   | a date without a birthday marker — except a complete `DD/MM/YYYY` date that exists in the calendar (`14/05/1992`), which is certain |
| `BIRTHDAY_DROPPED`     | an impossible date (`31/04`)                                               |
| `EXTRA_PHONES` / `EXTRA_EMAILS` | only the first is kept                                           |
| `IGNORED_TEXT`         | leftover words, parentheses, symbols; words after a field delimiter (`-`, `/`, `\|`, `;`, `,`) never join the name |
| `UNRECOGNIZED_PHONE`   | computed: the phone maps to no canonical number — a warning, never a refusal |

Blocking (computed from the current values): `MISSING_FIRST_NAME` (no phone-only Client is ever
created) and `INVALID_EMAIL` (an explicitly supplied invalid email must be corrected or erased).

Birthdays: day first (French), `12/04`, `12.04`, `12/04/1990`, `12 avril`, `1er mai`, `3 févr.`.
A year is never stored, but a complete `DD/MM/YYYY` date is validated WITH its year first: one that
does not exist (`29/02/1991`, `31/02/1991`) is dropped with `BIRTHDAY_DROPPED`, the date quoted in
the issue; `29/02/1992` is kept as 29 février. Without a year, `29/02` is a valid day + month (§2).
An impossible day + month pair (`31/04`) is dropped with `BIRTHDAY_DROPPED`.

### CSV adapter (`parseClientImportCsv`)

`src/domain/clients/import/csv-parser.ts` holds everything CSV-specific and nothing else:

- **bytes → text**: UTF-8 (with or without a byte order mark), UTF-16 with a byte order mark,
  otherwise Windows-1252 — the encoding of a French Excel « CSV » export. A file holding binary
  control characters (a workbook, a PDF) is refused as `NOT_TEXT`; a blank file as `EMPTY`;
- **text → records**: the delimiter is the one of « ; », « , » and tab that cuts the first rows
  into the same number (2+) of cells most often — « ; » on a tie — or the one announced by an Excel
  `sep=;` first line; without any, each line is one cell. Quoted cells, doubled quotes, line breaks
  inside quotes and CRLF / CR / LF are read; completely empty rows are dropped. A row keeps the line
  number of the FILE as its `sourceRef`, and its own cells as `raw`;
- **year-first dates**: a cell that is exactly `1990-04-12` (or `1990-04-12T00:00:00`) is handed
  over day first, so the French birthday reader cannot swap day and month.

The rows then enter the SAME table reader as a tabular paste (`parseClientImportTable`): header
mapping, name split, phone / email / birthday extraction and every issue above are shared rules.

Headers (accent-, case- and underscore-insensitive): `Prénom` / `First name`; `Nom` /
`Last name` / `Surname`; `Nom complet` / `Client` / `Name` / `Full name`; `Téléphone` /
`Tél` / `Portable` / `Mobile` / `Phone`; `Email` / `E-mail` / `Mail` / `Courriel`;
`Anniversaire` / `Date de naissance` / `DDN` / `Birthday` / `Date of birth`. Any other column
is ignored as a whole and listed once. No software-specific mapping (Planity, Fresha…) exists.

Without a header row, a file row is read cell by cell with the line rules above — two cells never
merge into one number or one date. A name spread over several cells has an unknown column order
(`Prénom;Nom` or `Nom;Prénom`): it is kept as read and flagged `AMBIGUOUS_NAME_SPLIT`. An
unlabelled date stays `AMBIGUOUS_BIRTHDAY` under the paste rule. Nothing is inferred beyond that.

The file itself is picked and read by `src/shared/lib/file-acquisition.ts` (the system picker of
`expo-file-system`; at most 10 MB; the temporary copy iOS hands over is removed once read). The
reader returns bytes and never writes anything: the screen stages the candidates exactly like a
paste.

### Email

ONE rule for manual creation and import: `isValidClientEmail` (`src/domain/clients/email.ts`);
the Client form delegates to it. Comparison key: trimmed + lowercased. The stored email is the
value as written (trimmed).

### Phone comparison

`clientImportPhoneKey` (`src/domain/clients/import/phone-key.ts`) derives comparison keys only:

- `canonical`: the communications rule `normalizeCommunicationPhoneE164` (unchanged), after an
  import-only cleanup of `(0)`, a trunk `0` after `+33` and a bare `33` country code;
- `lastNine`: the last nine digits — a weak fallback.

The stored Client phone stays the raw trimmed value. No `phone_e164` exists anywhere.

### Classification (never stored, recomputed after every edit)

Inputs: the candidate, the existing Clients (active AND archived), the earlier non-invalid
candidates of the same batch.

```text
INVALID             a blocking issue
EXACT_DUPLICATE     same canonical phone, or same email key
POSSIBLE_DUPLICATE  phone matches one record while email matches another
                    same last nine digits where canonical forms cannot decide
                    same first + last name (accent-, case-, separator-insensitive)
NEW                 nothing matches
```

A first name alone never makes a duplicate. An archived match is named as such. Nothing is ever
merged: no field of an existing Client is filled or changed by an import.

### Review and confirmation

```text
NEW                 selected by default (can be unticked)
POSSIBLE_DUPLICATE  skipped by default — « Importer quand même » opts in
EXACT_DUPLICATE     skipped, inspectable, never imported
INVALID             not selectable until corrected
```

A correction edits staging only (the review drawer never writes); it marks the candidate reviewed
(its extraction issues are dropped) and re-runs validation, classification and eligibility. The
confirmation re-classifies the batch against the Clients stored at that moment; a changed
selection refreshes the review instead of importing. Ids are created at confirmation
(`createClientId`), then the Clients are written in chunks (`docs/architecture/PERSISTENCE.md`
§7h).

### Privacy

The pasted text, the bytes of a picked CSV file and the candidates stay in the import screen's
memory: never persisted (no SQLite, no AsyncStorage draft), never logged, never sent to any API, no
AI. Leaving the screen forgets them. `import-privacy.test.ts` guards the pipeline sources.

---

## 4. Relationships

Appointments reference clients through `clientId` only.

Client display names are always resolved from the Client source at render
time; they are never duplicated into the Appointment model or its session
entries. Editing a Client's identity never rewrites any Appointment — the
relationship and resolution both go through the stable id.

---

## 5. BeautIzzy-Generated History

A Client's appointment history contains only Appointments created in BeautIzzy:

```text
appointment.clientId === client.id
```

Historical terminal outcomes (`CANCELLED`, `NO_SHOW`) remain part of history.

Cancellation history distinguishes the recorded actor:

```text
CLIENT   → Annulé par le client
BUSINESS → Annulé par vous
```

Both remain historical records. Only explicit permanent Appointment deletion removes a row from Client history.

History is sorted by appointment date, newest first, and never mutated.

---

## 6. Derived Client Activity

The following values are DERIVED from BeautIzzy Appointment state and are never
persisted on the Client:

```text
Rendez-vous réalisés  → appointments with status COMPLETED
Annulations           → appointments with status CANCELLED
                        and cancellation.cancelledBy === CLIENT
Absences              → appointments with status NO_SHOW
Total dépensé         → everything the Client spent, whole history:
                        value of COMPLETED appointments (services net of
                        the discount + products sold during them)
                        + paid standalone Sales of the Client
```

`Total dépensé` reads the ONE Client spending rule, `getClientTotalSpentCents`
(`src/domain/clients/spending.ts`), over the whole BeautIzzy history:

- **COMPLETED Appointments** — `getAppointmentExpectedTotal`
  (`docs/domain/APPOINTMENTS.md` §25b): gross AppointmentItem snapshot prices minus the
  Appointment discount (§15.3), plus the Sales sold during the Appointment (« Revente »).
  The discount applies to the services only. SCHEDULED, CONFIRMED, IN_PROGRESS,
  CANCELLED and NO_SHOW Appointments count nothing, and neither do the products sold
  during them.
- **Paid standalone Sales** — a Sale with this `clientId`, no `appointmentId` and a
  recorded `payment`: its snapshot total (unit price × quantity).

Each amount counts once. A Sale sold during an Appointment counts ONLY through that
Appointment, whose checkout paid it; it is never added again as a Sale. A Sale without a
Client belongs to no Client. A standalone Sale without a recorded payment (historical,
created before payment tracking) is not counted, exactly as the Caisse ignores it:
BeautIzzy never invents a payment for it, although it stays listed in `Produits achetés`.
A deposit is a way of paying an Appointment and never adds to the total. Snapshots only —
never current catalog prices.

« Tops & tendances » ranks « Clients qui dépensent le plus » with the SAME rule
(`getAppointmentClientSpendingCents`, `getSaleClientSpendingCents`), scoped to one
civil period (`docs/domain/INSIGHTS.md` §3). The profile total is a lifetime amount, so
the two numbers differ whenever the Client also spent outside the browsed period — and
only for that reason.

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
Appointment creation — Client step
Appointment editing  — Modifier le client
Sale creation        — Choisir / Modifier le client
```

An archived Client is never offered there, never preselected from a stale
route parameter, and never silently restored because an action was
attempted. Existing references keep resolving everywhere (`clientId` →
Client), so Agenda blocks, Appointment Details, Appointment history, and
`Produits achetés` still show the archived Client's identity. Her profile
stays reachable from the directory (`Archivés` tab) and from history.

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

Before/after photos, technical formulas, and statistics are separate future
features and remain outside the Client domain (the Client portrait of §2,
`photoPath`, is implemented). The birthday experience of §2 is
implemented; advance birthday reminders, automatic birthday discounts and
marketing automation remain future features built on the existing `birthday`
field.

Purchased-product history derives from the Sale domain through
`sale.clientId` (`docs/domain/SALES.md`) — it is never stored on the Client.
It changes no visit count; a paid Sale adds to `Total dépensé` as described above.
