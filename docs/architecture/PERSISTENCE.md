# Souris — Local Persistence

## 1. Purpose

Souris survives app termination and restart. Every canonical business record lives in one local
SQLite database owned by the app; feature providers hydrate from it at launch and write through it
on every mutation.

Scope of Local Persistence V1:

```text
Clients
Services (with ordered phases)
Appointments (with ordered item snapshots and ordered phases)
Products (with a durable image file reference)
Sales (with item snapshots)
Calendar Blocks (personal unavailability — schema v11)
```

Since Account & Onboarding V1 the database also holds the **local account binding** (schema v3,
§3/§4b): which Business — and which owning Auth user — this device's data belongs to.

Since Cloud Sync V1B the database also holds the **local sync bookkeeping** (schema v7, §3/§7c):
the outbox of aggregates whose current local state must reach the remote, and the remote revision
last acknowledged per aggregate.

Since Cloud Sync V1C-0 every persisted **monetary value is an integer number of cents** (schema v8,
§3/§4): the four euro `REAL` price columns were converted in place and dropped, so the local rows
carry exactly the representation the remote schema uses. New top-level records (Client, Service,
Appointment, Product, Sale) receive a **UUID v4** id (`src/shared/lib/uuid.ts`); existing ids are
never rewritten.

Explicit non-goals: cloud backup of operational data, conflict resolution, multi-device sync,
network sync engine. Authentication and the Business profile live in Supabase
(`docs/architecture/AUTH.md`); operational data stays local-first only. The remote operational
schema and the sync contract that will connect this database to Supabase are defined in
`docs/architecture/CLOUD_SYNC.md` (V1A remote schema, V1B local outbox, V1C-0 local
prerequisites; no runtime transfer yet).

---

## 2. Technology and Ownership

```text
expo-sqlite         canonical business data     (src/persistence)
expo-file-system    durable Product image files (src/persistence/files + product-image-storage)
```

There is ONE database file, `souris.db`, opened once by the application root (`src/app/_layout.tsx`)
through `openSourisDatabase()`. Connection settings: WAL journal mode, foreign keys ON.

`src/persistence` is plain TypeScript. It depends on `src/domain` types only — never on React,
Expo Router, features, or screens. Its public surface:

```text
database.ts          SourisDatabase — the synchronous SQL boundary every module writes against
expo-database.ts     expo-sqlite binding (application root only)
schema.ts            migrations[] — schema v1 SQL, v2 (clients.archived_at), v3 (business_profile),
                     v4 (clients.birthday), v5 (sales.appointment_id, appointment checkout columns),
                     v6 (sales payment columns), v7 (sync_outbox, sync_state),
                     v8 (price_cents / unit_price_cents replace the euro REAL price columns),
                     v9 (clients.notes),
                     v10 (appointments.discount_percent, appointments.discount_amount_cents),
                     v11 (calendar_blocks; sync_outbox / sync_state rebuilt for the CALENDAR_BLOCK type),
                     SOURIS_TABLES, BUSINESS_SCOPED_TABLES, SYNC_TABLES
migrations.ts        migrateDatabase(): PRAGMA user_version runner
metadata.ts          souris_metadata key/value (seed marker)
seed.ts              FirstRunSeed contract + seedDatabaseIfNeeded()
bootstrap.ts         migrate → seed → load PersistedSnapshot
development-reset.ts clearPersistedDataForDevelopment() (__DEV__ only)
stores/*.ts          load / insert / update / delete per entity, with row ↔ domain mappers;
                     every mutation marks its aggregate in the sync outbox (§7c)
sync/                aggregate vocabulary + bound Business id, sync_outbox, sync_state (§7c)
files/               LocalFiles boundary + expo-file-system binding
testing/             node:sqlite database, in-memory files, fixtures (tests only)
```

No ORM, no repository/factory abstractions. SQL lives only in `src/persistence/stores` and
`src/persistence/sync`. Screens and components never see SQL, rows, or the database.

The synchronous expo-sqlite API is used deliberately: mutations remain synchronous provider calls
(validate → write → set state), the dataset is small and local, and the existing screen contracts
stay intact. Product saves are the one asynchronous path because the durable image copy is async.

---

## 3. Schema (v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 + v10 + v11)

Canonical string ids are primary keys everywhere; SQLite never assigns identities. Since Cloud
Sync V1C-0 a NEW top-level id is a UUID v4 generated on the device (`src/shared/lib/uuid.ts`,
through each feature's `runtime-ids.ts`); ids created before that (`<prefix>-<ms>-<n>`,
deterministic legacy ids, fixtures) stay exactly as stored — the column type is TEXT and nothing
distinguishes the two shapes. Nested child ids (phases, items, sale lines) keep deriving from
their parent id and are unique inside that parent only (CLOUD_SYNC.md §5).

```text
souris_metadata     key PK, value                                   seed marker and future flags

clients             id PK, first_name, last_name?, phone?, email?, birth_date? (legacy, ≤ v3),
                    archived_at? (v2), birthday? (v4, MM-DD), notes? (v9)
services            id PK, business_id, name, type, price_cents (v8, CHECK >= 0), active
service_phases      (service_id FK→services CASCADE, position) PK, id, name, duration_minutes, requires_staff
appointments        id PK, business_id, client_id, staff_member_id, start_at, status, notes?,
                    cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?,
                    paid_at? (v5), card_amount_cents? (v5, CHECK >= 0), cash_amount_cents? (v5, CHECK >= 0),
                    discount_percent? (v10, CHECK 1–50), discount_amount_cents? (v10, CHECK >= 1,
                    never together with discount_percent)
appointment_items   (appointment_id FK→appointments CASCADE, id) PK, item_order, service_id,
                    service_option_id?, service_name, service_type, price_cents (v8, CHECK >= 0)
appointment_phases  (appointment_id, appointment_item_id, position) PK
                    FK→appointment_items CASCADE, id, name, duration_minutes, requires_staff
products            id PK, business_id, name, brand?, category?, barcode?, image_uri?,
                    price_cents (v8, CHECK >= 0), stock_quantity (CHECK >= 0), active
sales               id PK, business_id, client_id?, appointment_id? (v5), completed_at,
                    paid_at? (v6), card_amount_cents? (v6, CHECK >= 0), cash_amount_cents? (v6, CHECK >= 0)
sale_items          (sale_id FK→sales CASCADE, id) PK, position, product_id, product_name,
                    unit_price_cents (v8, CHECK >= 0), quantity (CHECK >= 1)
calendar_blocks     id PK, business_id, staff_member_id, start_at, end_at (CHECK end_at > start_at),
                    reason (CHECK non-blank)                                               (v11)
business_profile    singleton PK (CHECK = 1), id, owner_user_id, owner_first_name,
                    owner_last_name?, name, activity_type, phone?, created_at, updated_at   (v3)
sync_outbox         id PK AUTOINCREMENT, business_id, aggregate_type (CHECK vocabulary), aggregate_id,
                    operation (CHECK UPSERT|DELETE), revision (CHECK >= 1), created_at, updated_at,
                    attempt_count (CHECK >= 0), last_error?, next_attempt_at?,
                    UNIQUE (business_id, aggregate_type, aggregate_id)                       (v7)
sync_state          (business_id, aggregate_type, aggregate_id) PK, remote_version (CHECK >= 1),
                    last_synced_at                                                          (v7)
```

`business_profile` holds at most ONE row (the `singleton` primary key): the device's account
binding. It never stores tokens or the owner's email.

`sync_outbox` and `sync_state` are local sync bookkeeping (§7c, CLOUD_SYNC.md §10): they hold
aggregate identities and revisions only, never business data, are not part of the hydrated
snapshot, and are never uploaded.

Indexes: `appointments(start_at)`, `appointments(client_id)`, `sales(client_id)`,
`sales(appointment_id)` (v5), `calendar_blocks(start_at)` and
`calendar_blocks(business_id, staff_member_id, start_at)` (v11).

