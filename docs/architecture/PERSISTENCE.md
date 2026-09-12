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

Explicit non-goals: authentication, accounts, server database, cloud backup, conflict resolution,
multi-device sync, offline sync engine. Local-first only.

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
schema.ts            migrations[] — schema v1 SQL, schema v2 (clients.archived_at), SOURIS_TABLES
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

## 3. Schema (v1 + v2)

Canonical string ids are primary keys everywhere; SQLite never assigns identities.

```text
souris_metadata     key PK, value                                   seed marker and future flags

clients             id PK, first_name, last_name?, phone?, email?, birth_date?,
                    archived_at?                                    (v2)
services            id PK, business_id, name, type, price, active
service_phases      (service_id FK→services CASCADE, position) PK, id, name, duration_minutes, requires_staff
appointments        id PK, business_id, client_id, staff_member_id, start_at, status, notes?,
                    cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?
appointment_items   (appointment_id FK→appointments CASCADE, id) PK, item_order, service_id,
                    service_option_id?, service_name, service_type, price
appointment_phases  (appointment_id, appointment_item_id, position) PK
                    FK→appointment_items CASCADE, id, name, duration_minutes, requires_staff
products            id PK, business_id, name, brand?, category?, barcode?, image_uri?, price,
                    stock_quantity (CHECK >= 0), active
sales               id PK, business_id, client_id?, completed_at
sale_items          (sale_id FK→sales CASCADE, id) PK, position, product_id, product_name,
                    unit_price, quantity (CHECK >= 1)
```

Indexes: `appointments(start_at)`, `appointments(client_id)`, `sales(client_id)`.

### Value representation

```text
booleans        INTEGER 0/1                       (values.ts: toSqlBoolean / fromSqlBoolean)
instants        ISO-8601 UTC TEXT                 startAt, cancelledAt, recordedAt, completedAt,
                                                  archivedAt (NULL = active Client)
                                                  restored as Date; local calendar behavior
                                                  is unchanged because the instant is exact
birthDate       civil YYYY-MM-DD TEXT             stored and restored as the same string, NEVER
                                                  converted to a Date or timestamp
optionals       NULL ↔ absent property            never empty strings, never null in domain values
money           REAL                              current JS number semantics preserved as-is
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
               → migrate to the current schema (v2)
               → seed_version absent → run legacy adapters ONCE, in one transaction
                   Clients      = strict legacy address book ONLY
                   Services     = legacy services/techniques through the catalog adapter
                   Products     = legacy products through the product adapter
                   Appointments = []
                   Sales        = []
               → write souris_metadata.seed_version = 1
               → load snapshot

next launches: migrate (no-op) → seed_version present → skip seed → load snapshot
```

The seed marker — not row counts — decides. A professional who deletes every record is NOT
re-seeded. The production seed composition lives in `src/providers/first-run-seed.ts` and
contains approved legacy data only; after the first launch the legacy modules are never
consulted again.

Development fixtures (the `client-agenda-*` clients and the relative-day Agenda Appointments)
live in `src/providers/development-seed.ts`. They reach a database only through the `__DEV__`
reset (§10) or `TestPersistenceProvider` — never through the production first-run path.

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
Appointment create            appointment + items + phases + Service catalog default updates
                              (adjusted prices/durations become catalog defaults ONLY when
                              creation commits; Appointment Editing never touches the catalog)
Appointment edit              metadata + full item/phase replacement
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

## 8. Sales Atomicity

`SaleSessionProvider.completeSale`:

```text
prepareSaleCompletion(draft, products)   pure domain validation + snapshot + decrements
→ sales store completeSale()             ONE transaction:
     for each decrement:
        UPDATE products SET stock_quantity = stock_quantity - ?
        WHERE id = ? AND active = 1 AND stock_quantity >= ?
        → 0 rows changed ⇒ SaleStockConflictError ⇒ ROLLBACK
     INSERT sale; INSERT sale_items
→ applyCommittedStockDecrements()        catalog state reflects the committed stock
→ add the Sale to session state
```

The stored quantity is the final authority. No committed Sale without its decrements; no
decrement without its committed Sale. The `stock_quantity >= 0` CHECK is a second guard.

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
DELETE every canonical table + remove seed_version   (one transaction)
→ delete <documents>/products/                       (owned images only)
→ bootstrap again with the DEVELOPMENT seed (legacy data + Agenda fixtures)
→ load → remount feature providers
```

A fresh development install therefore starts with production data only; the reset is the
explicit way to load the fixtures.

The schema is kept. Alternatives: uninstall the app, or delete `souris.db` from the app's SQLite
directory with a device file browser.

---

## 11. Testing Strategy

Jest uses Node's built-in `node:sqlite` through the same `SourisDatabase` boundary
(`src/persistence/testing/node-sqlite-database.ts`): a real SQLite engine, one fresh in-memory
database per test, no extra dependency, no developer device database. `TestPersistenceProvider`
wraps the real `PersistenceProvider` around such a database with in-memory files, seeded with the
real first-run seed unless a test supplies its own.

Covered: fresh migration, idempotence, refusal of newer versions, the v1 → v2 upgrade of an
existing seeded database, seed-once, restart without duplicates, empty-but-initialized
databases, every store's round trip (order, instants, civil birthDate, optionals, `archivedAt`
Date round trip, snapshots surviving catalog deletion), Sale rollback, the transactional Client
deletion guard (safe / blocked by Appointment / blocked by Sale / both), image promotion /
rollback / replacement / removal / external-asset safety, and the provider bootstrap states.
