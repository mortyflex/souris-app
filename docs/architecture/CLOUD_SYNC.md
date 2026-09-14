# Souris — Cloud Sync

## 1. Purpose and status

Cloud Sync gives the operational data of a Business (Clients, Services, Appointments, Products,
Sales) a remote home in Supabase so it can be backed up, restored on a new device, and later
shared between devices. It does NOT change how the application works: SQLite stays the
operational database and the UI keeps reading and writing it.

```text
V1A  Remote Schema & Sync Contract        ← this document (schema + contract, no runtime)
V1B  Local Outbox & Sync Metadata
V1C  Initial Upload + Incremental Push
V1D  Pull + New Device Restore
V1E  Conflict / Retry Hardening
V1F  Product Image Sync
```

State after V1A: the remote operational tables, constraints, triggers, RLS and grants exist in
`supabase/migrations/20260914120000_create_operational_sync_schema.sql`. No application code
reads or writes them. Nothing is uploaded, downloaded, restored or synchronized. The product must
keep saying so (`docs/architecture/AUTH.md` §1).

---

## 2. Local-first model

```text
UI ──► feature provider ──► SQLite (source of truth) ──► [V1B outbox] ──► [V1C/V1D sync worker] ──► Supabase
                                        ▲                                                            │
                                        └──────────────────── [V1D pull / restore] ◄─────────────────┘
```

Invariants that every later phase must keep:

- feature screens and providers never query Supabase for operational data — they read SQLite
  through the existing stores and session providers;
- every mutation commits to SQLite first; remote propagation is asynchronous and retryable;
- the app is fully usable offline; sync failures never block or roll back a local mutation;
- the remote database is a mirror of the canonical local model, not a second model.

---

## 3. Remote schema

One table per local table, in `public`, all owned by `public.businesses` (which is not
duplicated). Column names follow SQLite; types are the Postgres-native equivalents.

```text
clients             (business_id, id) PK, first_name, last_name?, phone?, email?, birthday? (MM-DD),
                    archived_at?, + sync metadata
services            (business_id, id) PK, name, type SERVICE|TECHNIQUE, price_cents, active, + sync metadata
service_phases      (business_id, service_id, id) PK, position (unique per service, deferrable),
                    name, duration_minutes >= 0, requires_staff
appointments        (business_id, id) PK, client_id → clients, staff_member_id, start_at, status,
                    notes?, cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?,
                    paid_at?, card_amount_cents?, cash_amount_cents?, + sync metadata
appointment_items   (business_id, appointment_id, id) PK, item_order (unique per appointment, deferrable),
                    service_id (NO FK), service_option_id?, service_name, service_type, price_cents
appointment_phases  (business_id, appointment_id, appointment_item_id, id) PK, position (unique per item,
                    deferrable), name, duration_minutes >= 0, requires_staff
products            (business_id, id) PK, name, brand?, category?, barcode?, price_cents,
                    stock_quantity >= 0, active, + sync metadata            (NO image column)
sales               (business_id, id) PK, client_id? → clients, appointment_id? → appointments,
                    completed_at, paid_at?, card_amount_cents?, cash_amount_cents?, + sync metadata
sale_items          (business_id, sale_id, id) PK, position (unique per sale, deferrable),
                    product_id (NO FK), product_name, unit_price_cents, quantity >= 1

sync metadata       created_at timestamptz, updated_at timestamptz, sync_version bigint, deleted_at timestamptz?
```

Database-level rules mirrored from the domain:

- status / type / cancelled_by vocabularies are CHECKed;
- a cancellation is `cancelled_at` + `cancelled_by` together (reason only when cancelled);
- a recorded payment is `paid_at` + both non-null, non-negative cent amounts, or all three NULL;
- an Appointment-linked Sale (`appointment_id` set) never carries a payment;
- `stock_quantity >= 0`, `quantity >= 1`, every cents column `>= 0`;
- a snapshot phase may last 0 minutes (catalog positivity stays an application rule);
- no derived value is stored: no Appointment expected total, no Sale total, no Cash Register
  totals, no Client spend or visit counts.

### Local ↔ remote differences the sync layer must bridge

```text
SQLite                                   Supabase                          Conversion (sync boundary only)
clients has no business_id               clients.business_id NOT NULL      stamp the bound Business id (business_profile.id)
price / unit_price REAL (euro number)    price_cents / unit_price_cents    eurosToCents (domain rule) ⇄ cents / 100
booleans INTEGER 0/1                     boolean                           values.ts helpers
instants ISO-8601 TEXT                   timestamptz                       Date ⇄ ISO string
products.image_uri (device file path)    — (absent)                        never uploaded; V1F adds a Storage reference
birth_date (legacy, unused)              — (absent)                        never uploaded
business_id TEXT                         business_id uuid                  must be the remote Business UUID (bound device)
```