`calendar_blocks` deliberately has no client, price, payment, discount or status column: a Calendar
Block is calendar availability only (`docs/domain/CALENDAR_BLOCKS.md`), and no financial or Client
query ever reads this table. Like every aggregate it carries no sync column — revisions and deletions
live in `sync_outbox` / `sync_state`, and a local deletion removes the row.

### Value representation

```text
booleans        INTEGER 0/1                       (values.ts: toSqlBoolean / fromSqlBoolean)
instants        ISO-8601 UTC TEXT                 startAt, cancelledAt, recordedAt, completedAt,
                                                  archivedAt (NULL = active Client)
                                                  restored as Date; local calendar behavior
                                                  is unchanged because the instant is exact
birthday        civil MM-DD TEXT                  day + month only — parsed into the domain
                                                  `{ month, day }` pair on load, NEVER a Date,
                                                  a timestamp or a year (legacy `birth_date`
                                                  is retained but neither read nor written)
optionals       NULL ↔ absent property            never empty strings, never null in domain values
prices          INTEGER cents (v8)                services.price_cents, products.price_cents,
                                                  appointment_items.price_cents, sale_items.unit_price_cents:
                                                  exact non-negative integer cents (CHECK >= 0). The
                                                  domain keeps its euro-number contract (`price`,
                                                  `unitPrice`); values.ts `toSqlPriceCents` (the domain
                                                  `eurosToCents` rounding rule) / `fromSqlPriceCents`
                                                  (integer ÷ 100, exact at two decimals) are the ONLY
                                                  conversion, so a stored value round-trips unchanged
checkout cents  INTEGER                           card_amount_cents / cash_amount_cents (appointments
                                                  and sales) are exact integer cents; NULL with
                                                  paid_at NULL means "no payment recorded" and
                                                  hydrates to no payment (values.ts:
                                                  toSqlPaymentColumns / fromSqlPaymentColumns)
barcode         TEXT                              leading zeroes preserved
```

Row mappers are the only place these conversions happen. Domain values never carry SQLite nulls,
0/1 booleans, or raw timestamp strings.

### Snapshot foreign-key philosophy

Appointment items/phases and Sale items are historical snapshots. `service_id` and `product_id`
are plain reference metadata with NO foreign key to the catalog tables:

- deleting a Service never deletes or rewrites an `appointment_items` row;
- deleting a Product never deletes or rewrites a `sale_items` row.

Nested rows DO cascade from their owner: deleting an Appointment removes its items and phases;
deleting a Service removes its catalog phases; deleting a Sale (not exposed today) would remove its
items. Orphans are impossible.

`sales.appointment_id` (v5) is a plain reference as well: NO foreign key and NO cascade, so deleting
an Appointment can never delete or rewrite a Sale; instead the Appointment deletion guard (§7b)
refuses the deletion while a Sale references it.

`client_id` is a plain reference as well, with no foreign key and no cascade. Client removal is
governed by the lifecycle: archiving only sets `clients.archived_at`, and permanent deletion is
refused by the store while any `appointments.client_id` or `sales.client_id` row references the
Client (§7a). A Client row therefore never disappears from under its history.

---

## 4. Schema Versioning and Migrations

`PRAGMA user_version` records the installed schema version. `schema.ts` lists forward-only
migrations; `migrateDatabase()` applies every migration above the installed version, each in its
own transaction together with the version bump. Re-running is a no-op. A database newer than the
build is refused with an error — never wiped.

Adding a schema change = appending a new `{ version, up }` entry. Applied migrations are never
edited. Nothing ever drops tables on mismatch.

Schema version and seed version are different concepts (see §5).

### Schema v11 — Calendar Blocks

```text
CREATE TABLE calendar_blocks (id TEXT PRIMARY KEY, business_id, staff_member_id, start_at, end_at,
                              reason CHECK (length(trim(reason)) > 0), CHECK (end_at > start_at));
CREATE INDEX idx_calendar_blocks_start_at …;  CREATE INDEX idx_calendar_blocks_business_staff_start_at …;

sync_outbox, sync_state   REBUILT — aggregate_type CHECK gains 'CALENDAR_BLOCK'
souris_metadata           DELETE key 'sync_pull_cursor'
```

Three things, in ONE transaction with the version bump:

1. **A new, empty table.** Nothing is backfilled. Both CHECKs mirror the domain (`createCalendarBlock`);
   the instants are fixed-width ISO-8601 UTC text, so `end_at > start_at` IS chronological order.
2. **The two sync bookkeeping tables are rebuilt.** SQLite cannot alter a CHECK constraint, and the
   `aggregate_type` vocabulary of both tables is CHECKed. The migration uses the documented SQLite copy
   procedure — create `…_v11` with the new CHECK, `INSERT … SELECT` every row with every column
   unchanged, `DROP` the old table, `RENAME` the new one. It is NOT a wipe: pending intents keep their
   `id` (FIFO position), `revision`, `attempt_count`, `last_error` and `next_attempt_at`; every
   acknowledged `remote_version` and `last_synced_at` is preserved; and the `AUTOINCREMENT` high-water
   mark of `sync_outbox` is carried over through `sqlite_sequence`, so an outbox id is still never
   handed out twice even when the highest ids were already settled. These tables hold bookkeeping only
   — no operational row is read or written. This is the one non-`ALTER` migration of the project, and
   the reason is structural, not a shortcut.
3. **The pull cursor is cleared.** A build that predates Calendar Blocks ignores the `calendar_blocks`
   family of a pull and still advances its cursor; blocks created on another device meanwhile would sit
   BEFORE the cursor forever. Without a cursor the first run after the upgrade reads the complete
   dataset once — known revisions are skipped at one comparison each — and those blocks arrive
   (`CLOUD_SYNC.md` §20). No other metadata key is touched.

An existing v10 database goes `v10 → v11` with every Client, Service, Appointment, item, phase,
Product, Sale and the account binding byte-identical (`rowid` included), no wipe, no reseed
(`seed_version` stays), and NOTHING written to the outbox (no aggregate changed). Re-running is a
no-op. Covered by `calendar-blocks-migration.test.ts` — a genuine schema-v10 fixture on a bound device
(paid history, a discount, a note, a FAILED outbox entry with its backoff, settled ids above the
remaining one, acknowledged versions including a tombstone, a pull cursor, a bootstrap decision):
version, untouched raw operational rows, identical expected totals and Cash Register, identical outbox
and state rows, the sequence (`next id = 6`, never 5 again), a never-started sequence, the constraints
and the unique key of both rebuilt tables, no `_v11` leftover, the cleared cursor (and only it),
idempotence, and the table CHECKs. The remote counterpart is
`supabase/migrations/20260923120000_create_calendar_blocks.sql`.

### Schema v10 — Appointment discount

```text
ALTER TABLE appointments ADD COLUMN discount_percent INTEGER
  CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 50);
ALTER TABLE appointments ADD COLUMN discount_amount_cents INTEGER
  CHECK (discount_amount_cents IS NULL OR (discount_amount_cents >= 1 AND discount_percent IS NULL));
```

Purely additive: two nullable integer columns, no default, no backfill. At most ONE is set — a whole
percentage (1–50, the same bound as the domain, the Supabase CHECK and the sync validation), or a fixed amount in integer cents (`docs/domain/APPOINTMENTS.md` §15.3); both NULL is
"no discount". An existing v9 database goes `v9 → v10` in one transaction; every Appointment keeps its
row, `rowid` order, id, status, payment, items and phases byte for byte and simply has no discount —
no wipe, no reseed (`seed_version` stays), no table recreated. The migration writes NOTHING to
`sync_outbox` or `sync_state`: no Appointment changed, so nothing is re-pushed.

No discounted total is stored. `appointment_items.price_cents` is never touched by a discount; gross,
applied discount and net stay derived by the domain (`getAppointmentServicesTotal`), so existing
Appointments keep exactly their financial results.

