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
```

Since Account & Onboarding V1 the database also holds the **local account binding** (schema v3,
§3/§4b): which Business — and which owning Auth user — this device's data belongs to.

Explicit non-goals: cloud backup of operational data, conflict resolution, multi-device sync,
offline sync engine. Authentication and the Business profile live in Supabase
(`docs/architecture/AUTH.md`); operational data stays local-first only. The remote operational
schema and the sync contract that will connect this database to Supabase are defined in
`docs/architecture/CLOUD_SYNC.md` (Cloud Sync V1A: schema only, no runtime sync yet).

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
                     v6 (sales payment columns), SOURIS_TABLES, BUSINESS_SCOPED_TABLES
migrations.ts        migrateDatabase(): PRAGMA user_version runner
metadata.ts          souris_metadata key/value (seed marker)
seed.ts              FirstRunSeed contract + seedDatabaseIfNeeded()
bootstrap.ts         migrate → seed → load PersistedSnapshot
development-reset.ts clearPersistedDataForDevelopment() (__DEV__ only)
stores/*.ts          load / insert / update / delete per entity, with row ↔ domain mappers
files/               LocalFiles boundary + expo-file-system binding
testing/             node:sqlite database, in-memory files, fixtures (tests only)
```

No ORM, no repository/factory abstractions. SQL lives only in `src/persistence/stores`. Screens and
components never see SQL, rows, or the database.

The synchronous expo-sqlite API is used deliberately: mutations remain synchronous provider calls
(validate → write → set state), the dataset is small and local, and the existing screen contracts
stay intact. Product saves are the one asynchronous path because the durable image copy is async.

---

## 3. Schema (v1 + v2 + v3 + v4 + v5 + v6)

Canonical string ids are primary keys everywhere; SQLite never assigns identities.

```text
souris_metadata     key PK, value                                   seed marker and future flags

clients             id PK, first_name, last_name?, phone?, email?, birth_date? (legacy, ≤ v3),
                    archived_at? (v2), birthday? (v4, MM-DD)
services            id PK, business_id, name, type, price, active
service_phases      (service_id FK→services CASCADE, position) PK, id, name, duration_minutes, requires_staff
appointments        id PK, business_id, client_id, staff_member_id, start_at, status, notes?,
                    cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?,
                    paid_at? (v5), card_amount_cents? (v5, CHECK >= 0), cash_amount_cents? (v5, CHECK >= 0)
appointment_items   (appointment_id FK→appointments CASCADE, id) PK, item_order, service_id,
                    service_option_id?, service_name, service_type, price
appointment_phases  (appointment_id, appointment_item_id, position) PK
                    FK→appointment_items CASCADE, id, name, duration_minutes, requires_staff
products            id PK, business_id, name, brand?, category?, barcode?, image_uri?, price,
                    stock_quantity (CHECK >= 0), active
sales               id PK, business_id, client_id?, appointment_id? (v5), completed_at,
                    paid_at? (v6), card_amount_cents? (v6, CHECK >= 0), cash_amount_cents? (v6, CHECK >= 0)
sale_items          (sale_id FK→sales CASCADE, id) PK, position, product_id, product_name,
                    unit_price, quantity (CHECK >= 1)
business_profile    singleton PK (CHECK = 1), id, owner_user_id, owner_first_name,
                    owner_last_name?, name, activity_type, phone?, created_at, updated_at   (v3)
```

`business_profile` holds at most ONE row (the `singleton` primary key): the device's account
binding. It never stores tokens or the owner's email.

Indexes: `appointments(start_at)`, `appointments(client_id)`, `sales(client_id)`,
`sales(appointment_id)` (v5).

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
money           REAL                              catalog and snapshot prices: current JS number
                                                  semantics preserved as-is
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
               → migrate to the current schema (v4)
               → seed_version absent → run the production seed ONCE, in one transaction
                   Clients / Services / Products / Appointments / Sales = []   (EMPTY)
               → write souris_metadata.seed_version = 1
               → load snapshot