A device whose `business_id` values are not the bound remote UUID (an unbound development
database using `fixture-business`) cannot sync; binding (PERSISTENCE.md §4b) is the prerequisite.

### 3.1 Money — hard prerequisite before V1C

Live inspection (schema v6): `services.price`, `appointment_items.price`, `products.price` and
`sale_items.unit_price` are SQLite `REAL` euro numbers; only `card_amount_cents` /
`cash_amount_cents` (appointments, sales) are already integer cents. The remote columns are
integer cents and stay so.

**Before any real push or pull (before V1C), the local persisted monetary values must be
migrated to integer cents** (a forward SQLite migration adding `price_cents` /
`unit_price_cents`, converting with `eurosToCents`, and switching the stores and domain price
fields to cents). Converting at the sync boundary on every push and pull is not an acceptable
substitute: a euro `REAL` round-tripped through cents is not guaranteed to be byte-identical, so
the pull would report spurious local changes and the conflict contract (§9) would misfire. This
migration is NOT part of V1A and is not implemented here.

---

## 4. Business / RLS boundary

```sql
public.is_business_owner(business_id uuid) → boolean
  -- SECURITY INVOKER, STABLE, search_path = ''
  -- exists (businesses where id = $1 and owner_user_id = (select auth.uid()))
```

Every operational table has RLS enabled and the same policy set, all `to authenticated`:

```text
SELECT  using      is_business_owner(business_id)      tombstones included (no deleted_at filter)
INSERT  with check is_business_owner(business_id)      the owner controls business_id
UPDATE  using      is_business_owner(business_id)
        with check is_business_owner(business_id)      the resulting row still belongs to the owner
DELETE  nested children only                           parents are tombstoned, never hard-deleted
```

Grants: `anon` and `public` hold nothing. `authenticated` holds select / insert / update on the
five aggregate tables and additionally delete on the four child tables. The Supabase default
privileges (which include DELETE and TRUNCATE) are revoked first; the same revoke is applied to
`businesses`, whose original migration had left them in place.

Immutability: the before-write trigger pins `business_id`, `id` and `created_at` on every UPDATE
of an aggregate row, so a row can never be moved to another Business even by a client that passes
the policy. Child rows inherit the Business through their composite foreign key.

---

## 5. Identifiers

Application ids are stable TEXT keys generated on the device. No remote id is introduced: the
local id is the remote id, unchanged, on every table. Top-level aggregates are keyed
`(business_id, id)`; nested children are keyed by their PARENT plus their own id, because a
child id is only unique inside its parent (verified against the local schema and generators):

```text
table               id unique in Business?  same id under two parents?     local key                                     remote key
service_phases      no (not required)       yes (allowed)                  PK (service_id, position)                     PK (business_id, service_id, id)
                                                                                                                         + UNIQUE (…, position)
appointment_items   no (not required)       yes (allowed)                  PK (appointment_id, id)                       PK (business_id, appointment_id, id)
                                                                                                                         + UNIQUE (…, item_order)
appointment_phases  NO — reuses the catalog yes (NORMAL: every booking     PK (appointment_id, appointment_item_id,      PK (business_id, appointment_id,
                    phase id (snapshot.ts)  of the Service repeats it)     position)                                     appointment_item_id, id) + UNIQUE (…, position)
sale_items          no (not required)       yes (allowed)                  PK (sale_id, id)                              PK (business_id, sale_id, id)
                                                                                                                         + UNIQUE (…, position)
```

The remote phase keys are id-based where SQLite is position-based. That is stricter only in one
way — a phase id may not repeat inside its own parent — which the runtime already relies on:
timing edits address a phase by `(appointment_id, appointment_item_id, id)` and require exactly
one row, Details keeps duration drafts keyed by phase id, and `createServicePhaseId` never
repeats inside one Service. Position uniqueness is kept remotely as a second, deferrable key.

- `business_id` is the `public.businesses.id` UUID the device is bound to;
- `staff_member_id` stays a plain text identifier (no staff table exists; CLAUDE.md §18);
- `service_id` on appointment items and `product_id` on sale items are snapshot metadata with
  no foreign key, exactly like SQLite (PERSISTENCE.md §3).

### 5.1 Current generators are NOT globally collision-resistant (inspected 2026-09-14)