The store maps the pair to `appointment.discount` (`PERCENT` / `FIXED` / absent) and refuses an
invalid discount before any SQL runs. `insertAppointment` / `updateAppointment` write the pair with the
rest of the row; `updateAppointmentDiscount` sets, changes or clears it in ONE transaction guarded by
the stored status (`SCHEDULED` / `CONFIRMED` / `IN_PROGRESS`) — a terminal Appointment raises
`AppointmentDiscountConflictError` and nothing is written. Every discount write marks the
`APPOINTMENT` aggregate in the outbox inside the same transaction; there is no separate discount sync.

Covered by `appointment-discount-migration.test.ts` — a genuine schema-v9 fixture (an upcoming and a
paid Appointment with items and phases, an acknowledged `sync_state` row and a pending `sync_outbox`
entry): version, untouched raw rows, untouched sync bookkeeping, untouched definitions of every other
table, unchanged expected totals and Cash Register, the CHECKs — and by
`appointment-discount-store.test.ts` (percentage, fixed, switch, clear, restart, outbox, terminal
refusal, catalog price change). The remote counterpart is
`supabase/migrations/20260922120000_add_appointment_discount.sql` (`CLOUD_SYNC.md` §19).

### Schema v9 — Client notes

```text
ALTER TABLE clients ADD COLUMN notes TEXT;
```

Purely additive: one nullable column, no default, no backfill. An existing v8 database goes
`v8 → v9` in one transaction; every Client keeps its row, `rowid` order, id, birthday and
lifecycle byte for byte and simply has `notes = NULL` ("no note") — no wipe, no reseed
(`seed_version` stays), no table recreated. The migration writes NOTHING to `sync_outbox` or
`sync_state`: no Client changed, so nothing is re-pushed. The store keeps the normalized domain
text (`normalizeClientNotes`: edges trimmed, internal line breaks preserved) and never stores a
blank note — whitespace resolves to NULL, and clearing a note writes NULL. Covered by
`client-notes-migration.test.ts`, which builds a genuine schema-v8 fixture (Clients with and
without birthday, an archived Client, an acknowledged `sync_state` row and a pending
`sync_outbox` entry), migrates, and asserts version, untouched raw rows, untouched sync
bookkeeping, untouched definitions of every other table, and hydrated Clients without any
invented `notes` key. The remote counterpart is
`supabase/migrations/20260921120000_add_client_notes.sql` (`CLOUD_SYNC.md` §18).

### Schema v8 — monetary values as integer cents (Cloud Sync V1C-0)

```text
ALTER TABLE services          ADD COLUMN price_cents      INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0);
UPDATE      services          SET price_cents = CAST(ROUND(price * 100) AS INTEGER);
ALTER TABLE services          DROP COLUMN price;
-- identical block for appointment_items.price → price_cents, products.price → price_cents,
-- and sale_items.unit_price → unit_price_cents
```

An existing v7 database goes `v7 → v8` in one transaction: per table, the cents column is added,
every existing row is converted with `ROUND(value * 100)` — never a truncating cast, so
`12.50 → 1250`, `0.99 → 99`, `0.29 → 29`, `1234.56 → 123456` — and the legacy euro `REAL` column
is dropped, so no runtime SQL can still read or write it. SQLite rewrites the rows in place: every
id, the `rowid` order the stores read by, item order and phase positions, foreign keys and
cascades, snapshots, the checkout / Sale payment cents, the account binding, the seed marker and
the `sync_outbox` / `sync_state` rows are untouched. No wipe, no reseed, no row deleted or
duplicated. Re-running is a no-op. `DROP COLUMN` needs SQLite ≥ 3.35; expo-sqlite bundles 3.50.
Covered by `money-migration.test.ts`, which builds a genuine schema-v7 fixture database on a BOUND
device with representative decimal prices in all four tables, a checked-out Appointment, a linked
and a paid standalone Sale and pending sync rows, migrates through the normal bootstrap, and
asserts version, exact integer cents (`typeof = integer`), dropped legacy columns, NOT NULL and
CHECK constraints, unchanged ids / rowid order / relationships / payment columns / sync rows, the
hydrated euro values, identical expected-total and Cash Register results, idempotence, and integer
cents for writes made after the upgrade.

The domain and every provider / screen keep the euro-number contract (`Service.price`,
`Product.price`, `AppointmentItem.price`, `SaleItem.unitPrice`); only the row mappers convert
(§3, value representation). Checkout and Cash Register amounts were already integer cents and are
untouched.

### Schema v7 — local sync outbox and acknowledged revisions (Cloud Sync V1B)

```text
CREATE TABLE sync_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id, aggregate_type, aggregate_id,
                          operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at,
                          UNIQUE (business_id, aggregate_type, aggregate_id));
CREATE TABLE sync_state  (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at,
                          PRIMARY KEY (business_id, aggregate_type, aggregate_id));
```

An existing v6 database goes `v6 → v7` in one transaction: the two tables are created EMPTY. No
business row is read or rewritten, no wipe, no reseed (`seed_version` stays), the account binding is
untouched. Existing aggregates receive neither an outbox entry (pre-existing data is handled by the
V1C bootstrap decision, CLOUD_SYNC.md §11) nor a fabricated `remote_version`. Re-running is a no-op.
Covered by a test that builds a genuine schema-v6 fixture database on a BOUND device (Client,
Services, Products, Appointment, linked Sale, `business_profile`), migrates through the normal
bootstrap, and asserts version, unchanged snapshot, empty sync tables, kept binding and seed marker,
idempotence, and that the first mutation after the upgrade records exactly one scoped outbox entry.

### Schema v6 — standalone Sale payment

```text
ALTER TABLE sales ADD COLUMN paid_at TEXT;
ALTER TABLE sales ADD COLUMN card_amount_cents INTEGER CHECK (card_amount_cents IS NULL OR card_amount_cents >= 0);
ALTER TABLE sales ADD COLUMN cash_amount_cents INTEGER CHECK (cash_amount_cents IS NULL OR cash_amount_cents >= 0);
```

An existing v5 database goes `v5 → v6` in one transaction: every Sale keeps its row with the three
payment columns NULL — historical and Appointment-linked Sales therefore hydrate with
`payment = undefined`; no payment method is ever fabricated. No wipe, no reseed, no duplicate.
Re-running is a no-op. Covered by a test that builds a genuine schema-v5 fixture database (a
standalone and an Appointment-linked Sale), migrates, and asserts version, rows, NULL columns,
hydrated values, idempotence, then a paid standalone Sale on the migrated database. Only a
standalone Sale (`appointment_id IS NULL`) may carry a payment (domain rule, §8).

### Schema v5 — Sale ↔ Appointment link and Appointment checkout

```text
ALTER TABLE sales ADD COLUMN appointment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_appointment_id ON sales(appointment_id);
ALTER TABLE appointments ADD COLUMN paid_at TEXT;
ALTER TABLE appointments ADD COLUMN card_amount_cents INTEGER CHECK (card_amount_cents IS NULL OR card_amount_cents >= 0);
ALTER TABLE appointments ADD COLUMN cash_amount_cents INTEGER CHECK (cash_amount_cents IS NULL OR cash_amount_cents >= 0);
```

An existing v4 database goes `v4 → v5` in one transaction: every Sale keeps its row with
`appointment_id = NULL` (standalone), every Appointment keeps its row with the three payment columns
NULL — including every historical `COMPLETED` Appointment, which therefore hydrates with
`payment = undefined` and never appears in the Cash Register. No wipe, no reseed (`seed_version`
stays), no duplicate. Re-running is a no-op. Covered by a test that builds a genuine schema-v4
fixture database (a SCHEDULED and a COMPLETED Appointment, one standalone Sale), migrates, and
asserts version, rows, NULL columns, hydrated values, idempotence, then a checkout and a linked
Sale on the migrated database.