next launches: migrate (no-op) → seed_version present → skip seed → load snapshot
```

Since Account & Onboarding V1 the production first-run seed is **empty**: a fresh real install
starts with no pilot Clients, Services, Products, Appointments, or Sales, and shows the intentional
empty states. The legacy pilot address book and catalogs are business-specific data of the first
professional; they were never meant to become universal customer data.

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

---

## 7. Mutation Discipline

Every provider mutation follows:

```text
validate (domain) → SQLite write (transaction when multi-row) → update React state
```

State changes only after the write succeeds. A database failure throws before any state change;
screens report it through one concise alert (`alertPersistenceFailure`) and leave the form as-is.
There is no optimistic update and no global error framework.

Transaction boundaries (`runInTransaction` joins an enclosing transaction instead of nesting):

```text
Client create/edit            single row (edit never touches archived_at)
Client archive/restore        single statement on archived_at
Client permanent deletion     reference counts + DELETE in one transaction   (§7a)
Service create/edit           service row + full phase-list replacement
Service activation/deletion   single statement (phases cascade)
Appointment create            appointment + items + phases (snapshot only; no Service row is written)
Appointment edit              metadata + full item/phase replacement (snapshot only)
Appointment timing            editability re-check + phase duration rows of one item (snapshot only)
Appointment item reorder      editability re-check + item_order rewritten by stable item id (Details)
Appointment item removal      editability + last-item re-check + item and phase rows + order normalization
Appointment delete            single statement (items/phases cascade)
Appointment reconciliation    every previous-day finalization in one transaction
Product create/edit           single row, after the durable image copy
Product stock/activation      single statement
Sale completion               stock revalidation + decrements + sale + items   (§8)
First-run seed                everything                                        (§5)
Development reset             every DELETE + seed marker                        (§10)
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
        WHERE s.appointment_id = ? AND si.product_id = ? AND si.product_name = ? AND si.unit_price = ?
        → no row ⇒ PRODUCT_NOT_SOLD; any paid_at set ⇒ SALE_HAS_PAYMENT ⇒ ROLLBACK
     UPDATE products SET stock_quantity = stock_quantity + Σ quantity WHERE id = ?
        → 0 rows changed (Product deleted) ⇒ PRODUCT_MISSING ⇒ ROLLBACK
     DELETE FROM sale_items WHERE sale_id = ? AND <same identity>      (matching lines only)
     for each touched Sale: no item left ⇒ DELETE FROM sales WHERE id = ?; otherwise keep it
→ applyCommittedStockRestorations()           catalog state reflects the restored stock
→ replace the Sale collection in session state
```

Stock is restored, the matching lines removed and the emptied Sales deleted together — never the
stock first and the lines later. A failure anywhere leaves the stock, every line, every Sale and the
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
DELETE every operational table + remove seed_version (one transaction; business_profile is KEPT)
→ delete <documents>/products/                       (owned images only)
→ bootstrap again with the DEVELOPMENT seed (legacy pilot data + Agenda fixtures), stamped with
  the bound Business id so the reset never introduces a second business id
→ load → remount feature providers
```

A fresh development install therefore starts empty like production; the reset is the explicit
way to load the pilot data and fixtures.

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
v3 → v4, v4 → v5 and v5 → v6 upgrades of existing seeded databases (historical rows are inserted with the
historical column set through `testing/historical-fixtures.ts`), account binding (profile persisted, every `business_id`
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
restoration when a later write fails), the source-hygiene guard (no literal NUL
byte in a store file), image promotion /
rollback / replacement / removal / external-asset safety, and the provider bootstrap states.

---

## 12. Connection to the Cloud Layer

`docs/architecture/CLOUD_SYNC.md` defines the remote operational schema (Cloud Sync V1A). What
this local layer must keep true for the later phases:

- SQLite stays the operational source of truth; the future sync worker reads and writes it
  through the existing stores, and screens never query Supabase for operational data;
- the remote schema mirrors this one table for table, with two boundary conversions owned by
  the sync layer: `clients` receives the bound Business id (the local table has none) and
  `products.image_uri` is never uploaded;
- HARD PREREQUISITE before V1C: the euro `REAL` price columns (`services.price`,
  `appointment_items.price`, `products.price`, `sale_items.unit_price`) must first be migrated to
  integer cents by a forward SQLite migration; the remote columns are integer cents and a
  per-sync conversion is not an acceptable substitute (CLOUD_SYNC.md §3.1). Not part of V1A;
- HARD PREREQUISITE before V1C: the runtime id generators (`<prefix>-<Date.now()>-<counter>`)
  must emit globally unique ids (CLOUD_SYNC.md §5.2); existing ids are never rewritten;
- the aggregate boundaries are the transaction boundaries of §7: CLIENT, SERVICE + phases,
  APPOINTMENT + items + phases, PRODUCT, SALE + items;
- V1B will add a `sync_outbox` written inside the same `runInTransaction` as the business
  mutation (no `sync_status` column on business tables) and per-aggregate acknowledged remote
  versions; neither exists in schema v6.