None of the runtime generators uses a UUID, nanoid or any random / device-unique component. All
of them are `<prefix>-<Date.now()>-<counter>` where the counter is a module variable that
restarts at 1 on every app launch:

```text
src/features/clients/creation/runtime-ids.ts        createClientId            client-<ms>-<n>
src/features/appointments/creation/runtime-ids.ts   createAppointmentId       appointment-<ms>-<n>
                                                    createAppointmentItemId   <appointmentId>-item-<order>
                                                    createNewAppointmentItemId <appointmentId>-item-new-<ms>-<n>
src/features/services/editor/runtime-ids.ts         createServiceId           service-<ms>-<n>
                                                    createServicePhaseId      <serviceId>-phase-<ms>-<n>
src/features/products/editor/runtime-ids.ts         createProductId           product-<ms>-<n>
src/features/sales/creation/runtime-ids.ts          createSaleId              sale-<ms>-<n>
                                                    createSaleItemId          <saleId>-item-<sequence>
src/features/services/adapters/*                    legacy import             service-<slug> (deterministic,
                                                                              development reset only)
```

Snapshot phase ids inside an Appointment reuse the catalog phase id (`domain/appointments/
snapshot.ts`); they are unique only within their item, which the remote key
`(business_id, appointment_id, appointment_item_id, id)` covers.

Within ONE Business this is safe today because one device writes the data. It is not safe once
two devices of the same Business create records independently: the same millisecond and the same
post-launch counter produce the same key, and a remote upsert on `(business_id, id)` would then
silently merge two different records. Derived child ids (`<parentId>-item-<n>`) inherit the
parent's collision risk.

### 5.2 Required strategy (hard prerequisite before V1C push)

- Every top-level generator above emits a UUID v4 (random, 122 bits) — via the Expo-provided
  `expo-crypto` `randomUUID()` (a dependency decision for the phase that changes them, not V1A)
  or an equivalent cryptographically random source. Prefixes may stay for readability
  (`client-<uuid>`); the column type remains TEXT remotely and locally.
- Child generators keep deriving from the parent id (`<parentUuid>-item-<n>`, `<parentUuid>-phase-<n>`):
  once the parent is globally unique, the child key `(business_id, parent_id, id)` is too.
- Existing ids are NEVER rewritten: they were created by a single device per Business and stay
  valid remote keys. Only NEW records must use the new generators.
- Deterministic legacy ids remain a development-only concern (they never reach a bound
  production database through the empty first-run seed).

Until the generators are replaced, no phase may enable multi-device writes for one Business
(V1D restore onto a second device that then creates records is the first scenario affected).

---

## 6. Aggregate boundaries and the child sync contract

```text
CLIENT        clients
SERVICE       services      + service_phases
APPOINTMENT   appointments  + appointment_items + appointment_phases
PRODUCT       products
SALE          sales         + sale_items
```

These match the local transaction boundaries (PERSISTENCE.md §7): a Service edit already replaces
its whole phase list, an Appointment edit its whole item/phase snapshot, a Sale is inserted with
its items. The contract:

- **Top-level row** = unit of revision and tombstone. It carries `sync_version` and `deleted_at`.
- **Nested children** = the parent's complete child set. They carry no sync metadata and no
  tombstone. A push of an aggregate writes the parent row and REPLACES the complete child set in
  one transaction (delete rows not in the set, upsert the others). A child that disappears is
  hard-deleted remotely; the parent revision records that something changed.
- **Stable child ids and ordering** are preserved remotely: the child primary key includes the
  stable child id, and `position` / `item_order` are stored and unique per parent. The
  uniqueness is DEFERRABLE so a future transaction can reorder in place; V1 simply replaces.
- **Child writes bump the parent**: an `after insert/update/delete` row trigger on every child
  table touches the parent, whose before-write trigger advances `updated_at` / `sync_version`.
  A pull therefore sees a phase-only edit as a new revision of the Service.
- Nothing in the remote schema lets a child be synchronized independently of its parent; a
  future engine must not invent per-child revisions.

---

## 7. Revision model

```text
INSERT  created_at = updated_at = now()     sync_version = 1        (client-sent values overwritten)
UPDATE  business_id / id / created_at pinned to the stored row
        no column changed and no child touch   → updated_at / sync_version unchanged
        any column changed (deleted_at included) → updated_at = now(), sync_version = old + 1
        child row inserted / updated / deleted → same bump (once per child row)
```

Properties the engine may rely on:

- `sync_version` is strictly monotonic per row, starts at 1, and is server-assigned; it is not
  contiguous (a child-set replacement bumps several times) and not comparable across rows;
- `updated_at` is the server transaction time; device clocks never participate in ordering;
- the client cannot lower, raise or freeze either value: the trigger ignores what it sends.

Incremental pull (V1D) reads rows where `updated_at > cursor` per table for the bound Business,
ordered by `updated_at`, and applies them idempotently by `(business_id, id)`. Because
`updated_at` is transaction start time, the cursor must be advanced conservatively (overlap
window, idempotent apply); rows already at the acknowledged `sync_version` are skipped.

---

## 8. Tombstones

`deleted_at IS NOT NULL` marks a permanently deleted aggregate. The row stays, remains visible
to its owner through the SELECT policy, and remains a valid foreign-key target, so a sync engine
can download deletions in the same pull as changes.

```text
clients.archived_at   lifecycle (active → archived → restorable)     business fact, edited by the user
clients.deleted_at    sync tombstone of a permanent deletion          sync fact, set by the engine
```

Local permanent deletions map to remote tombstones: Client deletion (only when no history
references it), Service / Product catalog deletion, Appointment deletion (only when unpaid and
without linked Sale), Sale removal when its last line is removed. Children of a tombstoned parent
may be kept or removed; the engine must not read them as live data.

Hard deletes are unavailable to the API (no DELETE grant on aggregates). If an administrator ever
deletes rows in SQL, the foreign keys decide: children cascade with their parent; cross-entity
references (`appointments.client_id`, `sales.client_id`, `sales.appointment_id`) and
`business_id` are RESTRICT, so history is never erased by a cascade. Deleting a Business or an
Auth user with operational rows is therefore refused until those rows are removed explicitly.

---

## 9. Conflict contract (design for V1E — not implemented)

Per aggregate row the device keeps (V1B) the last **acknowledged remote `sync_version`** and a
local **dirty** flag (the outbox entry). The server holds the **current remote `sync_version`**.

```text
remote == acknowledged   local clean   → nothing to do
remote == acknowledged   local dirty   → safe push: upsert aggregate; expect version = ack + n; store new ack
remote  > acknowledged   local clean   → safe pull: apply remote aggregate to SQLite; store new ack
remote  > acknowledged   local dirty   → CONFLICT
```

A push is conditional: the upsert RPC compares the row's current `sync_version` with the
acknowledged one the device sends and refuses the write when they differ (the device then pulls
and enters the conflict path). No device-time last-write-wins exists anywhere.

V1 conflict resolution is deterministic and conservative, per aggregate:

```text
one side tombstoned, other side edited     keep the tombstone (deletions are explicit user actions),
                                           except a Sale / Appointment with a payment → keep the row
both edited, APPOINTMENT / SALE / SERVICE  keep the remote aggregate, re-queue the local one as a
                                           conflict record for the user (history is never merged)
both edited, CLIENT                        field-wise: identity fields from the newer server
                                           revision, archived_at from whichever side set it
PRODUCT stock_quantity                     never merged arithmetically in V1: keep remote, surface
                                           the local count as a conflict record
```

Conflicts are recorded locally, never silently dropped, and never resolved by wall clock. No
CRDT, no operational transform.

---

## 10. Future local outbox (design for V1B — not implemented)

Preferred model: one SQLite outbox table written in the SAME transaction as the business
mutation, instead of `sync_status` columns on every table.

```sql
CREATE TABLE sync_outbox (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregate      TEXT NOT NULL CHECK (aggregate IN ('CLIENT','SERVICE','APPOINTMENT','PRODUCT','SALE')),
  entity_id      TEXT NOT NULL,
  operation      TEXT NOT NULL CHECK (operation IN ('UPSERT','DELETE')),
  enqueued_at    TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  UNIQUE (aggregate, entity_id)          -- one pending entry per aggregate; a later mutation
);                                       -- refreshes enqueued_at instead of adding a row

CREATE TABLE sync_state (
  aggregate      TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  acknowledged_sync_version INTEGER NOT NULL,
  PRIMARY KEY (aggregate, entity_id)
);
-- plus souris_metadata keys: sync_pull_cursor_<table>, sync_bootstrap_state
```

Contract:

- every store mutation that changes an aggregate enqueues `(aggregate, entity_id, UPSERT|DELETE)`
  inside `runInTransaction` — the mutation and its outbox entry commit or roll back together;
- the worker reads the outbox in `seq` order, loads the CURRENT aggregate from SQLite (not a
  stored payload), converts at the boundary (§3), and performs an idempotent conditional upsert
  keyed by `(business_id, id)`; success deletes the entry and updates `sync_state`;