These local fields (`sales.appointment_id`, `appointments.paid_at / card_amount_cents /
cash_amount_cents`, and since v6 `sales.paid_at / card_amount_cents / cash_amount_cents`) are
mirrored one-to-one by the remote `appointments` / `sales` tables of Cloud Sync V1A
(`docs/architecture/CLOUD_SYNC.md` §3); nothing writes them remotely yet.

### Schema v4 — Client birthday as day + month

```text
ALTER TABLE clients ADD COLUMN birthday TEXT;
UPDATE clients SET birthday = substr(birth_date, 6, 5)
WHERE birth_date IS NOT NULL AND birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
```

An existing v3 database goes `v3 → v4` in one transaction: every Client keeps its row, the
month + day of every well-formed historical `birth_date` is copied into `birthday` (`MM-DD`),
the year is dropped, and no other row is touched — no wipe, no reseed (`seed_version` stays),
no Client loss. The legacy `birth_date` column is retained untouched for backward
compatibility but is no longer read or written: the hydrated Client never pretends the
historical year was meaningful (`docs/domain/CLIENTS.md` §2). Malformed legacy values leave
`birthday` NULL. Re-running is a no-op. Covered by a test that builds a genuine schema-v3
fixture database with full `birth_date` values (including a `02-29`), an archived Client and an
Appointment, migrates, and asserts version, rows, keys, the untouched legacy column, and the
hydrated day + month values.

### Schema v3 — local account binding

```text
CREATE TABLE business_profile (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), …)
```

An existing v2 database goes `v2 → v3` in one transaction: the table is created empty; no row of
any other table is touched, no reseed, no wipe. The device stays **unbound** until the owner
completes (or reconnects to) Business setup. Re-running is a no-op. Covered by a test that builds a
genuine schema-v2 fixture database with Clients, Services, Appointments, Products, and a Sale.

### 4b. Account binding

`src/persistence/stores/business-profile.ts` — `bindLocalDatabaseToBusiness(db, profile)`:

```text
BEGIN
  business_profile present with another owner or Business  ⇒ ALREADY_BOUND_TO_OTHER_ACCOUNT, ROLLBACK
  distinct business_id across services / appointments / products / sales
    (BUSINESS_SCOPED_TABLES), excluding profile.id
    more than one                                             ⇒ MULTIPLE_LOCAL_BUSINESS_IDS, ROLLBACK
    exactly one   ⇒ UPDATE <table> SET business_id = profile.id WHERE business_id = <that id>
  upsert the single business_profile row
COMMIT
```

Only the business ownership column changes: Client / Appointment / Service / Product / Sale ids,
snapshots, and relationships are exactly preserved (verified by comparing the full snapshot before
and after). `clients` carries no `business_id` and is never rewritten. A failure anywhere leaves the
database unchanged (rollback test with a failing `UPDATE sales`). Re-binding the same owner and
Business only refreshes the cached profile. `readBusinessProfile(db)` restores the binding on every
launch. The development reset keeps the row (it is not in `SOURIS_TABLES`).

### Schema v2 — Client lifecycle

```text
ALTER TABLE clients ADD COLUMN archived_at TEXT;
```

The first forward migration applied to devices that already run Persistence V1. An existing
database goes `v1 → v2` in one transaction: every persisted Client keeps its row and gets
`archived_at = NULL` (active). No wipe, no reseed (`seed_version` is already present), no
duplicated legacy record; Appointments and Sales are untouched. Re-running is a no-op. The
migration is covered by a test that builds a genuine schema-v1 fixture database, inserts rows
with the v1 column set, migrates, and asserts version, rows, and NULL lifecycle.

---

## 5. First-Run Seed Lifecycle

```text
first launch:  empty database
               → migrate to the current schema (v8)
               → seed_version absent → run the production seed ONCE, in one transaction
                   Clients / Services / Products / Appointments / Sales = []   (EMPTY)
               → write souris_metadata.seed_version = 1
               → load snapshot

next launches: migrate (no-op) → seed_version present → skip seed → load snapshot
```

Since Account & Onboarding V1 the production first-run seed is **empty**: a fresh real install
starts with no pilot Clients, Services, Products, Appointments, or Sales, and shows the intentional
empty states. The pilot catalogs are business-specific data of the first professional; they were
never meant to become universal customer data. The development address book is SYNTHETIC
(`src/features/clients/data/synthetic-legacy-clients.ts`): a real client address book is personal
data and is never tracked in the repository.

Existing installs are untouched: their `seed_version` marker is already present, so the seed is
never consulted again and the pilot data they already hold stays exactly as it is.

The seed marker — not row counts — decides. A professional who deletes every record is NOT
re-seeded.

The legacy data and the development fixtures (the `client-agenda-*` clients and the relative-day
Agenda Appointments) live in `src/providers/development-seed.ts`, stamped with a `businessId`. They
reach a database only through the `__DEV__` reset (§10) or `TestPersistenceProvider` — never
through the production first-run path.

---

## 6. Bootstrap and Provider Hydration

`PersistenceProvider` (`src/providers/PersistenceProvider.tsx`) is the single application
bootstrap state:

```text
initializing → open database → migrate → seed if needed → load snapshot → ready
                                                                        ↘ failed (retry screen)
```

Opening the database file happens INSIDE this boundary (`openDatabase` prop, bound to
`openSourisDatabase` by the root layout), so an open failure, a migration failure, a seed
failure, and a hydration failure all land in the same recoverable state — nothing throws during
React render. "Réessayer" performs a fresh controlled bootstrap: the previous connection is
closed and a new one opened. While initializing it renders nothing, and the root layout keeps
the native splash screen up until fonts AND persistence are settled — no frame ever shows empty
or legacy data.

Once ready, the five feature providers read `usePersistence()`:

```text
SQLite snapshot ──► ClientSessionProvider / ServiceCatalogProvider / ProductCatalogProvider /
                    SaleSessionProvider / AppointmentSessionProvider ──► existing screens
```

Provider public APIs are unchanged except:

- `ProductCatalogProvider.addProduct` / `updateProduct` return a Promise (image promotion);
- `decrementProductStock` became `applyCommittedStockDecrements` (memory-only reflection of a
  decrement already committed by Sale completion).

Derived values (activity, totals, purchase history, Agenda layout, search, drafts, UI state) are
never persisted; they are recomputed from the hydrated source entities.

**Re-hydration (Cloud Sync V1D).** Providers hydrate once, and until V1D every operational write
came from a provider, so memory and SQLite could not diverge. A new-device restore or an applied pull
writes operational rows BELOW the providers (§7e). `PersistenceValue.reloadSnapshot()` closes that
gap: it reloads the snapshot from the open database and bumps the provider generation, remounting
the feature providers on the fresh state — the development reset's mechanism, without touching a
row. Its ONLY caller is `CloudSyncRunner`, after a run for which `didSyncRunChangeLocalData` is true
(`RESTORED`, or a pull that applied or removed at least one aggregate); a push-only run never
remounts anything. A load failure lands in the same recoverable `failed` state as any bootstrap
failure. Known limit: the remount resets navigation and open drafts (CLOUD_SYNC.md §16.8).

---

## 7. Mutation Discipline

Every provider mutation follows:

```text
validate (domain) → SQLite write (transaction when multi-row) → update React state
```

State changes only after the write succeeds. A database failure throws before any state change;
screens report it through one concise alert (`alertPersistenceFailure`) and leave the form as-is.
There is no optimistic update and no global error framework.

Transaction boundaries (`runInTransaction` joins an enclosing transaction instead of nesting).
Since Cloud Sync V1B every boundary below that changes syncable data ALSO writes its aggregate's
outbox entry inside the same transaction (§7c):

```text
Client create/edit            row (edit never touches archived_at)              + CLIENT UPSERT
Client archive/restore        archived_at                                        + CLIENT UPSERT
Client permanent deletion     reference counts + DELETE (§7a)                    + CLIENT DELETE
Service create/edit           service row + full phase-list replacement          + SERVICE UPSERT
Service activation            active                                             + SERVICE UPSERT
Service deletion              DELETE (phases cascade)                            + SERVICE DELETE
Appointment create            appointment + items + phases (snapshot only)       + APPOINTMENT UPSERT
Appointment edit              metadata + full item/phase replacement             + APPOINTMENT UPSERT
Appointment timing            editability re-check + phase durations of one item + APPOINTMENT UPSERT
Appointment item reorder      editability re-check + item_order by stable id     + APPOINTMENT UPSERT
Appointment item removal      editability + last-item re-check + rows + order    + APPOINTMENT UPSERT
Appointment checkout/payment  status + payment columns (§7b)                     + APPOINTMENT UPSERT
Appointment delete            references re-check + DELETE (cascade) (§7b)       + APPOINTMENT DELETE
Appointment reconciliation    every previous-day finalization in one transaction + APPOINTMENT UPSERT each
Product create/edit           row, after the durable image copy                  + PRODUCT UPSERT
Product stock/activation      one column                                         + PRODUCT UPSERT
Product deletion              DELETE                                             + PRODUCT DELETE
Calendar Block create/edit    domain validation (§7f) + row                      + CALENDAR_BLOCK UPSERT
Calendar Block deletion       DELETE (nothing references a block)                + CALENDAR_BLOCK DELETE
Sale completion               stock revalidation + decrements + sale + items (§8) + SALE UPSERT
                                                                                  + PRODUCT UPSERT per decrement
Sold-Product removal          re-verification + restoration + lines + empty Sales + PRODUCT UPSERT
                              (§8)                                                + SALE UPSERT (trimmed)
                                                                                  + SALE DELETE (emptied)
First-run seed                everything (§5) — through the stores, so a BOUND database records the
                              seeded aggregates; the production seed is empty and runs unbound
Development reset             every DELETE + sync tables + seed marker (§10)
```

---

### 7a. Client deletion guard

`ClientSessionProvider.deleteClientPermanently` → clients store `deleteClientPermanently()`:

```text
BEGIN
  SELECT COUNT(*) FROM appointments WHERE client_id = ?
  SELECT COUNT(*) FROM sales        WHERE client_id = ?
  any reference  ⇒ throw ClientDeleteConflictError(clientId, references) ⇒ ROLLBACK
  DELETE FROM clients WHERE id = ?   (0 rows ⇒ not-found error ⇒ ROLLBACK)
COMMIT
→ remove the Client from session state
```

The stored rows are the authority: the UI pre-check (`getClientDeletionEligibility`, same
counts, used to choose between the confirmation and the "Suppression impossible" explanation)
is advisory, and the transaction re-verifies before deleting. There is no cascade and no
`client_id = NULL` rewrite. A conflict or a database error changes no state.

---

### 7b. Appointment checkout and deletion guard

`AppointmentSessionProvider.checkoutAppointment(id, amounts)`:

```text
domain checkoutAppointment(appointment, amounts, now)   eligibility + next record (throws on invalid cents)
→ appointments store checkoutAppointment()              ONE transaction:
     UPDATE appointments
     SET status = 'COMPLETED', paid_at = ?, card_amount_cents = ?, cash_amount_cents = ?
     WHERE id = ?
       AND (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
            OR (status = 'COMPLETED' AND paid_at IS NULL))
     → 0 rows changed ⇒ AppointmentCheckoutConflictError ⇒ ROLLBACK
→ replace the entry in session state
```

Status and payment land together — never `COMPLETED` first and the payment afterwards. A failure
leaves the row and the session unchanged, so nothing appears in the Cash Register.

`updateAppointmentPayment(id, amounts)` only rewrites `card_amount_cents` / `cash_amount_cents`
of a row whose `paid_at IS NOT NULL` (status and `paid_at` preserved by construction); the session
entry is replaced after the commit.

Automatic previous-day reconciliation still goes through the generic `updateAppointment()`, which
writes the payment columns exactly as the record carries them — `NULL` for a record without payment.

`deleteAppointment(id)` (permanent deletion):

```text
BEGIN
  SELECT paid_at FROM appointments WHERE id = ?
  SELECT COUNT(*) FROM sales WHERE appointment_id = ?
  payment recorded OR linked Sale  ⇒ throw AppointmentDeleteConflictError(id, references) ⇒ ROLLBACK
  DELETE FROM appointments WHERE id = ?   (items and phases cascade)
COMMIT
→ remove the entry from session state
```

`getAppointmentDeletionEligibility` runs the same counts as an advisory pre-check so Details shows
« Suppression impossible » instead of a confirmation that cannot succeed. There is no cascade to
Sales and no `appointment_id = NULL` rewrite. The counts are always read from the stored rows at
tap time, never cached: once the last linked Sale has been emptied and removed by a sold-Product
deletion (§8), an unpaid Appointment becomes deletable again while a paid one stays blocked.

---

### 7f. Calendar Blocks

`src/persistence/stores/calendar-blocks.ts` — `loadCalendarBlocks` (rowid order), `insertCalendarBlock`,
`updateCalendarBlock` (interval + reason only: id, Business and staff member never change),
`deleteCalendarBlock`. Every write goes through the domain `createCalendarBlock` BEFORE any SQL runs
(end strictly after start, meaningful reason, normalized text — never an empty string), and the table
CHECKs refuse it again. Each write marks the `CALENDAR_BLOCK` aggregate in the outbox inside its own
transaction; a refused block or a missing row writes nothing.

`calendar_blocks` is in `SOURIS_TABLES` (cleared by the development reset) and in
`BUSINESS_SCOPED_TABLES` (its `business_id` follows the account binding, §4b). The hydrated snapshot
gained `calendarBlocks`, read by `CalendarBlockSessionProvider` — a SEPARATE session from
Appointments, which is what the Cash Register, the Client profile and every total read.

The schedule-conflict rule (`docs/domain/CALENDAR_BLOCKS.md` §5) is a domain rule verified by that
session before it writes; it is not re-derived in SQL (it needs the Appointment phase timelines, and
the session is the single writer of a device). Covered by `calendar-blocks-store.test.ts`: round trip,
restart, edit, deletion, the domain guard, coalesced outbox marking, binding, development reset, and
isolation — every other table byte-identical, expected totals and Cash Register unchanged, no column
a price / payment / client / status could live in.

### 7c. Sync outbox integration (Cloud Sync V1B)

`src/persistence/sync/outbox.ts` — `markAggregateUpserted(db, type, id)` /
`markAggregateDeleted(db, type, id)`, called by the store from INSIDE its own transaction, after
the business statements:

```text
BEGIN
  business statements (as above)
  SELECT id FROM business_profile WHERE singleton = 1
    unbound ⇒ no outbox row (nothing to scope it to; an unbound device cannot sync)
    bound   ⇒ INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision 1, now, now)
              ON CONFLICT (business_id, aggregate_type, aggregate_id) DO UPDATE SET
                operation = new operation, revision = revision + 1, updated_at = now,
                attempt_count = 0, last_error = NULL, next_attempt_at = NULL   (retry state belongs to the failed revision)
COMMIT
```

Consequences the tests lock in (`sync-outbox.test.ts`): one mutation = one entry; repeated edits of
one aggregate coalesce into that entry (same `id`, same `created_at`, `revision` + 1); a child edit
(phase, item, sale line) marks its parent; DELETE overrides a pending UPSERT and survives the local
row; recreating a deleted aggregate with the same id turns the entry back into UPSERT; a failing
outbox write rolls the business mutation back and a failing business write leaves no entry; an
unbound database records nothing; every entry carries the bound Business UUID; entries survive a
restart and never appear in the snapshot; a refused deletion writes nothing; `sync_state` is never
written by a mutation. The full coalescing table, DELETE semantics and the worker contract are in
CLOUD_SYNC.md §10.

Providers and screens are unchanged: no provider calls the sync module, and no mutation is enqueued
after a commit. `readBoundBusinessId` (one indexed SELECT) is the only extra read per mutation.