- a DELETE entry sends a tombstone (`deleted_at`), never a remote hard delete;
- an entity that no longer exists locally with an UPSERT entry is treated as DELETE;
- retries are bounded with backoff; permanent failures stay in the outbox with `last_error` and
  are visible to the user, never discarded;
- the outbox is local bookkeeping: it is not part of the snapshot the UI hydrates, and it is not
  uploaded.

---

## 11. Bootstrap / restore rules (design for V1C / V1D — not implemented)

First sync of a bound Business, decided from row counts on BOTH sides (tombstones count as
remote rows):

```text
local populated   remote empty       → candidate initial upload (V1C): push every aggregate, then set ack versions
local empty       remote populated   → candidate restore (V1D): download the complete Business snapshot
local populated   remote populated   → STOP: never choose local-wins or remote-wins silently; record the
                                       state, show an explicit reconciliation entry point (V1E)
local empty       remote empty       → nothing; normal incremental sync starts
```

"Local empty" means no operational row at all (the seed marker alone does not count). The
decision is stored in `souris_metadata` so it is taken once per device and never re-run after
data exists on both sides.

New-device restore:

```text
sign in → resolve Business (AUTH.md §5) → bind the empty local database
→ detect empty local DB → download the complete Business snapshot (every table, tombstones excluded)
→ convert at the boundary → populate SQLite in ONE transaction (children with their parents,
  stock as stored, payments as stored) → write ack versions and pull cursors → UI continues reading SQLite
```

A restore that fails midway leaves the database empty (transaction rollback), never partially
restored. A device already bound to another account keeps the DEVICE_ACCOUNT_CONFLICT behavior
(AUTH.md §6).

---

## 12. Image boundary

`products.image_uri` is a device-local file path under the app's documents directory
(PERSISTENCE.md §9). It is never canonical cloud data and has no remote column in V1A.

V1F will add: a Supabase Storage object per Product image, addressed by a stable object path
(e.g. `<business_id>/products/<product_id>/<hash>.<ext>`) stored in a remote column, with the
mapping `local app-owned file ↔ Storage object ↔ restored local cache/file` maintained by the
sync worker, Storage RLS on the object path prefix, and image bytes never in Postgres or SQLite.

---

## 13. Security review (V1A)

Verified by executing both migrations, in order, in an isolated in-process Postgres (PGlite) with
a stubbed `auth` schema and the `anon` / `authenticated` roles, then running the checks below as
those roles. The harness is a scratch script, not part of the repository; the same checks are
listed in `supabase/README.md` for the Supabase SQL Editor.

```text
User A SELECT Business B rows                       NO   (0 rows)
User A INSERT using Business B id                   NO   (42501, RLS with check)
User A UPDATE a row to Business B                   NO   (business_id pinned by trigger; policy check)
Business A child referencing Business B parent      NO   (23503, composite FK)
anon SELECT / RPC on operational data               NO   (42501, no grant)
owner SELECT tombstoned rows                        YES
owner hard DELETE an aggregate row                  NO   (42501, no grant); children: own Business only
server-owned metadata                               client-sent created_at / updated_at / sync_version ignored
service_phases insert / update / delete             services.sync_version increases (no-op update: unchanged)
appointment_items / _phases insert / update / delete appointments.sync_version increases (no-op: unchanged)
sale_items insert / update / delete                 sales.sync_version increases (no-op: unchanged)
deleted_at set or cleared on any aggregate          sync_version increases
businesses after the privilege revoke               owner SELECT / INSERT / UPDATE and the 23505
                                                    duplicate rule unchanged; DELETE / TRUNCATE → 42501
```

---

## 14. Explicit non-goals of V1A

No runtime sync, no outbox, no upload, no restore, no background task, no image upload, no
conflict UI, no local schema change.

### 14.1 `database-types.ts` is intentionally incomplete

`src/infrastructure/supabase/database-types.ts` is the hand-written supabase-js `Database` type.
It covers `businesses` ONLY. It does not describe the nine operational tables of this migration,
and it will not until V1B introduces the first operational adapter, because a type without a
consumer is dead code and would drift. Anyone reading that file must not take it as the full
remote schema: the migration files under `supabase/migrations/` are the source of truth.

### 14.2 Prerequisites before V1C (real push / pull)

1. Local monetary values persisted as integer cents (§3.1).
2. Globally collision-resistant ids from every runtime generator (§5.2).
3. V1B outbox and acknowledged versions (§10).