### 7d. Sync push worker — what it reads and writes locally (Cloud Sync V1C)

The push worker (`src/persistence/sync/push-worker.ts`, contract in CLOUD_SYNC.md §15) is the first
consumer of the outbox. It needed NO schema change (still v8) and it never writes an operational
row: SQLite stays the source of truth, and a failed, blocked or absent sync changes nothing the UI
reads.

```text
reads    business_profile.id                       the ONLY Business it may push for (unbound ⇒ no run)
         souris_metadata['sync_bootstrap']          first-sync decision { businessId, decision, decidedAt } — trusted
                                                    only while still current (CLOUD_SYNC.md §11.0): EMPTY holds only
                                                    while no aggregate row and no outbox entry exists; ALREADY_SYNCED
                                                    only while sync_state has a row for the Business
         souris_metadata['sync_initial_upload_approval']
                                                    approval { businessId, approvedAt } recorded by the cloud sync
                                                    runner (V1D.1); ignored unless it names the bound Business
                                                    (CLOUD_SYNC.md §11.1, §17)
         sync_outbox (eligible entries)             business_id = bound id, next_attempt_at NULL or <= now,
                                                    ordered CLIENT, SERVICE, PRODUCT, APPOINTMENT, SALE, then id
         the CURRENT aggregate rows, raw            aggregate-payload.ts — integer cents copied as stored (no euro
                                                    round trip), 0/1 → boolean, ISO text validated; `image_uri`
                                                    and `birth_date` are never selected; a business-scoped row
                                                    stamped with another Business id is refused, never pushed
         sync_state.remote_version                  sent as the expected version
writes   souris_metadata['sync_bootstrap']          every classification; ONE transaction with the two rows below
         sync_outbox                                ONLY when the upload was approved for this Business —
                                                    enqueueInitialUpload: INSERT … SELECT … ON CONFLICT DO NOTHING
                                                    (existing entries untouched, acknowledged aggregates skipped)
         souris_metadata['sync_initial_upload_approval']
                                                    DELETED in that same transaction (one-time approval)
         success  → ONE transaction: sync_state ← server version, DELETE outbox WHERE id = ? AND revision = ?
         failure  → UPDATE attempt_count / last_error / next_attempt_at WHERE id = ? AND revision = ?
                    (a newer local revision never inherits a failure; last_error is a machine code, never row data)
         ABSENT   → settle + DELETE the sync_state row (the remote holds no such aggregate)
```

`EMPTY` is not an acknowledgement. The worker re-reads the local tables, `sync_outbox` and
`sync_state` at every run (three indexed `SELECT 1 … LIMIT 1`) before trusting a stored decision;
only real `sync_state` rows — written exclusively from server-returned versions — make pushes
automatic. A device that stored `EMPTY` and then received its first records is classified again and
answers `INITIAL_UPLOAD_REQUIRES_APPROVAL`, its outbox entries untouched — which the runner turns
into the initial upload within the same trigger (below).

The WORKER never enqueues or pushes existing local data on its own: "local populated + remote empty"
without that approval is a STOP that writes nothing but the diagnostic decision. The only writer of
the approval is `approveInitialUpload(db, businessId)` (`sync/bootstrap.ts`) — one transaction that
checks the binding (`business_profile.id` must be that exact UUID) and refuses when a push decision
is already stored. No provider, store or screen calls it. Since Cloud Sync V1D.1 its single caller is
`CloudSyncRunner`, which gives it automatically — under a live session bound to that Business — when
a run answers `INITIAL_UPLOAD_REQUIRES_APPROVAL`, then runs the worker ONE more time
(CLOUD_SYNC.md §17). The user is never asked. The 2-minute foreground tick asks `isSyncRunDue`
(`isSyncBootstrapPending || hasEligiblePushWork`, local reads only), so the first record created
after an `EMPTY` classification leaves without a background / foreground cycle.

Every database call is synchronous and short (one aggregate at a time); the network awaits sit
between them, so no transaction is ever held open across a request and store mutations interleave
freely with a run — which is exactly what the conditional settle is for. The initial enqueue is one
`INSERT … SELECT` per aggregate table.

### 7e. Restore and pull — the only writers of operational rows outside the stores (Cloud Sync V1D)

Contract in CLOUD_SYNC.md §16. No schema change (still v8). Two modules write operational rows on
behalf of the remote, both through `sync/remote-apply.ts` and NEVER through the stores — a store
mutation records an outbox entry, and a change that came from the remote must not be pushed back:

```text
sync/remote-apply.ts   applyRemoteAggregate   parent row UPDATED in place (rowid / list order kept) or INSERTed;
                                              child set REPLACED (DELETE + INSERT, cascade for appointment phases);
                                              integer cents, ids, child ids, positions copied as received;
                                              products.image_uri never written (NULL on insert, kept on update);
                                              clients.birth_date never touched; business_id = the bound Business;
                                              a row with that id under another Business id → refused;
                                              an Appointment / Sale whose Client / Appointment is absent → refused
                       applyRemoteTombstone   DELETE of the parent row (children cascade) under the SAME guards as a
                                              user deletion (§7a, §7b): referenced Client / paid or Sale-linked
                                              Appointment → BLOCKED, nothing written. No stock is replayed
                       neither writes sync_outbox nor sync_state — the caller owns the transaction

sync/restore.ts        restoreBusinessSnapshot — ONE transaction, preconditions re-read INSIDE it
reads    business_profile.id · souris_metadata['sync_initial_restore_approval'] · sync_state (must be empty for
         the Business) · the five aggregate tables (must ALL be empty)
writes   every live remote aggregate (CLIENT → SERVICE → PRODUCT → APPOINTMENT → SALE, remote creation order)
         sync_state ← one row per remote aggregate, tombstones included, with the REMOTE sync_version
         sync_outbox ← DELETE WHERE business_id = ?        (leftover intents of an empty, never-synced device)
         souris_metadata['sync_pull_cursor'] ← { businessId, pulledAt }   (server time)
         souris_metadata['sync_bootstrap']   ← ALREADY_SYNCED
         souris_metadata['sync_initial_restore_approval'] DELETED
         any throw ⇒ full rollback: the database stays empty, RESTORE_REQUIRED, approval pending

sync/pull-worker.ts    one transaction PER aggregate, decided and written in one synchronous turn
reads    souris_metadata['sync_pull_cursor'] (since = cursor − 5 min) · sync_state.remote_version ·
         sync_outbox (an entry = locally DIRTY ⇒ conflict, nothing written)
writes   clean + live      applyRemoteAggregate + sync_state ← remote version
         clean + tombstone applyRemoteTombstone + sync_state ← tombstone version   (BLOCKED ⇒ nothing)
         souris_metadata['sync_pull_cursor'] ← pulledAt, only when no aggregate was left unapplied
         NEVER sync_outbox
```

The remote answer is validated as a whole by `sync/remote-snapshot.ts` (pure, no database) before
either module writes anything. `approveInitialRestore` (`sync/bootstrap.ts`) is the only writer of the
restore approval: one transaction that checks the binding, refuses a synchronized device and refuses
any populated database. Since Cloud Sync V1D.1 its single caller is `CloudSyncRunner`, which gives it
automatically when a run answers `RESTORE_REQUIRED` and runs the worker ONE more time (CLOUD_SYNC.md
§17): a new device is rebuilt after sign-in with no prompt. A failed restore leaves the database
empty and the approval pending; the next trigger — the tick included — retries it. Meanwhile the
application is not mounted on that empty device (the session-scoped first-sync gate, CLOUD_SYNC.md §17.3), so no
operational row and no outbox entry can appear before the restore.

The first-run seed marker is untouched by a restore: a fresh install already ran its (empty)
production seed, so a restored database is never re-seeded.

---

## 8. Sales Atomicity

`SaleSessionProvider.completeSale`:

```text
prepareSaleCompletion(draft, products)   pure domain validation + snapshot + decrements
→ sales store completeSale()             ONE transaction:
     for each decrement:
        UPDATE products SET stock_quantity = stock_quantity - ?
        WHERE id = ? AND active = 1 AND stock_quantity >= ?
        → 0 rows changed ⇒ SaleStockConflictError ⇒ ROLLBACK
     INSERT sale (client_id?, appointment_id?, payment columns?); INSERT sale_items
→ applyCommittedStockDecrements()        catalog state reflects the committed stock
→ add the Sale to session state
```

The stored quantity is the final authority. No committed Sale without its decrements; no
decrement without its committed Sale. The `stock_quantity >= 0` CHECK is a second guard.

`SaleSessionProvider.deleteAppointmentProduct(appointmentId, identity)` is the inverse — the
deletion of ONE displayed Product row of Appointment Details — with the same discipline:

```text
domain removeAppointmentProduct(sales, appointmentId, identity)
     matching lines across the linked Sales (productId + productName + unitPrice),
     summed restoration, Sales that become empty, next collection
     → nothing matching / a matching Sale with its own payment ⇒ refused, nothing written
→ sales store deleteAppointmentProduct()      ONE transaction:
     SELECT si.sale_id, si.quantity, s.paid_at FROM sale_items si JOIN sales s
        WHERE s.appointment_id = ? AND si.product_id = ? AND si.product_name = ? AND si.unit_price_cents = ?
        → no row ⇒ PRODUCT_NOT_SOLD; any paid_at set ⇒ SALE_HAS_PAYMENT ⇒ ROLLBACK
     UPDATE products SET stock_quantity = stock_quantity + Σ quantity WHERE id = ?
        → 0 rows changed (Product deleted) ⇒ PRODUCT_MISSING ⇒ ROLLBACK
     DELETE FROM sale_items WHERE sale_id = ? AND <same identity>      (matching lines only)
     for each touched Sale: no item left ⇒ DELETE FROM sales WHERE id = ?; otherwise keep it
→ applyCommittedStockRestorations()           catalog state reflects the restored stock
→ replace the Sale collection in session state
```

The snapshot identity is matched on the stored integer cents of the displayed unit price (the
same `toSqlPriceCents` conversion the line was written with). Stock is restored, the matching
lines removed and the emptied Sales deleted together — never the stock first and the lines later. A failure anywhere leaves the stock, every line, every Sale and the
session untouched (`AppointmentProductDeleteConflictError` carries the reason); a missing Product
aborts instead of removing lines whose stock cannot be given back. A Sale that still holds other
Products is preserved — Sales stay separate records until emptied. The exact stored quantities are
restored (no clamping); there is no Sale-level stored total to maintain (totals are derived).
`appointments.paid_at / card_amount_cents / cash_amount_cents` are never read or written by this
operation: the recorded Appointment payment — and therefore the Cash Register — is untouched. No
schema change was needed: `sales.appointment_id` (v5) and the `sale_items` snapshot rows already
carry everything the transaction reads.

---

## 9. Product Image Persistence

Draft images (camera capture, library copy, Vision PNG) are temporary. They become canonical only
when the Product is saved:

```text
draft URI ──(Save)──► copy to <documents>/products/<productId>-<timestamp>-<n>.<ext>
                     ──► persist the durable URI ──► clean up
```

`prepareProductImageCommit` (`src/features/products/images/product-image-storage.ts`) is a
two-phase commit over the `LocalFiles` boundary:

```text
prepare   copy the draft into the owned directory (nothing else changes)
rollback  delete the copy (database write failed)
finalize  delete the replaced Souris-owned image and the temporary cache source
          (database write succeeded); best effort, never throws
```

Rules:

- Cancel never reaches the provider, so the canonical image is untouched;
- an unchanged image is a no-op commit;
- replacement gets a NEW file name, so image caches never show a stale picture;
- removal clears `image_uri` and deletes the owned file after the write;
- Product deletion deletes the owned file after the row is gone;
- only files under `<documents>/products/` or the app cache are ever deleted — external
  photo-library assets never are;
- image bytes are never stored in SQLite.

---

## 10. Development Reset

Development builds show a `Développement › Réinitialiser les données locales` row on the Plus tab
(`__DEV__` only, compiled out of production). It runs `resetForDevelopment()`:

```text
DELETE every operational table + sync_outbox + sync_state + remove seed_version + remove sync_bootstrap
  + remove sync_initial_upload_approval + remove sync_initial_restore_approval + remove sync_pull_cursor
  (one transaction; business_profile is KEPT — pending intents, acknowledged revisions, the
   first-sync decision, the pull cursor and any initial-upload / initial-restore approval describe
   rows the reset removes, so they go with them. The next sync run classifies both sides again: development fixtures are a STOP
   whether the remote Business is populated or empty — never an upload under a stale decision or
   a stale approval)
→ delete <documents>/products/                       (owned images only)
→ bootstrap again with the DEVELOPMENT seed (synthetic clients, pilot catalogs + Agenda fixtures), stamped with
  the bound Business id so the reset never introduces a second business id
→ load → remount feature providers
```

A fresh development install therefore starts empty like production; the reset is the explicit
way to load the pilot data and fixtures.

The same `Développement` section holds `Sync V1C (test)`, the development sync control
(CLOUD_SYNC.md §15.9): it only reads the sync bookkeeping and triggers the runner's own run — it
approves nothing since V1D.1. After a reset on a device whose Business is populated remotely, the
reseeded fixtures make it `RECONCILIATION_REQUIRED`: a development reset is never followed by a
restore. After a reset on a device whose Business is EMPTY remotely, the reseeded fixtures ARE
uploaded automatically (V1D.1): use a throwaway account for development resets.

The schema is kept. Alternatives: uninstall the app, or delete `souris.db` from the app's SQLite
directory with a device file browser.

---

## 11. Testing Strategy

Jest uses Node's built-in `node:sqlite` through the same `SourisDatabase` boundary
(`src/persistence/testing/node-sqlite-database.ts`): a real SQLite engine, one fresh in-memory
database per test, no extra dependency, no developer device database. `TestPersistenceProvider`
wraps the real `PersistenceProvider` around such a database with in-memory files, seeded with the
real first-run seed unless a test supplies its own.

Covered: fresh migration, idempotence, refusal of newer versions, the v1 → v2, v2 → v3,
v3 → v4, v4 → v5, v5 → v6, v6 → v7 and v7 → v8 upgrades of existing seeded databases (historical rows are inserted with the
historical column set — euro `REAL` prices through v7 — by `testing/historical-fixtures.ts`, which write no outbox entry), the
monetary persistence (`money-persistence.test.ts`: the `toSqlPriceCents` / `fromSqlPriceCents` pair on representative
amounts and the exact round trip of every cents value, integer cents stored for Service / Product / Appointment snapshot /
Sale line prices, exact edited prices, identical expected total, Sale total, Cash Register and formatted euros after a
restart, cents-based identity matching of an Appointment-linked Product removal, refusal of negative or non-finite
prices before any write, no euro `REAL` column on a fresh database), account binding (profile persisted, every `business_id`
rewritten, relationships untouched, restart, same-owner rebind, other-owner refusal, multiple local
ids refusal, rollback), the empty production seed, the development seed under a bound Business id,
seed-once, restart without duplicates, empty-but-initialized
databases, every store's round trip (order, instants, `MM-DD` birthday, optionals, `archivedAt`
Date round trip, snapshots surviving catalog deletion), Sale rollback, the transactional Client
deletion guard (safe / blocked by Appointment / blocked by Sale / both), the atomic Appointment
checkout (exact cents round trip, refusal for missing / cancelled / no-show / paid rows, invalid
cents, payment correction, payment kept through generic updates), the Appointment deletion guard
(payment / linked Sale / both, Sale untouched), the Sale ↔ Appointment link round trip, the standalone Sale payment round trip (card / cash /
mixed, NULL for linked Sales, invalid cents refused), the atomic Appointment-linked Product deletion
(summed stock restored exactly and matching lines removed across two Reventes, the emptied Sale
deleted and the mixed Sale kept, the last Sale removed, snapshot-identity matching at another unit
price, no clamping, refusal of unsold / paid, abort on a deleted Product, rollback of the
restoration when a later write fails), the sync outbox (§7c: scoping, one entry per mutation,
coalescing, child → parent marking, DELETE semantics, atomicity both ways, restart, conditional
settle, development reset, a failure recorded for an overtaken revision being dropped) and `sync_state` round trip (exact version and instant, restart,
upsert, Business scoping, refusal of fabricated versions), the Cloud Sync V1C push (§7d — `sync-bootstrap.test.ts`:
the classification cases with and without approval, refusal of a malformed remote count, local population, the stored decision,
`enqueueInitialUpload`, `isStoredPushDecisionCurrent` (EMPTY stale on the first aggregate or outbox entry,
ALREADY_SYNCED needing real Business-scoped acknowledged state); `sync-push-worker.test.ts`, through the real stores and an in-memory remote with the RPC
contract: the E2E regression "EMPTY is not a synchronization acknowledgement" (EMPTY → Client / Service / Product →
BLOCKED with the remote still empty → approval → the 3 uploaded; EMPTY surviving a restart while empty; first
mutation requiring approval; stale EMPTY re-classified against a remote populated meanwhile; no UPSERT under EMPTY
even for an aggregate appearing during the run; ALREADY_SYNCED without acknowledged state; a really synchronized
Business pushing automatically), a new account staying empty, populated local + empty remote doing nothing before approval (run after run,
mutations included), approval recording only, approval for Business A never authorizing Business B (API refusal and
forged record), approval surviving a restart, queuing the initial aggregates once and being consumed, an interrupted
approved upload resuming without fabricated acknowledgement, approval never overriding a populated remote, the
development reset clearing it, already-synchronized Businesses pushing automatically, the STOP states and their re-evaluation, no decision while offline, unbound / mismatched /
non-UUID / concurrent runs skipped, Business isolation, a foreign-Business row never pushed, aggregate + ordered
children + snapshots, exact cents and no image path, dependency order, version acknowledgement, a mutation during
the upload, offline, lost acknowledgement retried idempotently, bounded backoff with code-only errors, version
conflicts leaving the remote untouched, tombstone DELETE, never-remote DELETE, UPSERT of a vanished row, recreation
after a tombstone; `sync-gateway.test.ts`: the Supabase adapter and its error mapping; `CloudSyncRunner.test.tsx`:
live-bound-session gating, offline / signed-out /
unconfigured silence, foreground and tick triggers), the Cloud Sync V1D restore and pull (§7e —
`sync-pull-restore.test.ts`, two real SQLite devices of one Business against the same in-memory remote:
empty local + populated remote → RESTORE_REQUIRED with the dataset never fetched before the approval; a stored
EMPTY discovering a Business populated meanwhile; the approval recording only, Business-scoped, surviving a
restart, refused on a populated or synchronized device; a record created before the restore →
RECONCILIATION_REQUIRED, never overwritten; the full restore of the five families with children, equal to
the source device's snapshot and byte-equal at the SQL level (cents, child ids, positions, payments),
archived Client, cancellation, checkout, standalone and Appointment-linked Sales, tombstone not resurrected,
no image path; `sync_state` = the remote versions, empty outbox, ALREADY_SYNCED, cursor, consumed approval;
no echo and pushes under the restored versions afterwards; leftover outbox intents dropped; a SQLite failure
in the MIDDLE of the restore transaction, offline / undeployed function, eight invalid datasets and a record
created during the fetch each leaving the database unchanged with the approval pending, then a successful
retry after a restart; Business isolation (same id in two Businesses, FORBIDDEN for a non-owner, Business
mismatch skipped); incremental pull applying remote revisions to clean aggregates in place, acknowledging the
returned versions and creating no outbox entry; the cursor-minus-overlap read; a failed or invalid pull
applying nothing without disturbing the push; a missing reference holding the cursor; remote newer + local
dirty, a remote tombstone against a dirty aggregate and a local DELETE against a remote edit each leaving
BOTH sides untouched; tombstones removing clean aggregates with their children, acknowledged without echo,
guarded by the local deletion rules, and converging in one pull in reverse dependency order; the snapshot
validator's normalization, payload-less tombstones and value-free errors), `CloudSyncRunner.test.tsx` again for
the screens re-hydrating after a restore or an
applied pull but never after a push-only run, the Cloud Sync V1D.1 seamless bootstrap (CLOUD_SYNC.md §17.4 —
`CloudSyncRunner.test.tsx`: automatic initial upload at launch in exactly two runs, automatic new-device
restore with re-hydrated providers and no echo, a stale EMPTY uploaded by the tick alone,
RECONCILIATION_REQUIRED never approved and neither side touched, a failed restore retried by the tick,
no approval once the session ended mid-run; `isSyncBootstrapPending` / `isSyncRunDue` at the
persistence level), the source-hygiene guards (no literal NUL
byte in a store file; no store SQL statement naming the euro `price` / `unit_price` columns dropped by
v8), image promotion /
rollback / replacement / removal / external-asset safety, and the provider bootstrap states.

---

## 12. Connection to the Cloud Layer

`docs/architecture/CLOUD_SYNC.md` defines the remote operational schema (Cloud Sync V1A). What
this local layer must keep true for the later phases:

- SQLite stays the operational source of truth; screens never query Supabase for operational data.
  The V1C push worker only READS operational rows (raw, §7d); the V1D restore and pull WRITE them —
  raw as well, through `sync/remote-apply.ts` and deliberately NOT through the stores, whose outbox
  marking would push every remote change straight back (§7e);
- the remote schema mirrors this one table for table, with two boundary conversions owned by
  the sync layer: `clients` receives the bound Business id (the local table has none) and
  `products.image_uri` is never uploaded;
- ~~HARD PREREQUISITE before V1C: the euro `REAL` price columns must first be migrated to integer
  cents~~ — DONE in V1C-0 (schema v8, §4): `services.price_cents`, `appointment_items.price_cents`,
  `products.price_cents` and `sale_items.unit_price_cents` are exact integer cents, identical to
  the remote columns (CLOUD_SYNC.md §3.1); the sync boundary needs no money conversion;
- ~~HARD PREREQUISITE before V1C: the runtime id generators must emit globally unique ids~~ —
  DONE in V1C-0: every new Client / Service / Appointment / Product / Sale id is a UUID v4 from
  `expo-crypto` (`src/shared/lib/uuid.ts`, CLOUD_SYNC.md §5.2); existing ids were never rewritten;
- the aggregate boundaries are the transaction boundaries of §7: CLIENT, SERVICE + phases,
  APPOINTMENT + items + phases, PRODUCT, SALE + items;
- V1B (schema v7) added `sync_outbox`, written inside the same `runInTransaction` as the business
  mutation (no `sync_status` column on business tables), and `sync_state`, the per-aggregate
  acknowledged remote version (§7c, CLOUD_SYNC.md §10);
- V1C added the push worker (§7d, CLOUD_SYNC.md §15), their first runtime consumer: a one-way upload
  through one atomic, version-conditional remote function. It reads aggregates raw and writes only
  sync bookkeeping; the stores, providers and screens are unchanged;
- V1D added the read side (§7e, CLOUD_SYNC.md §16): an approved, single-transaction
  new-device restore and an incremental pull that only ever writes locally CLEAN aggregates. The
  stores and screens are unchanged; the persistence boundary gained `reloadSnapshot()` (§6) so the
  providers re-hydrate after such a run. `products.image_uri` stays local-only in both directions;
- V1D.1 made the first sync seamless (CLOUD_SYNC.md §17): the runner gives both first-sync approvals
  automatically and the periodic check notices a pending first sync. No schema change, no new
  metadata key, no change to the worker's reads and writes above.
