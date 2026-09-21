# Souris — Cloud Sync

## 1. Purpose and status

Cloud Sync gives the operational data of a Business (Clients, Services, Appointments, Products,
Sales) a remote home in Supabase so it can be backed up, restored on a new device, and later
shared between devices. It does NOT change how the application works: SQLite stays the
operational database and the UI keeps reading and writing it.

```text
V1A    Remote Schema & Sync Contract        done — remote schema + contract (§3–§9)
V1B    Local Outbox & Sync Metadata         done — local outbox + acknowledged revisions (§10)
V1C-0  Local Sync Prerequisites             done — UUID v4 top-level ids (§5) + integer-cents persistence (§3.1)
V1C    Initial Upload + Incremental Push    done — bootstrap decision, push RPC, push worker, runner (§15)
V1D    Pull + New Device Restore            done — read RPC, approved transactional restore, incremental pull (§16)
V1D.1  Seamless Bootstrap                   done — automatic initial upload and new-device restore, first-sync gate (§17)
       Client notes                         done — one additive nullable column carried by the CLIENT aggregate (§18)
       Appointment discount                 done — two additive nullable columns carried by the APPOINTMENT aggregate (§19)
       Calendar Blocks                      done — a NEW aggregate type, CALENDAR_BLOCK, through the same engine (§20)
V1E    Conflict / Retry Hardening
V1F    Product Image Sync
```

State after V1A: the remote operational tables, constraints, triggers, RLS and grants exist in
`supabase/migrations/20260914120000_create_operational_sync_schema.sql`. No application code
reads or writes them.

State after V1B: SQLite schema v7 adds `sync_outbox` and `sync_state` (§10). Every local
business mutation records its aggregate in the outbox inside its own transaction.

State after V1C-0: the two hard prerequisites of a real transfer are met locally. Every NEW
Client, Service, Appointment, Product and Sale id is a UUID v4 (§5.2), and SQLite schema v8
persists every price as integer cents under the remote column names (§3.1,
PERSISTENCE.md §4).

State after V1C: local data is UPLOADED. A bound device with a live session decides what its
first sync is (§11) and pushes every pending outbox entry through ONE atomic, version-conditional Postgres function
(§15). At the worker level, uploading the EXISTING data of a device into an empty remote Business
waits for one Business-scoped approval (§11.1) — given by hand in V1C, automatically by the runner
since V1D.1 (§17). The remote acknowledges with its
`sync_version`, stored in `sync_state`. It is a one-way
push: nothing is pulled, restored or merged (V1D / V1E), no image is uploaded (V1F), and no
SQLite schema change was needed (still v8). The UI is unchanged and must still not claim a
backup: until V1D a remote copy cannot bring data back to a device (`docs/architecture/AUTH.md`
§1). The remote migration `20260917120000_create_sync_push_functions.sql` must be applied by hand
(`supabase/README.md`); until it is, every run stops at its first request and nothing is lost.

State after V1D: data comes BACK. An EMPTY device bound to a populated Business is
`RESTORE_REQUIRED`; after one Business-scoped approval (§11.2) the next run downloads the
complete Business through ONE consistent read function, validates all of it, and rebuilds SQLite in
ONE local transaction (§16.4) — acknowledged versions, clean outbox, `ALREADY_SYNCED`. From then on
every run pushes, then pulls what changed remotely (§16.5): a remote revision is applied only to a
locally CLEAN aggregate; remote newer + local dirty is a reported conflict that overwrites neither
side (§16.6); remote tombstones follow the local deletion rules (§16.7); nothing that came from the
remote is ever pushed back. (V1D shipped a production restore prompt; V1D.1 removed it, §17.) Still
no conflict RESOLUTION (V1E), no image sync (V1F), no SQLite schema change (still v8). The remote migration
`20260917200000_create_sync_pull_function.sql` must be applied by hand; until it is, restore and
pull fail harmlessly (`UNKNOWN`) and the V1C push keeps working.

State after V1D.1: the first sync is SEAMLESS — the user never sees, approves or triggers it (§17).
A new account is `EMPTY`; its first record is uploaded on its own (the foreground tick notices the
stale `EMPTY`); a new device or a reinstall is restored on its own after sign-in, with no prompt.
The engine is unchanged: the worker still refuses both transitions without the Business-scoped
approval, and the cloud sync runner — under a LIVE session bound to that Business, never offline or
signed out — is what gives it, once, then runs the same worker again. Two populated sides stay
`RECONCILIATION_REQUIRED`: never approved, never local-wins or remote-wins. An EMPTY device does
not become operational before a run OF THE CURRENT SESSION established what its remote Business
holds (the first-sync gate, §17.3) — a decision stored by an earlier launch is not enough: nothing
can be created on top of data that has not arrived yet. A device that holds data is never held
back. A release build contains no sync UI — only, for that empty device, « Récupération de vos
données… » while it waits and a plain "Impossible de récupérer vos données / Réessayer" state. No schema change, no remote migration.

---

## 2. Local-first model

```text
UI ──► feature provider ──► SQLite (source of truth + sync_outbox, one transaction) ──► V1C push worker (§15) ──► Supabase
                                        ▲                                                            │
                                        └──────────────────── V1D pull / restore (§16) ◄─────────────┘
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
                    notes? (§18), archived_at?, + sync metadata
services            (business_id, id) PK, name, type SERVICE|TECHNIQUE, price_cents, active, + sync metadata
service_phases      (business_id, service_id, id) PK, position (unique per service, deferrable),
                    name, duration_minutes >= 0, requires_staff
appointments        (business_id, id) PK, client_id → clients, staff_member_id, start_at, status,
                    notes?, cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?,
                    paid_at?, card_amount_cents?, cash_amount_cents?,
                    discount_percent?, discount_amount_cents? (§19), + sync metadata
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
price_cents / unit_price_cents INTEGER   price_cents / unit_price_cents    none — identical integer cents since schema v8 (V1C-0);
                                                                           the euro view exists only in the row mappers (values.ts)
booleans INTEGER 0/1                     boolean                           values.ts helpers
instants ISO-8601 TEXT                   timestamptz                       Date ⇄ ISO string
products.image_uri (device file path)    — (absent)                        never uploaded; V1F adds a Storage reference
birth_date (legacy, unused)              — (absent)                        never uploaded
business_id TEXT                         business_id uuid                  must be the remote Business UUID (bound device)
```

A device whose `business_id` values are not the bound remote UUID (an unbound development
database using `fixture-business`) cannot sync; binding (PERSISTENCE.md §4b) is the prerequisite.

### 3.1 Money — hard prerequisite before V1C (DONE in V1C-0, schema v8)

Until schema v7, `services.price`, `appointment_items.price`, `products.price` and
`sale_items.unit_price` were SQLite `REAL` euro numbers; only `card_amount_cents` /
`cash_amount_cents` (appointments, sales) were integer cents. Converting at the sync boundary on
every push and pull was never an acceptable substitute: a euro `REAL` round-tripped through cents
is not guaranteed to be byte-identical, so a pull would report spurious local changes and the
conflict contract (§9) would misfire.

Schema v8 (Cloud Sync V1C-0, PERSISTENCE.md §4) resolved it locally, in one forward migration:

```text
services.price            REAL  →  services.price_cents            INTEGER NOT NULL CHECK >= 0
appointment_items.price   REAL  →  appointment_items.price_cents   INTEGER NOT NULL CHECK >= 0
products.price            REAL  →  products.price_cents            INTEGER NOT NULL CHECK >= 0
sale_items.unit_price     REAL  →  sale_items.unit_price_cents     INTEGER NOT NULL CHECK >= 0
conversion                 CAST(ROUND(value * 100) AS INTEGER)  — 12.50 → 1250, 0.99 → 99; legacy column dropped
```

Local and remote monetary columns are now the same names, the same type and the same exact
integer values; the sync layer copies them without any conversion. The domain keeps its
euro-number contract (`Service.price`, `Product.price`, `AppointmentItem.price`,
`SaleItem.unitPrice`, checked-out amounts already in cents): `values.ts` `toSqlPriceCents`
(the domain `eurosToCents` rounding rule) and `fromSqlPriceCents` (integer ÷ 100, exact at two
decimals) are the ONLY conversion, and a stored value round-trips unchanged. No provider, screen
or domain total changed; the Cash Register and the Appointment expected total were already integer
cents.

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

### 5.1 Runtime generators (since V1C-0)

Every NEW top-level aggregate id is a random UUID v4 (RFC 4122, 122 random bits) produced by
`expo-crypto` `randomUUID()` through ONE module, `src/shared/lib/uuid.ts` (`createUuidV4`),
which refuses to return anything that is not a canonical UUID v4. Child ids keep deriving from
their parent id:

```text
src/features/clients/creation/runtime-ids.ts        createClientId             <uuid v4>
src/features/appointments/creation/runtime-ids.ts   createAppointmentId        <uuid v4>
                                                    createAppointmentItemId    <appointmentId>-item-<order>
                                                    createNewAppointmentItemId <appointmentId>-item-new-<ms>-<n>
src/features/services/editor/runtime-ids.ts         createServiceId            <uuid v4>
                                                    createServicePhaseId       <serviceId>-phase-<ms>-<n>
src/features/products/editor/runtime-ids.ts         createProductId            <uuid v4>
src/features/sales/creation/runtime-ids.ts          createSaleId               <uuid v4>
                                                    createSaleItemId           <saleId>-item-<sequence>
src/features/services/adapters/*                    legacy import              service-<slug> (deterministic,
                                                                               development reset only)
```

Snapshot phase ids inside an Appointment reuse the catalog phase id (`domain/appointments/
snapshot.ts`); they are unique only within their item, which the remote key
`(business_id, appointment_id, appointment_item_id, id)` covers.

Before V1C-0 (inspected 2026-09-14) every generator was `<prefix>-<Date.now()>-<counter>` with a
module counter restarting at 1 on each launch — safe for one device per Business, not for two
devices creating records independently (same millisecond + same post-launch counter = same key,
silently merged by a remote upsert on `(business_id, id)`). Records created that way keep their
ids: they were produced by a single device per Business and stay valid, unique remote keys.

### 5.2 Strategy (hard prerequisite before V1C push — DONE in V1C-0)

- Every top-level generator emits a plain UUID v4, without prefix; the column type stays TEXT
  remotely and locally, so old `<prefix>-<ms>-<n>` ids and new UUIDs coexist in the same column
  and nothing distinguishes them.
- Child generators keep deriving from the parent id (`<parentUuid>-item-<n>`,
  `<parentUuid>-phase-<ms>-<n>`): once the parent is globally unique, the child key
  `(business_id, parent_id, id)` is too. Child identity semantics are unchanged.
- Existing ids were NEVER rewritten: no data migration, no id rewrite, no fixture change. Only
  NEW records use the new generators.
- Deterministic legacy ids remain a development-only concern (they never reach a bound
  production database through the empty first-run seed).
- Covered by tests: canonical v4 shape, no repeat across 10 000 generations, distinct across a
  simulated restart in the same frozen millisecond, refusal of a non-UUID from the platform, and
  each feature generator (top-level UUID, derived child ids).

Multi-device creation for one Business is therefore safe on the identity side; enabling it
still waits for the push / pull phases.

---

## 6. Aggregate boundaries and the child sync contract

```text
CLIENT        clients
SERVICE       services      + service_phases
APPOINTMENT   appointments  + appointment_items + appointment_phases
PRODUCT       products
SALE          sales         + sale_items
CALENDAR_BLOCK calendar_blocks                                  (§20)
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

Incremental pull (V1D, §16.5) reads the aggregates where `updated_at > cursor − overlap` for the
bound Business and applies them idempotently by `(business_id, id)`. Because `updated_at` is
transaction START time, a write can commit after a pull that is already "later" than it: the cursor
is a server time, the device re-reads a 5-minute overlap before it, and rows already at the
acknowledged `sync_version` are skipped.

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

## 9. Conflict contract (detection implemented in V1C push — §15.4 — and V1D pull — §16.6; resolution is V1E)

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
and enters the conflict path). No device-time last-write-wins exists anywhere. V1C implements
exactly this detection and STOPS there: a conflict is reported and the entry stays pending
(§15.4); nothing below is implemented yet.

V1E conflict resolution (design) is deterministic and conservative, per aggregate:

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

## 10. Local outbox and acknowledged revisions (V1B — implemented, schema v7)

Source: `src/persistence/schema.ts` (v7), `src/persistence/sync/{aggregate,outbox,state}.ts`, the
five stores under `src/persistence/stores/`. PERSISTENCE.md §4 (migration) and §7c (mutation
integration) hold the local-layer view; this section is the sync contract.

### 10.1 Schema

```sql
CREATE TABLE sync_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,   -- FIFO position; never reused
  business_id     TEXT NOT NULL,                       -- bound Business UUID (business_profile.id)
  aggregate_type  TEXT NOT NULL CHECK (aggregate_type IN ('CLIENT','SERVICE','APPOINTMENT','PRODUCT','SALE')),
  aggregate_id    TEXT NOT NULL,                       -- the aggregate's own stable id
  operation       TEXT NOT NULL CHECK (operation IN ('UPSERT','DELETE')),
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),   -- +1 per coalesced mutation
  created_at      TEXT NOT NULL,                       -- ISO instant of the first pending mutation
  updated_at      TEXT NOT NULL,                       -- ISO instant of the latest coalesced mutation
  attempt_count   INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error      TEXT,
  next_attempt_at TEXT,                                -- NULL = eligible now
  UNIQUE (business_id, aggregate_type, aggregate_id)   -- ONE current pending record per aggregate
);

CREATE TABLE sync_state (
  business_id     TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL CHECK (aggregate_type IN ('CLIENT','SERVICE','APPOINTMENT','PRODUCT','SALE')),
  aggregate_id    TEXT NOT NULL,
  remote_version  INTEGER NOT NULL CHECK (remote_version >= 1),   -- server-assigned sync_version last acknowledged
  last_synced_at  TEXT NOT NULL,
  PRIMARY KEY (business_id, aggregate_type, aggregate_id)
);
```

Since schema v11 the `aggregate_type` vocabulary of both tables also holds `'CALENDAR_BLOCK'` (§20;
the tables were rebuilt with every row preserved, PERSISTENCE.md §4).

No `sync_status` column exists on any business table. The outbox row carries the aggregate's
identity only — never a payload: the worker reads the CURRENT local aggregate at push time. Both
tables are local bookkeeping: not part of the hydrated snapshot, never uploaded, cleared by the
development reset together with the operational data (PERSISTENCE.md §10).

### 10.2 Aggregate mapping (child → parent)

```text
local write                                                    outbox entry
clients row (insert / identity edit / archive / restore)        CLIENT      UPSERT
clients row permanent deletion                                  CLIENT      DELETE
services row and/or service_phases (any edit, activation)       SERVICE     UPSERT
services row deletion (phases cascade)                          SERVICE     DELETE
appointments row and/or appointment_items / appointment_phases  APPOINTMENT UPSERT
  (create, edit, timing, reorder, item removal, checkout,
   payment correction, previous-day reconciliation)
appointments row permanent deletion                             APPOINTMENT DELETE
products row (edit, activation, manual stock)                   PRODUCT     UPSERT
products stock changed by Sale completion / removal             PRODUCT     UPSERT (one per Product)
products row deletion                                           PRODUCT     DELETE
sales + sale_items completion                                   SALE        UPSERT
sale_items trimmed by an Appointment-linked Product removal     SALE        UPSERT (its child set changed)
sales row emptied and deleted by that removal                   SALE        DELETE
```

Children (`service_phases`, `appointment_items`, `appointment_phases`, `sale_items`) never create
an entry of their own; the remote contract (§6) replaces the parent's complete child set.

### 10.3 Atomic write rule

`markAggregateUpserted(db, type, id)` / `markAggregateDeleted(db, type, id)` are called by the
store INSIDE its own `runInTransaction`, after the business statements. Mutation and outbox row
commit or roll back together (verified both ways: a failing outbox write leaves the business row
unchanged; a failing business write leaves no outbox row). Nothing is ever enqueued after a commit,
and no provider or screen touches the outbox.

### 10.4 Business scoping

`business_id` is always `business_profile.id`, read inside the transaction. While the database is
unbound (no `business_profile` row — a fresh install before Business setup, or a development
database) the stores write NO outbox row at all: there is no Business to scope it to, and an
unbound device cannot sync anyway (§3). Data that exists before binding is covered by the V1C
bootstrap decision (§11: local populated / remote empty → approved initial upload of
every aggregate), not by the outbox. Binding itself records nothing. The device-account conflict protection
(PERSISTENCE.md §4b, AUTH.md §6) is unchanged.

### 10.5 Coalescing rules (deterministic, per `(business_id, aggregate_type, aggregate_id)`)

```text
current entry     new mutation   result (same row: id and created_at never change)
—                 UPSERT         INSERT  operation UPSERT, revision 1
—                 DELETE         INSERT  operation DELETE, revision 1
UPSERT            UPSERT         operation UPSERT, revision + 1, updated_at refreshed
UPSERT            DELETE         operation DELETE, revision + 1          (DELETE overrides UPSERT)
DELETE            UPSERT         operation UPSERT, revision + 1          (aggregate recreated with the same id:
                                                                          the current local state is "exists")
DELETE            DELETE         operation DELETE, revision + 1
```

Every coalesced mutation also resets the retry metadata — `attempt_count = 0`,
`last_error = NULL`, `next_attempt_at = NULL` — because that metadata belongs to the revision that
failed: a newer local revision is eligible at once and never inherits a stale failure or backoff.
Three edits of one Client, or a phase edit followed by an activation toggle of one Service,
therefore leave ONE row whose current state is what the worker pushes.

### 10.6 DELETE semantics

A DELETE entry is written in the transaction that deletes the local row and survives it: it holds
`business_id`, `aggregate_type`, `aggregate_id` and nothing else, which is exactly what V1C needs
to send a remote tombstone (`deleted_at`) without reading any local row. A refused deletion (Client
with history, Appointment with payment or linked Sale, Sale removal of a paid Sale) writes no entry.
A DELETE for an aggregate that has no acknowledged remote revision (never pushed) is defined in
§15.5: it is still sent, the remote answers ABSENT when it holds no such row, and the entry
settles WITHOUT creating a tombstone — never a hard delete (§8), never a blind local settle.

### 10.7 sync_state meaning

`sync_state` is the remote `sync_version` (§7) this device last ACKNOWLEDGED for an aggregate, with
the acknowledgement instant. It is not UI state. No local mutation writes it; the migration creates
it empty and existing rows receive no fabricated version — a local-only aggregate has no row, which
means "no acknowledged remote revision". Only the V1C/V1D worker writes it, with the server-assigned
version it actually observed, and V1E compares it with the current remote version (§9).
`writeAcknowledgedRemoteVersion` refuses non-positive or non-integer versions; the CHECK does too.

### 10.8 Worker contract (implemented in V1C — §15.3)

```text
read an eligible entry (business_id = bound id, next_attempt_at IS NULL or <= now), remember (id, revision)
UPSERT → load the CURRENT aggregate from SQLite; missing locally ⇒ treat as DELETE
         convert at the boundary (§3); conditional upsert keyed (business_id, id) against the acknowledged version (§9)
DELETE → send a tombstone (deleted_at); never a remote hard delete
success → ONE transaction: settleSyncOutboxEntry(id, revision) + writeAcknowledgedRemoteVersion(observed server version)
          settle is CONDITIONAL on the revision: a mutation coalesced during the push keeps the entry
          (with its newer revision) and it is pushed again with the fresh local state
failure → recordSyncOutboxFailure(id, message, next_attempt_at)   bounded backoff, never discarded
ordering → by aggregate dependency (CLIENT, SERVICE, PRODUCT, APPOINTMENT, SALE — remote FKs) then by id
```

The bootstrap decision lives in `souris_metadata` (`sync_bootstrap`, §11), and so do the V1D pull
cursor (`sync_pull_cursor`, §16.5) and the restore approval (`sync_initial_restore_approval`, §11.2).

---

## 11. Bootstrap / restore rules (bootstrap decision implemented in V1C; restore in V1D; automatic approvals in V1D.1)

First sync of a bound Business, decided from the population of BOTH sides (tombstones count as
remote rows). Source: `src/persistence/sync/bootstrap.ts` (`classifySyncBootstrap`, pure), driven
by the push worker. This table is the WORKER's contract; "approved" means the approval of §11.1 /
§11.2 is recorded for this Business — which, since V1D.1, the cloud sync runner does on its own the
moment a run answers one of the two one-sided STOPs (§17). The user is never asked:

```text
acknowledged state on the device          → ALREADY_SYNCED           push
local empty       remote empty            → EMPTY                    nothing to upload. NOT a push licence for data
                                                                      created later (§11.0)
local populated   remote empty            → INITIAL_UPLOAD_REQUIRES_APPROVAL
                  NOT approved                                        STOP — nothing enqueued, nothing pushed (§11.1)
local populated   remote empty            → INITIAL_UPLOAD           enqueue every local aggregate, push
                  approved for THIS Business
local empty       remote populated        → RESTORE_REQUIRED         STOP — nothing fetched, nothing written (§11.2)
                  NOT approved
local empty       remote populated        → RESTORE_REQUIRED         the run performs the transactional restore
                  approved for THIS Business                          (§16.4) → ALREADY_SYNCED
local populated   remote populated        → RECONCILIATION_REQUIRED  STOP — never local-wins or remote-wins
                  (no acknowledged state)                             silently; NO approval changes anything here
```

Classification is automatic and harmless: it reads one remote count and writes no operational or
outbox row. The ONLY thing that makes data leave the device automatically is real acknowledged
state (`ALREADY_SYNCED`: `sync_state` holds a server-returned version for this Business) or a
recorded approval — and an approval is only ever recorded for the ONE-sided cases (one side empty),
by the runner, under a live session bound to that exact Business (§17).

### 11.0 What a stored decision still licenses — EMPTY is not an acknowledgement

`EMPTY` means "both sides held nothing when we looked". It says nothing about data created
afterwards, and it is NOT an acknowledgement that this device and Business are synchronized. A
pending outbox proves nothing either: every local mutation of a bound device writes one.

```text
isStoredPushDecisionCurrent(db, businessId, decision)       src/persistence/sync/bootstrap.ts — the ONE rule,
                                                             used by the worker, the periodic check and the approval
INITIAL_UPLOAD   always            the recorded approval for this Business: an interrupted upload resumes
ALREADY_SYNCED   only while sync_state really holds an acknowledged revision for this Business
EMPTY            only while NO local aggregate AND NO outbox entry exists — and, since V1D, the WORKER
                 counts the remote again at every run even then (see below)
STOP decisions   never             re-evaluated at every run
```

A stored decision that is no longer current is simply classified again at the next run, against the
REAL remote. So `EMPTY` → the first Client / Service / Product → the next run finds `EMPTY` stale →
local populated, remote empty, no acknowledged state → `INITIAL_UPLOAD_REQUIRES_APPROVAL` → the
runner approves and runs again → `INITIAL_UPLOAD` (§17). If the remote was populated meanwhile:
`RECONCILIATION_REQUIRED`, which nothing approves.

Since V1D a stored `EMPTY` is additionally re-counted by the worker at EVERY run (one
`sync_count_business_aggregates` call, nothing else): "the remote was empty when we looked" says
nothing about now. A device that kept trusting it would never discover that its Business was
populated meanwhile from another device — it would sit on an empty screen instead of reaching
`RESTORE_REQUIRED`, and its first new record would turn it into `RECONCILIATION_REQUIRED`.
`isStoredPushDecisionCurrent` is unchanged (an empty device with a stored `EMPTY` still has no initial
upload to approve, and the foreground tick of an EMPTY, idle device still never polls); only the
worker's shortcut was removed. Under a fresh `EMPTY` the run may only settle deletions of
aggregates the remote never held (`ABSENT`, §15.5): the worker refuses any UPSERT under `EMPTY`,
including an aggregate that appears while the run is in flight.

Found in real E2E testing (2026-09-17): the first V1C build trusted a stored `EMPTY` as a durable
push decision, so records created after it were uploaded without going through the initial-upload transition. Regression:
`sync-push-worker.test.ts` › "EMPTY is not a synchronization acknowledgement".

"Local populated" means at least one row in `clients`, `services`, `products`, `appointments` or
`sales`; the seed marker, the account binding and the sync bookkeeping do not count. The remote
side is ONE call, `sync_count_business_aggregates(business_id)` (§15.2): an unreachable remote
means no decision at all (nothing stored, nothing enqueued, retried at the next run) — "could not
ask" is never read as "empty".

The decision is stored in `souris_metadata` under `sync_bootstrap` as
`{ businessId, decision, decidedAt }`:

- a stored push decision is trusted only while it is still current (§11.0); otherwise the run
  classifies again. `INITIAL_UPLOAD` is the durable one; `ALREADY_SYNCED` lasts as long as the
  acknowledged state it describes; `EMPTY` lasts only while the device stays empty;
- a STOP decision is stored for diagnosis but RE-EVALUATED at the next run. The two one-sided STOPs
  are answered by the runner's automatic approval (§17); a stored one therefore means "the automatic
  first sync did not complete" and the periodic tick retries it (`isSyncBootstrapPending`).
  `RECONCILIATION_REQUIRED` has no automatic way out (an explicit reconciliation, or an explicit
  cleanup of a test Business): while it stands NOTHING is pushed — including entries created
  meanwhile — and the periodic tick makes no request;
- a record written for another Business id is ignored, never inherited;
- the development reset deletes the record with the sync tables (PERSISTENCE.md §10).

### 11.1 Initial upload — one-time, Business-scoped approval (automatic since V1D.1)

"Local populated + remote empty" is a new account that just created its first record, or the pilot
device. The WORKER never uploads existing data on its own: without an approval the run returns
`BLOCKED / INITIAL_UPLOAD_REQUIRES_APPROVAL` — no outbox entry is created for the existing
aggregates, no push request is made, entries recorded by mutations meanwhile are not pushed either.
The approval is an internal safety primitive, not a user decision: the runner records it and runs
the worker again (§17).

```ts
approveInitialUpload(db, businessId, now?)   // src/persistence/sync/bootstrap.ts
  → { status: 'APPROVED', approval: { businessId, approvedAt } }
  → { status: 'REFUSED', reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'NOT_REQUIRED' }
```

- **One caller.** `CloudSyncRunner`, after a run answered `INITIAL_UPLOAD_REQUIRES_APPROVAL` for the
  Business of its live session (§17). No screen — product or development — can give it; a
  source-level test locks that in.
- **Exact Business.** It is refused unless the database is bound to that very UUID
  (`NOT_BOUND` / `BUSINESS_MISMATCH`), and refused as `NOT_REQUIRED` once a push decision is stored
  (sync is already running — there is no initial upload left to approve).
- **Persisted, Business-scoped.** Stored in `souris_metadata['sync_initial_upload_approval']` as
  `{ businessId, approvedAt }`; it survives a restart. `readInitialUploadApproval(db, businessId)`
  ignores a record naming another Business id (left over, copied or forged) and any unreadable value:
  an approval for Business A can never authorize Business B.
- **Records only.** Approving enqueues nothing and sends nothing. The NEXT run classifies both sides
  again, so the remote is re-checked at upload time: a Business that became populated meanwhile is
  `RECONCILIATION_REQUIRED` whatever was approved, and an empty local database is `EMPTY`.
- **One-time.** The run that classifies `INITIAL_UPLOAD` enqueues the aggregates, stores the decision
  and DELETES the approval in ONE SQLite transaction. From then on the stored `INITIAL_UPLOAD`
  decision carries the upload: an interrupted upload resumes from the remaining outbox entries, after
  a restart too, without a new approval and without enqueueing anything twice.
- **Cleared by the development reset** together with the decision (PERSISTENCE.md §10): reseeded
  fixtures are never covered by an approval given to the data they replaced.

Consequence for EVERY Business: a brand-new account is `EMPTY` until its owner creates her first
record; from that moment the stored `EMPTY` is stale (§11.0), the next trigger — the foreground tick
at the latest — classifies `INITIAL_UPLOAD_REQUIRES_APPROVAL`, and the runner turns it into
`INITIAL_UPLOAD` within that same trigger. Known trade-off: a development device holding fixtures
and bound to a fresh, EMPTY Business uploads them too — the device cannot tell them from real data.
A Business that already holds data is never touched (`RECONCILIATION_REQUIRED`).

**Enqueue.** In ONE SQLite transaction with the stored decision and the consumed approval,
`enqueueInitialUpload` inserts an `UPSERT` outbox entry (revision 1) for every local aggregate of the bound Business that
has neither a pending entry nor an acknowledged version. Existing entries are left untouched (no
revision bump, no operation change); business-scoped rows stamped with another Business id are not
enqueued; `sync_state` receives NOTHING. The aggregates are queued, not declared synchronized: each
one is acknowledged only when the server returns its version, and an interrupted upload simply
resumes from the remaining entries.

**This is not a seed.** Nothing is bundled, generated or hardcoded: the mechanism uploads whatever
the bound device already holds, for whichever Business it is bound to. A normal new account has an
empty database (empty first-run seed) and classifies as `EMPTY`, which uploads nothing and licenses
nothing (§11.0). There is no email, user id or
Business id anywhere in the code path, `~/.souris-private-data` is never read, and the device-account
binding rules are untouched: an existing Business is never rebound, and a populated remote Business
(e.g. a test one) is a STOP, not a merge target. The pilot transfer is §15.7.

### 11.2 Initial restore — Business-scoped approval (V1D; automatic since V1D.1)

"Local empty + remote populated" is a new phone or a reinstall — and also a development device after
a wipe. The WORKER never rebuilds a database on its own: without an approval the run returns
`BLOCKED / RESTORE_REQUIRED` and does NOT even fetch the dataset. As for the upload, the approval is
an internal safety primitive that the runner records before running the worker again (§17). It is
safe to give automatically because a restore only ever fills an EMPTY database with the data of the
Business the signed-in owner is bound to: nothing local can be lost.

```ts
approveInitialRestore(db, businessId, now?)   // src/persistence/sync/bootstrap.ts
  → { status: 'APPROVED', approval: { businessId, approvedAt } }
  → { status: 'REFUSED', reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'NOT_REQUIRED' | 'LOCAL_NOT_EMPTY' }
```

- **One caller.** `CloudSyncRunner`, after a run answered `RESTORE_REQUIRED` for the Business of its
  live session (§17). A source-level test locks that in.
- **Exact Business.** Refused unless the database is bound to that very UUID; refused as
  `NOT_REQUIRED` once the device synchronizes (acknowledged state, or a current push decision);
  refused as `LOCAL_NOT_EMPTY` when any operational row exists — a restore NEVER runs over local data.
- **Persisted, Business-scoped.** `souris_metadata['sync_initial_restore_approval']` =
  `{ businessId, approvedAt }`. A record naming another Business id authorizes nothing.
- **Records only.** Approving fetches nothing and writes no row. The NEXT run classifies both sides
  again; only "local empty + remote populated" for that same Business restores. Local populated
  meanwhile → `RECONCILIATION_REQUIRED`, whatever was approved.
- **Retry-safe, not one-shot.** Unlike the upload approval (consumed by the enqueue it authorizes),
  the restore approval is cleared INSIDE the restore transaction, i.e. only when a restore commits.
  A failed or interrupted restore leaves SQLite untouched and the approval pending: the next trigger
  (launch, foreground, or the 2-minute tick) — after a restart too — simply tries again. There is no intermediate "restoring" state to repair.
- **Cleared by the development reset** with the rest of the sync bookkeeping.

The restore itself is §16.4. A device already bound to another account keeps the
DEVICE_ACCOUNT_CONFLICT behavior (AUTH.md §6).

---

## 12. Image boundary

`products.image_uri` is a device-local file path under the app's documents directory
(PERSISTENCE.md §9). It is never canonical cloud data and has no remote column in V1A.

V1F will add: a Supabase Storage object per Product image, addressed by a stable object path
(e.g. `<business_id>/products/<product_id>/<hash>.<ext>`) stored in a remote column, with the
mapping `local app-owned file ↔ Storage object ↔ restored local cache/file` maintained by the
sync worker, Storage RLS on the object path prefix, and image bytes never in Postgres or SQLite.

---

## 13. Security review (V1A; V1C functions in §15.6)

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

## 14. Explicit non-goals of V1A / V1B / V1C-0 / V1C / V1D

V1A: no runtime sync, no outbox, no upload, no restore, no background task, no image upload, no
conflict UI, no local schema change.

V1B: no remote write or read of operational data, no Supabase operational repository, no push or
pull worker, no network retry, no bootstrap upload, no restore, no conflict handling, no timer or
background task, no image sync, no change to runtime ids, no money migration. The local outbox is
written and tested; nothing consumes it yet.

V1C-0: no remote write or read of operational data, no Supabase operational adapter, no push or
pull worker, no bootstrap upload, no restore, no conflict handling, no change to the domain
money contract (euro numbers stay the domain / UI representation), no rewrite of any existing id,
no change to child id semantics. Only the two local prerequisites: UUID v4 top-level generators
(one new dependency, `expo-crypto`) and SQLite schema v8 (integer cents).

V1C: no automatic upload of pre-existing data (approval by hand only — automatic since V1D.1, §17), no approval UI, no
pull, no restore, no conflict resolution or conflict UI, no merge, no image sync, no
background task, no batching, no SQLite schema change, no production seed, no pilot data in the
repository, no automatic rebind of a Business, no `service_role` key, no user-visible sync status.

V1D: no conflict resolution, no conflict records, no merge (a conflict is reported and both sides are
left alone), no reconciliation of two populated datasets (`RECONCILIATION_REQUIRED` stays a STOP), no
automatic restore (V1D shipped a confirmation prompt; V1D.1 replaced it, §17), no image sync (`image_uri` stays
local-only: absent after a restore, untouched by a pull), no pagination of the remote read, no
realtime subscription, no background task, no SQLite schema change, no pilot data or identifier in
the repository, no `service_role` key.

V1D.1: no change to the push / pull / restore engine, to the outbox, `sync_state`, the cursor, the
tombstones, the conflict detection or the backoff; no reconciliation of two populated datasets
(`RECONCILIATION_REQUIRED` stays a STOP and is never approved); no sync UI of any kind, no
user-visible sync status; no background task; no SQLite schema change; no remote migration.

### 14.1 `database-types.ts` is intentionally incomplete

`src/infrastructure/supabase/database-types.ts` is the hand-written supabase-js `Database` type.
It covers the `businesses` table, the two V1C functions (`sync_push_aggregate`,
`sync_count_business_aggregates`) and the V1D read function (`sync_pull_business_aggregates`, typed
as returning `Json`) — exactly what the application calls. It does NOT describe the nine operational
tables: the sync adapter never touches them directly (every operational write goes through the push
function, every read through the pull function, whose answer is validated at run time by
`parseRemoteBusinessSnapshot` rather than trusted through a static type), and a type without a
consumer would drift. The migration files under
`supabase/migrations/` are the source of truth for the remote schema.

### 14.2 Prerequisites before V1C (all done)

1. ~~Local monetary values persisted as integer cents (§3.1)~~ — done in V1C-0 (schema v8).
2. ~~Globally collision-resistant ids from every runtime generator (§5.2)~~ — done in V1C-0.
3. ~~V1B outbox and acknowledged versions (§10)~~ — done.

---

## 15. Initial upload + incremental push (V1C — implemented)

```text
src/persistence/sync/remote-gateway.ts     the port: payload shapes (remote column names), push request /
                                           result, SyncRemoteError (stable codes only)
src/persistence/sync/aggregate-payload.ts  CURRENT local aggregate → payload (raw rows, exact cents, Business scope)
src/persistence/sync/bootstrap.ts          first-sync classification + stored decision (§11)
src/persistence/sync/push-worker.ts        createSyncPushWorker().run(businessId) — explicit, single-flight
src/persistence/sync/outbox.ts             + enqueueInitialUpload, loadEligibleSyncOutbox, revision-conditional failure
src/persistence/sync/state.ts              + clearAcknowledgedRemoteVersion, hasAcknowledgedRemoteState
src/infrastructure/supabase/sync-gateway.ts the port bound to the two RPCs (publishable client + owner session)
src/providers/CloudSyncRunner.tsx          WHEN the worker runs (renders nothing)
src/persistence/testing/fake-sync-remote.ts in-memory remote with the RPC contract (tests only)
supabase/migrations/20260917120000_create_sync_push_functions.sql
```

### 15.1 Why an RPC (remote write strategy)

An aggregate push is: compare the remote `sync_version` with the acknowledged one, upsert the
parent row, replace the complete child set. With PostgREST table calls those are several HTTP
requests, i.e. several transactions: a dropped connection would leave a Service without its phases
or an Appointment with half its items, and the version comparison would race with another device.
That partial remote state is not acceptable, so ALL operational writes go through one Postgres
function, which PostgREST runs in one transaction. The application never writes an operational
table directly.

### 15.2 The two functions

```sql
public.sync_count_business_aggregates(p_business_id uuid) → bigint
  -- rows of clients + services + appointments + products + sales for the Business, tombstones included

public.sync_push_aggregate(p_business_id uuid, p_aggregate_type text, p_aggregate_id text,
                           p_operation text, p_expected_version bigint, p_payload jsonb) → jsonb
  -- { "status": "APPLIED",  "sync_version": n }    the remote now holds the pushed state
  -- { "status": "CONFLICT", "sync_version": n? }   unseen remote revision that differs — NOTHING written
  -- { "status": "ABSENT" }                         DELETE of an aggregate the remote never held
```

Both are `SECURITY INVOKER`, `search_path = ''`, executable by `authenticated` only, and start with
`is_business_owner(p_business_id)` → `42501` otherwise (an explicit refusal instead of an RLS
"0 rows", which the bootstrap would misread as an empty Business). Because they run with the
caller's rights, the owner-only RLS policies and the least-privilege grants of V1A still decide
every row: the functions add atomicity, not privilege. No `SECURITY DEFINER`, no `service_role`.

`sync_push_aggregate`, in order:

```text
validate type / operation / id / payload                         22023 otherwise
SELECT sync_version, deleted_at … FOR UPDATE                     two devices cannot both pass the comparison
DELETE   no row → ABSENT · already tombstoned → APPLIED (same version)
         expected ≠ current → CONFLICT · else deleted_at = now() → APPLIED (new version)
UPSERT   no row but an expected version → CONFLICT               (administrative hard delete: never recreate silently)
         inside a SAVEPOINT, position uniqueness deferred:
           upsert the parent row (deleted_at cleared: the aggregate exists again)
           delete the children absent from the pushed set, upsert the others by stable id
           (appointment phases under their item; a removed item cascades its phases)
           constraints made immediate again → a duplicate position fails HERE
         read the resulting sync_version
           unchanged            → the remote already held exactly this state → APPLIED (same version)
           changed, expected ok → APPLIED (new version)
           changed, expected ≠  → RAISE inside the savepoint: every write rolled back → CONFLICT
```

"Unchanged" relies on the V1A triggers: `sync_version` moves only on a MEANINGFUL change of the row
or of a child. So an identical re-push costs no revision, and — the important case — the retry of a
push whose answer was lost is acknowledged instead of being reported as a conflict, even though
the device holds no (or an older) acknowledged version. Nothing is overwritten in that case by
construction: the state is identical.

`business_id`, the aggregate id and every child's parent id are stamped from the function
arguments, never read from the payload: a child cannot be pushed under another parent or Business.
Any constraint violation (check, foreign key, duplicate position) aborts the whole call: no partial
aggregate can exist remotely.

### 15.3 Push worker

`createSyncPushWorker({ database, gateway, now? }).run(businessId)` — explicit invocation, never
rejects, single-flight (a second call while one is running returns `SKIPPED / ALREADY_RUNNING`).

```text
guards      businessId is a UUID, the database is bound, and bound to THIS Business — else SKIPPED
            (an unbound or development database never reaches the network)
bootstrap   §11 — a stored decision is trusted only while current (§11.0: a stored EMPTY is stale as soon as
            anything exists locally → classified again); STOP decisions return BLOCKED (INITIAL_UPLOAD_REQUIRES_APPROVAL included: existing data
            is never enqueued or pushed without the approval of §11.1 — the RUNNER gives it, §17, never the
            worker); an unreachable remote returns FAILED
entries     loadEligibleSyncOutbox: business_id = bound id, next_attempt_at NULL or <= now,
            ordered CLIENT, SERVICE, PRODUCT, APPOINTMENT, SALE then FIFO id (remote foreign keys)
per entry   re-read it (id, revision) — it may have been coalesced or settled since the list
            UPSERT → readAggregatePayload: the CURRENT rows (never an outbox snapshot); a missing row
                     turns the push into a DELETE; a row stamped with another Business id is refused
                     (LOCAL_INVALID) — never pushed, never mistaken for a deletion
            expected version = sync_state.remote_version (undefined = never acknowledged)
APPLIED     ONE SQLite transaction: write the RETURNED server version to sync_state, then
            settleSyncOutboxEntry(id, observed revision). A mutation coalesced during the upload keeps
            the entry (newer revision) — it is pushed again with the fresh state and the new ack
ABSENT      settle, clear any acknowledged version (no remote row exists)
CONFLICT    §15.4
failure     the entry stays pending; recordSyncOutboxFailure is conditional on the observed revision,
            so a newer local revision never inherits the failure or its backoff
```

Failure handling (`last_error` holds a stable machine code such as `NETWORK`, `CONFLICT`,
`REJECTED:23503`, `LOCAL_INVALID` — never a server message, which may quote row values):

```text
REJECTED        the remote refused THIS aggregate (SQLSTATE 22xxx / 23xxx)   backoff, continue with the next entry
NETWORK         offline / transport                                          no backoff (eligible at the next run), STOP the run
FORBIDDEN       42501 or an invalid JWT                                      no backoff, STOP the run
UNKNOWN         anything else (e.g. PGRST202: migration not applied)         backoff, STOP the run
LOCAL_INVALID   local row unreadable or out of scope                         backoff, continue
backoff         1, 2, 4 … minutes from attempt_count, capped at 60           bounded, never discarded
```

Every step is idempotent: nothing is settled before the server answered, a lost answer is
re-pushed and acknowledged without a new revision (§15.2), and a tombstone retry returns the same
version.

**Runtime** (`src/providers/CloudSyncRunner.tsx`, mounted next to the root navigator; renders
nothing, owns no state a screen reads). A run is allowed only while Supabase is configured AND the
Auth session is `live` (not the offline fallback: there is no valid token) AND the Business session
is `ready` (the device is bound). Triggers: those conditions becoming true (launch, sign-in, Business
setup, reconnection), the app returning to the foreground, and a 2-minute foreground tick that first
runs a LOCAL check (`isSyncRunDue`: a current push decision + an eligible entry, OR a first sync that
a run can still settle — §17.2) — an idle device, or one waiting for a reconciliation, makes no
request at all. Since V1D.1 a run that answers one of the two one-sided STOPs is followed, within the
same trigger, by the automatic approval and ONE more run (§17.1). Runs are fire-and-forget: a screen never waits on one, a
failure never surfaces as an error, and SQLite stays the source of truth whatever happens. There is
no background task, no retry loop, and no network listener.

### 15.4 Conflict / version behavior

```text
remote == acknowledged   local dirty   → push, store the returned version
remote  ≠ acknowledged   same state    → acknowledged without writing (lost answer, §15.2)
remote  ≠ acknowledged   other state   → CONFLICT: the remote is NOT touched (savepoint rollback), the run
                                          result lists { aggregate, operation, acknowledgedVersion, remoteVersion },
                                          the entry stays pending with last_error = CONFLICT and a bounded backoff
no acknowledged version  remote row    → same rule (the row came from another path)
acknowledged version     no remote row → CONFLICT (administrative hard delete), never silently recreated
```

V1C only DETECTS (and so does the V1D pull, §16.6). A conflicted aggregate stays local-only-dirty
until V1E (resolution) exists; the local row keeps working normally and later local edits keep coalescing
into the same entry. Known limit: if an answer is lost AND the user edits the same aggregate before
the retry, the retry differs from the remote state and is reported as a conflict although no other
device was involved — conservative by design, resolved by V1E.

### 15.5 DELETE behavior

- A DELETE entry needs no local row: the request carries the identity and the acknowledged version,
  no payload. The remote sets `deleted_at` (children are left alone, §8) and the returned tombstone
  version is acknowledged — so recreating the aggregate with the same id later pushes under that
  version and clears the tombstone.
- **Never-remote DELETE** (no acknowledged version — created and deleted before any successful
  push): the DELETE is still SENT. The remote holds no row → `ABSENT` → the entry settles, no
  tombstone is fabricated, no `sync_state` row is written. It is deliberately NOT settled blindly
  on the device: "never acknowledged" does not prove "never uploaded" (the upload may have landed
  and its answer been lost). In that case the remote row exists at a version this device never
  acknowledged → `CONFLICT`, and it is not tombstoned. While offline the entry simply stays pending.
- An UPSERT entry whose local row is gone is pushed as a DELETE (§10.8).
- The remote never hard-deletes an aggregate (no grant, §4).

### 15.6 Security review (V1C)

Executed against all three migrations in PGlite with the V1A harness environment (stubbed `auth`
schema, `anon` / `authenticated` roles, Supabase default privileges), 45 checks:

```text
anon calls either function                                  NO   (42501, no EXECUTE)
User A pushes / tombstones / counts Business B              NO   (42501, explicit owner check); nothing written
unknown aggregate type / operation                          NO   (22023)
same aggregate id in two Businesses                         two independent rows, versions independent
first push / acknowledged push                              APPLIED, server versions 1 / 2
lost-answer retry (no ack, identical state)                 APPLIED, version unchanged
stale ack or no ack + different state                       CONFLICT, row and version unchanged (savepoint)
stale push of a CHILD-only change                           CONFLICT, children and version unchanged
ack for a row the remote does not hold                      CONFLICT, row not created
SERVICE + phases / APPOINTMENT + items + phases / SALE      one call; same phase id under two items accepted
in-place reorder + child removal                            APPLIED (deferred position uniqueness)
invalid child / duplicate position / missing Client (FK)    whole call fails (23514 / 23505 / 23503), NO parent row left
cents (9550, 99, 13501), barcode leading zeroes             exact
DELETE never pushed / unacknowledged / acknowledged / retry ABSENT (no row) / CONFLICT / tombstone / same version
recreate after tombstone                                    deleted_at cleared under the acknowledged version
owner hard DELETE of an aggregate                           still NO (42501)
count                                                       five tables, tombstones included, Business-scoped
functions                                                   SECURITY INVOKER, search_path = '', no anon EXECUTE
```

The harness is a scratch script, not part of the repository (same policy as §13). Application side:
only the existing publishable client with the signed-in owner's session is used; no `service_role`
or admin key exists in the app; nothing is logged; errors are reduced to codes before they are
stored or returned (a Postgres message can quote a client's name or phone number).

### 15.7 Pilot readiness

The first real user's existing data (clients, services / techniques, products, and any other local
aggregate) reaches HER Business through the generic mechanism above, not through a seed:

```text
her device holds the data in SQLite, bound to HER Business UUID, remote Business EMPTY
→ live session → INITIAL_UPLOAD_REQUIRES_APPROVAL → the runner approves for her Business (§17)
→ same trigger, second run → INITIAL_UPLOAD → every aggregate enqueued and pushed → versions stored
→ from then on: automatic incremental pushes
```

Since V1D.1 nothing is supervised in that path: it is what every device does.

What V1C deliberately does NOT do, and what remains an explicit, supervised one-time operation
after V1C is validated: getting that data onto a device bound to her Business if it currently lives
under another binding (a test Business), and emptying or replacing a test Business. The code never
rebinds a bound device (`ALREADY_BOUND_TO_OTHER_ACCOUNT` stands), never treats a populated remote
as a merge target (`RECONCILIATION_REQUIRED`), contains no email / user id / Business id, never
reads `~/.souris-private-data`, and no client PII was added to the repository (tests use the
existing synthetic fixtures).

Legacy ids (`service-<slug>`, `client-<ms>-<n>`) are valid remote keys as they are (§5.2): nothing
is rewritten for the upload.

### 15.8 What later phases still have to build

Done in V1D: pull cursor and incremental pull, new-device restore (`RESTORE_REQUIRED` exit). Done in
V1D.1: both one-sided first syncs are automatic (§17). Still open: the explicit reconciliation entry
point (`RECONCILIATION_REQUIRED` exit), conflict records and resolution (§9, V1E), a user-visible
pending / failed / conflict state,
batching of the initial upload and pagination of the restore read if their size ever matters, an
in-place refresh of the screens after a pull (§16.8), and product image sync (V1F).

### 15.9 Development sync control (`__DEV__` only — not product UI)

`Plus › Développement › Sync V1C (test)` opens `src/features/plus/development/DevelopmentSyncSheet.tsx`,
a test bench for the real-device / simulator validation of §15.3, §16 and §17. Since V1D.1 it approves
NOTHING (its two approval actions were removed with the manual bootstrap):

```text
shows     the Business this DEVICE is bound to (business_profile name + id), the stored bootstrap state
          (or "not classified yet"), outbox pending / failed counts, acknowledged count, the pull cursor,
          and the last action result as state codes + counts
Approbation / Restauration
          whether an approval recorded by the runner is still waiting — i.e. an automatic first sync
          that did not complete (a failure) and that the next run retries
Run sync now            useCloudSyncControl().runNow — the runner's OWN single-flight orchestration (automatic
                        approval included), under the same live-session + bound-Business conditions as an
                        automatic run (disabled otherwise). Its last result line (RESTORED · counts, or
                        PUSHED · … · pull …) is kept at module level, because a restore remounts the tree —
                        this sheet included (§16.8)
```

Production boundary: the module is `require`d inside a `__DEV__` branch of `PlusScreen` (never a
static import), so Metro drops it from release bundles; the section that opens it renders only under
`__DEV__`; the component returns nothing and its handlers refuse to act outside `__DEV__`. A
source-level test locks this in (single guarded `require`, no other reference, the runner as the ONLY
caller of `approveInitialUpload` and `approveInitialRestore`, no product screen reading
`useCloudSyncControl`, the restore reachable from the sync worker only,
no hardcoded id / email / privileged key in the control or in the sync layer, no logging). The runner's
triggers and conditions are unchanged: `runNow` is one more explicit trigger of the same run. The
row avoids the words the product must not display on Plus ("cloud", "sauvegardé", "synchronisé").

---

## 16. New-device restore + incremental pull (V1D — implemented)

```text
src/persistence/sync/remote-gateway.ts     + pullBusinessAggregates (returns UNVALIDATED wire JSON), RemoteBusinessSnapshot
src/persistence/sync/remote-snapshot.ts    the gate: wire JSON → validated snapshot (pure); reference closure; dependency order
src/persistence/sync/remote-apply.ts       ONE validated remote aggregate / tombstone → SQLite rows. No outbox, no sync_state
src/persistence/sync/restore.ts            approved new-device restore: fetch → validate → ONE transaction
src/persistence/sync/pull-worker.ts        incremental pull: clean → apply, dirty → conflict, tombstones, cursor
src/persistence/sync/pull-cursor.ts        souris_metadata['sync_pull_cursor'] + the overlap rule
src/persistence/sync/bootstrap.ts          + approveInitialRestore / readInitialRestoreApproval (§11.2)
src/persistence/sync/push-worker.ts        the run: bootstrap → (approved restore) | push → pull
src/infrastructure/supabase/sync-gateway.ts + the pull RPC binding
src/providers/CloudSyncRunner.tsx          + reloadSnapshot() after a run that wrote operational rows
src/persistence/testing/fake-sync-remote.ts + the pull contract (tests only)
supabase/migrations/20260917200000_create_sync_pull_function.sql
```

### 16.1 Remote read strategy — why an RPC

A restore or a pull needs every aggregate WITH its complete child set, at the `sync_version` that
describes exactly those children. Plain PostgREST table reads (`services`, then `service_phases`,
then `appointments`, …) are separate requests, i.e. separate snapshots: a push landing between two
of them hands the device a Service row of one revision with the phases of another — and the device
would then ACKNOWLEDGE a version whose content it does not hold, which silently defeats the conflict
contract (§9) for that aggregate. Embedding (`select=*,service_phases(*)`) fixes one family per
request but still gives five snapshots, needs SELECT-shaped types for nine tables, and cannot express
"changed since, tombstones included, in creation order" uniformly. So ALL operational reads go through
one function, exactly as all writes go through one (§15.1).

```sql
public.sync_pull_business_aggregates(p_business_id uuid, p_since timestamptz) → jsonb
  -- { "pulled_at": "<server now(), ISO-8601 UTC ms>",
  --   "clients": [...], "services": [...], "products": [...], "appointments": [...], "sales": [...] }
  -- every aggregate: id, sync_version, deleted_at + exactly the columns sync_push_aggregate accepts
  -- services + phases[] · appointments + items[] (each + phases[]) · sales + items[]
public.sync_instant_text(timestamptz) → text     -- formatting helper: UTC, milliseconds, "Z"
```

- ONE SQL statement ⇒ ONE snapshot whatever the isolation level; `STABLE`, read-only.
- `p_since` NULL = the complete dataset (restore, first pull); otherwise `updated_at > p_since`, served
  by the `(business_id, updated_at)` indexes of V1A. A child-only edit moves its parent's `updated_at`
  (V1A triggers), so it comes back as its parent.
- Tombstones are INCLUDED (a pull must download deletions) and returned WITHOUT children.
- Families are ordered by `created_at, id`, children by position: a restore rebuilds the local list
  order (`ORDER BY rowid`) of the device that uploaded the data.
- Instants are emitted in the exact form the device pushed (`2026-09-11T09:15:00.000Z`) instead of
  the session-dependent timestamptz → jsonb rendering; the device never stored more than
  milliseconds, so a pushed instant comes back byte for byte. The parser still accepts any valid
  ISO rendering (offsets, microseconds) and normalizes it.
- `SECURITY INVOKER`, `search_path = ''`, explicit `is_business_owner` → `42501` (an RLS "0 rows"
  would read as an EMPTY Business — the worst possible misreading for a restore), EXECUTE for
  `authenticated` only, no `service_role`, no `SECURITY DEFINER`. The owner-only SELECT policies of
  V1A still decide every row: the function adds consistency, not privilege.

Size: one response holds the whole read. That is the right trade for the pilot (hundreds of Clients,
a catalog, months of Appointments: well under a megabyte); pagination is deliberately not built — it
would give up the single snapshot — and is listed in §15.8 for when a dataset outgrows it.

### 16.2 Validation before any write

`pullBusinessAggregates` returns UNVALIDATED JSON. `parseRemoteBusinessSnapshot`
(`remote-snapshot.ts`, pure) validates the WHOLE answer before a single row is written; it never
returns a partial snapshot:

```text
shape            pulled_at + the five families, each an array of objects; `calendar_blocks` (§20) is
                 optional — absent on a remote that predates it = no block
identity         id non-empty, unique per family; sync_version a safe integer >= 1; deleted_at an instant or NULL
money            every *_cents a non-negative safe INTEGER (a euro 0.99 is refused); quantity >= 1; stock >= 0
vocabularies     service type, appointment status, cancelled_by
lifecycle        cancelled_at + cancelled_by together; reason only when cancelled
payment          paid_at + card + cash: all three or none; never on an Appointment-linked Sale
children         ids and positions / item_order unique inside their parent; returned sorted
client birthday  must be readable by the local mapper (`parseBirthdayKey`)
client notes     text or NULL; a row without the key (remote older than §18) reads as no note
tombstones       identity + version only; NO payload — columns and children are never read as live data
errors           name the FIELD PATH (`clients[].last_name`), never a value (a row can hold a name or a phone)
```

A complete dataset must also be closed over its references (`assertSnapshotReferences`): a live
Appointment / Sale names a live Client, a linked Sale a live Appointment — the invariant the local
deletion guards maintain on every device. Anything refused ⇒ `INVALID_REMOTE_DATA`, nothing written.

### 16.3 Writing a remote aggregate — never through the stores

`remote-apply.ts` is the mirror of `aggregate-payload.ts`. It writes rows with raw SQL and NOTHING
else: a store mutation records an outbox entry, which is exactly what a change originating from the
remote must never do (it would be pushed straight back). It never writes `sync_state` either — the
caller owns the transaction and the acknowledgement.

```text
cents, ids, child ids, positions, item_order   copied exactly; no euro round trip, no renumbering
existing parent row                            UPDATED in place (rowid = list order kept), child set REPLACED (§6)
products.image_uri                             never written: NULL on insert, kept on update
clients.birth_date (legacy)                    never touched
business_id                                    the bound Business; a local row with that id under ANOTHER
                                               Business id is refused (LocalAggregateScopeError)
references (pull)                              an Appointment / Sale whose Client / Appointment is not held
                                               locally is NOT written (RemoteReferenceMissingError)
```

### 16.4 Restore flow

```text
run → classification RESTORE_REQUIRED + approveInitialRestore for THIS Business   (§11.2, given by the runner — §17) — else BLOCKED
1. fetch     pullBusinessAggregates(businessId, since = none)      the complete dataset, one snapshot
2. validate  parseRemoteBusinessSnapshot + assertSnapshotReferences — BEFORE touching SQLite
3. ONE SQLite transaction (restoreBusinessSnapshot):
     re-verify, INSIDE the transaction    still bound to this Business · approval present · no acknowledged
                                          state · NO operational row (the fetch was awaited: the device may
                                          have changed meanwhile) — else RESTORE_REFUSED
     write every LIVE aggregate           CLIENT → SERVICE → PRODUCT → APPOINTMENT → SALE, children with their
                                          parent, in remote creation order; tombstones are not written
     sync_state ← each remote sync_version   tombstones included: they are known revisions
     DELETE the Business's sync_outbox rows
     sync_pull_cursor ← pulled_at
     sync_bootstrap ← ALREADY_SYNCED
     the approval is consumed
→ RESTORED { clients, services, products, appointments, sales, tombstones }
```

Failure at ANY point — offline, function not deployed (`UNKNOWN`), not the owner (`FORBIDDEN`), invalid
dataset, a SQLite error in the middle of the transaction — returns `FAILED` with SQLite exactly as it
was: still empty, still `RESTORE_REQUIRED`, approval still pending. Retry is the next trigger (the tick included, §17.2); nothing
has to be repaired (verified by failing the transaction after four families were already written).

Outbox: with empty tables and no acknowledged state, a pending entry can only describe an aggregate
that no longer exists locally and was never uploaded by this device (nothing is pushed under a STOP
decision, `EMPTY` never uploads an UPSERT). Those intents mean nothing to the restored dataset and
are dropped inside the restore transaction, so the outbox is clean afterwards.

### 16.5 Incremental pull

Runs at the end of every run whose decision is `ALREADY_SYNCED` or `INITIAL_UPLOAD` — never under
`EMPTY` (the remote was just counted empty), never under a STOP, and not when the push pass was
stopped by a run-level failure. **Push goes first**: a push whose answer was lost is acknowledged by
its retry (§15.2) before the pull looks at it; pull-first would misread it as "remote newer + local
dirty".

```text
since = sync_pull_cursor − 5 min (PULL_OVERLAP_MS); no cursor yet = everything
fetch + validate the whole answer (§16.1, §16.2)                      failure ⇒ pull FAILED, nothing applied
the device must still be bound to this Business (the fetch was awaited)
per aggregate — live ones in dependency order, THEN tombstones in REVERSE dependency order:
  remote sync_version <= acknowledged        known revision                       → skipped
  a pending outbox entry exists (DIRTY)      CONFLICT — neither side touched      → reported (§16.6)
  clean, live                                ONE transaction: row + child set + sync_state ← remote version
  clean, tombstone                           ONE transaction: guarded local deletion + sync_state (§16.7)
  could not be applied                       rolled back, NOT acknowledged        → failed
cursor ← pulled_at ONLY when failed = 0
```

- The dirty check, the write and the acknowledgement happen in one synchronous turn after the await:
  no local mutation can slip between "is it clean?" and "apply".
- The cursor is a SERVER time end to end; the device clock never takes part. The overlap exists
  because `updated_at` is the START of the writing transaction (§7): a write that began before a pull
  and committed after it is older than that pull's `pulled_at`. Five minutes is far beyond what a
  remote transaction can last; re-read rows cost one version comparison each.
- A conflict does NOT hold the cursor (the pending outbox entry keeps that aggregate's story, and the
  push pass re-detects it). An aggregate that could not be applied DOES: it is fetched again.
- A device that did the initial upload has no cursor: its first pull reads everything back and
  recognizes every version — a free end-to-end check of the upload.
- The foreground tick never fires to look for REMOTE changes: it fires for eligible push work or a
  pending first sync (§17.2). Remote changes are picked up at launch, on return to the foreground,
  and by whatever run the tick starts for its own reasons — no polling, no realtime.

### 16.6 Conflict behavior

```text
local clean   remote newer      → applied, acknowledged
local dirty   remote unchanged  → left to the push pass (which ran just before)
local dirty   remote newer      → CONFLICT { aggregate, operation, acknowledgedVersion, remoteVersion }
                                  local rows untouched · outbox entry untouched (still pending, with the
                                  push pass's `CONFLICT` + backoff) · remote untouched · the unseen version
                                  is NOT acknowledged, so no later push can slip past it
local DELETE  remote newer      → same: the remote row is neither tombstoned nor re-created locally
local dirty   remote tombstone  → same: the local aggregate is NOT removed
```

The conflict appears in `pull.conflicts` (and, for the same aggregate, in the push pass's
`conflicts`). Nothing resolves it yet: that is V1E (§9). Other aggregates of the same pull are
unaffected.

### 16.7 Tombstones

A remote tombstone is applied with the LOCAL deletion semantics — permanent removal of the row, its
children cascading — and guarded exactly like a user deletion (PERSISTENCE.md §7a, §7b):

```text
SERVICE / PRODUCT   removed; Appointment and Sale snapshots are untouched (no FK, by design)
SALE                removed with its lines; NO stock is replayed — the resulting quantity travels with
                    the PRODUCT aggregate the other device pushed
APPOINTMENT         removed unless it holds a payment or a linked Sale → BLOCKED
CLIENT              removed unless an Appointment or a Sale still references it → BLOCKED
no local row        nothing to remove; the tombstone version is acknowledged
local dirty         CONFLICT (§16.6), never removed
```

Tombstones are applied after the live aggregates and in reverse dependency order (SALE, APPOINTMENT,
PRODUCT, SERVICE, CLIENT), so "Appointment deleted, then its Client deleted" on another device
converges in ONE pull. `BLOCKED` writes nothing, does not acknowledge the version and holds the
cursor: integrity wins over convergence, and the case (history a guard protects, deleted elsewhere)
cannot be produced by devices running these same guards — it is a V1E matter if it ever appears.
A removal never records an outbox entry: a pulled deletion is not echoed back as a DELETE push.

### 16.8 No echo — and what the UI sees

`sync_outbox` is written by the stores only, and `remote-apply.ts` never goes through them: after a
restore or a pull the outbox holds exactly the user's own pending intents, and an idle follow-up run
sends no push request (tested for restore, upsert and tombstone).

The feature providers hydrate ONCE from the persisted snapshot (PERSISTENCE.md §6). A run that wrote
operational rows (`didSyncRunChangeLocalData`: `RESTORED`, or a pull with `applied + deleted > 0`)
is therefore followed by `PersistenceProvider.reloadSnapshot()` — the development reset's remount
mechanism without touching a row — called by `CloudSyncRunner` and by nothing else. A push-only run
never remounts anything, which is every run of a single-device Business once restored. Known
limit: the remount resets navigation and any open draft; with two active devices it can interrupt
the user. An in-place provider refresh is deliberately deferred (§15.8).

### 16.9 Security review (V1D)

Executed against all four migrations in PGlite with the V1A / V1C harness environment, 41 checks:

```text
function attributes                              SECURITY INVOKER, STABLE, search_path = '', EXECUTE authenticated only
anon calls the function / the helper             NO  (42501, no EXECUTE)
User A pulls Business B                          NO  (42501 — an explicit refusal, never an empty answer)
authenticated without a uid                      NO  (42501)
same aggregate id in two Businesses              each owner sees only its own row; nothing of B in A's answer
empty Business                                   five empty arrays + pulled_at
complete dataset pushed through the REAL push    every payload comes back identical (canonical compare):
function                                         columns, cents (9550 / 99 / 13501), barcode zeroes, instants
                                                 byte for byte, item order, the same phase id under two items,
                                                 a 0-minute phase, payment, Sale lines; no image column;
                                                 business_id not repeated
versions                                         sync_version returned = the one the push acknowledged
                                                 (child bumps included)
incremental                                      nothing since the cursor → empty; a PHASE-only edit returns its
                                                 SERVICE (and only it); a future cursor returns nothing
tombstones                                       returned with deleted_at + new version, WITHOUT children;
                                                 included in the complete dataset
read-only                                        pulling never moves a sync_version
owner hard DELETE of an aggregate                still NO (42501)
```

Application side: only the publishable client with the owner's session; errors reduced to stable
codes; validation errors carry field paths, never values; nothing is logged; no email, user id or
Business id exists anywhere in the restore / pull path (source-level test).

### 16.10 Pilot restore readiness

```text
her remote Business holds her uploaded data (§15.7)
→ fresh install / new phone: migrated, empty production seed
→ sign in → the owned Business is resolved and the EMPTY local database is bound to it (AUTH.md §5)
→ first run: local empty + remote populated → RESTORE_REQUIRED → the runner approves for her Business (§17)
→ same trigger, second run: fetch → validate → ONE transaction → RESTORED; the screens re-hydrate from SQLite
→ from then on: the app works from SQLite as on any device; pushes and pulls are automatic
```

No prompt, no supervised step: a TestFlight build restores on its own after sign-in. The path
is generic: it restores whichever Business the device is bound to, and contains no email, user id,
Business id or pilot data.

Two traps are closed. A new phone that signed in BEFORE the old one uploaded stored `EMPTY`; it
reaches `RESTORE_REQUIRED` at its next run (§11.0). And a record created on the new phone before the
restore committed — which made the device `RECONCILIATION_REQUIRED` for good — is no longer
possible: since V1D.1 the application does not open on an empty device until the restore committed
or the remote was found empty IN THE CURRENT SESSION (§17.3), a failed first attempt included. A
stored `EMPTY` from an earlier launch opens nothing, so an empty device relaunched offline after its
Business was populated elsewhere cannot create a diverging record either.

Product images do not come back (V1F): restored Products have no image.

### 16.11 Production restore prompt — REMOVED in V1D.1

V1D shipped `src/features/sync/restore/CloudRestoreSheet.tsx`, a prompt that asked « Restaurer mes
données » before calling `approveInitialRestore`. A user must never have to understand or operate
synchronization: V1D.1 deleted the sheet, its tests, its mount in the `(app)` layout and the
`restoreRequired` signal of `useCloudSyncControl`. The restore is automatic (§17).

---

## 17. Seamless bootstrap (V1D.1 — implemented)

```text
src/providers/CloudSyncRunner.tsx          the bounded orchestration: run → automatic approval → ONE re-run
src/persistence/sync/bootstrap.ts          + isSyncBootstrapPending (what the periodic check may settle)
src/persistence/sync/push-worker.ts        + isSyncRunDue (THE periodic check). The run itself is unchanged
src/providers/CloudSyncRunner.tsx          + the first-sync gate, session-scoped (§17.3)
src/providers/root-route.ts, RootNavigator.tsx   the gate's routes: 'data-loading', 'data-unavailable'
src/features/business/DataLoadingScreen.tsx      « Récupération de vos données… » + activity indicator (presentation only)
src/features/business/DataUnavailableScreen.tsx  "Impossible de récupérer vos données" + « Réessayer » (presentation only)
src/features/sync/restore/                 DELETED (restore prompt + tests)
src/features/plus/development/             the development control lost its two approval actions (§15.9)
```

Product rule: the user never sees, approves or triggers synchronization.

```text
new account            local empty + remote empty      → EMPTY — nothing moves
first record created   local populated + remote empty  → initial upload, AUTOMATIC
new device / reinstall local empty + remote populated  → restore, AUTOMATIC after sign-in, no prompt
both sides populated                                   → RECONCILIATION_REQUIRED — BLOCKED, never approved
empty device, remote state unknown                     → the application does not open yet (§17.3)
once synchronized                                      → push then pull, exactly as in V1C / V1D
```

### 17.1 Orchestration — in the runner, bounded

The worker is untouched: it still refuses both transitions without the Business-scoped approval
(§11.1, §11.2), which keeps every safety property of V1C / V1D (exact Business, re-classification
at upload / restore time, a populated other side never overridden, restore preconditions re-verified
inside its transaction). What changed is WHO approves — `CloudSyncRunner`, nobody else:

```text
trigger → worker.run(businessId)
  BLOCKED / INITIAL_UPLOAD_REQUIRES_APPROVAL → approveInitialUpload(db, businessId)  → worker.run(businessId)
  BLOCKED / RESTORE_REQUIRED                 → approveInitialRestore(db, businessId) → worker.run(businessId)
  BLOCKED / RECONCILIATION_REQUIRED          → nothing. Left blocked
  anything else                              → nothing
→ reloadSnapshot() when the final result wrote operational rows (RESTORED, or an applied pull — §16.8)
```

- **Bounded.** ONE approval and ONE re-run per trigger; whatever the second run answers is the
  result. There is no loop to get stuck in: a second `BLOCKED` (the state changed between the two
  runs) simply waits for the next trigger.
- **Live, bound session only.** The orchestration exists only while the run conditions hold
  (Supabase configured, Auth session `live`, Business `ready` — §15.3), for the Business id of that
  session. Nothing is approved on the offline fallback or signed out: no run happens at all. If the
  session ends while the first run is awaiting the network, the approval is NOT given (tested).
- **The approvals still refuse.** A device not bound to that exact Business, a synchronized device, a
  populated database (restore): `REFUSED` → no re-run.
- **Single-flight.** The orchestration is single-flight like the worker, so overlapping triggers
  (launch + foreground) cannot interleave an approval with someone else's run.
- **Restore failure is non-destructive and retried.** `FAILED` leaves SQLite untouched and the
  restore approval pending (§16.4); the next trigger's first run finds `RESTORE_REQUIRED` + the
  approval and restores directly.

### 17.2 The periodic check — `isSyncRunDue`

Before V1D.1 the 2-minute foreground tick ran only for eligible PUSH work under a current push
decision. A stale `EMPTY` is not one, so the first record of a new account was never sent until the
app went to the background and came back. The tick now asks `isSyncRunDue` — local reads only:

```text
isSyncRunDue = isSyncBootstrapPending || hasEligiblePushWork

isSyncBootstrapPending(db, businessId)                  src/persistence/sync/bootstrap.ts
  never classified                     true    the launch run failed before deciding
  EMPTY / ALREADY_SYNCED, stale        true    classify again — the first record after an EMPTY lands here
  INITIAL_UPLOAD_REQUIRES_APPROVAL     true    the automatic first sync did not complete: retry
  RESTORE_REQUIRED                     true    idem (a failed restore is retried without a foreground event)
  RECONCILIATION_REQUIRED              false   no run resolves it: never polls
  a current push decision              false   → hasEligiblePushWork decides (eligible entry, backoff respected)
```

An idle device, a device whose entries are all backing off, and a device waiting for a
reconciliation still make no request from the tick. `hasEligiblePushWork` itself is unchanged.

### 17.3 First-sync gate — an empty device waits for its data

Without it, "restore failed (or not finished) + the user creates a record" produced
`local populated + remote populated` = `RECONCILIATION_REQUIRED`, which nothing resolves
automatically: a real product bug for anyone who signs in on a new phone with a poor connection.

The rule is SESSION-scoped and lives in `CloudSyncRunner` (component state, never persisted):

```text
the device holds operational data    open    ALWAYS, at once, with no run: offline-first is untouched, whatever
                                             the sync state is (RECONCILIATION_REQUIRED, unreachable remote,
                                             offline session…)
the device ALREADY synchronizes      open    ALWAYS, at once, with no run, offline included:
                                             hasAcknowledgedRemoteState — sync_state holds a revision the SERVER
                                             returned for this Business (§10.7), the one durable local proof.
                                             Such a device may be empty because its deletions were synchronized
                                             (tombstone versions stay in sync_state); whatever it creates is
                                             classified ALREADY_SYNCED, so no divergence is possible
Supabase not configured              open    nothing will ever synchronize (development / tests)
any other EMPTY device               open    ONLY once a run of THIS session got past the first-sync decision:
                                             PUSHED (under EMPTY the remote was counted empty in that very
                                             run, §11.0) or RESTORED
                                     closed  otherwise — whatever decision an EARLIER session stored. A stored
                                             EMPTY, an INITIAL_UPLOAD interrupted before its first
                                             acknowledgement, or a stored ALREADY_SYNCED without sync_state
                                             rows prove nothing
```

A stored `EMPTY` keeps its meaning for the engine (§11.0) but never opens the gate of a new session:
"the account was empty last time" says nothing about now. Found before E2E: device B stores `EMPTY`,
another device populates the Business, B relaunches OFFLINE, creates a record → back online it is
`local populated + remote populated` = `RECONCILIATION_REQUIRED`. B now shows the recoverable state
instead, and restores on its own once online. Once open, the gate stays open for the session (the
user emptying her data mid-session never closes the application under her).

`useCloudSyncControl().firstSync` is read by the root navigator ONLY (`resolveRootRoute`, third
argument):

```text
ready        → the app
resolving    → 'data-loading': DataLoadingScreen — brand mark, « Récupération de vos données… », « Cela peut
               prendre quelques instants. », an ActivityIndicator. No action, no percentage (the engine
               measures no progress), one wording for the check and the restore (no extra machinery)
unavailable  → 'data-unavailable': DataUnavailableScreen. The attempt ended without opening the gate (count
               failed, restore failed, FORBIDDEN…), or no run is possible at all (offline session fallback)
```

- The protected `(app)` group is NOT MOUNTED in the last two states: no provider, no screen, no
  sheet — so no Client, Service, Product, Appointment or Sale can be created, and the outbox stays
  empty. It is a route-level state like the account conflict, not a sheet over the app.
- The gate is decided again after every orchestration and opens in the same render as its result:
  at once when the remote was counted empty; after a restore, with the usual `reloadSnapshot()`
  remount (§16.8), which finds a populated device and lands directly in the app.
- « Réessayer » is the SAME orchestration (`runNow`) — or, without a live session, the Auth
  session retry, since no fetch is possible before that. Automatic retries: launch, return to the
  foreground, and the tick — which always runs while the gate is closed, even when `isSyncRunDue`
  is false (an empty device with a stored `EMPTY` has no pending work, yet it is waiting).
  While an attempt is in flight the screen stays and the button reads « Nouvelle tentative… ».
- It never asks whether to restore: the restore stays automatic (§17.1). `RECONCILIATION_REQUIRED`
  is never resolved by it — and never blocks the application either, since that device holds data.
- Wording: « Récupération de vos données… » while waiting; "Impossible de récupérer vos données" /
  "Vérifiez votre connexion internet…" / « Réessayer » / « Se déconnecter » on failure. No sync,
  bootstrap, outbox, cloud, remote or server vocabulary, no "%" (tested on both screens).

### 17.4 Tests

`CloudSyncRunner.test.tsx`: populated local + empty remote uploaded at launch with no manual
approval, in exactly two runs; a new device restored at launch — SQLite rebuilt, providers
re-hydrated, empty outbox, no push back; stale `EMPTY` — first aggregate uploaded by the tick alone,
then plain incremental sync; `RECONCILIATION_REQUIRED` staying blocked through launch / foreground /
tick with no approval recorded and both sides unchanged; a failed restore leaving SQLite
untouched and being retried by the tick; no approval once the session ended mid-run; offline
fallback / signed out / no gateway unchanged; the multi-device re-hydration test unchanged.
`sync-bootstrap.test.ts` (`isSyncBootstrapPending`), `sync-push-worker.test.ts` (`isSyncRunDue`:
stale EMPTY due, backoff and reconciliation not due), `production-boundary.test.ts` (the runner is
the only caller of both approvals, never answers a reconciliation, no product screen reads sync
state except the root navigator, `features/sync/` is gone), `DevelopmentSyncSheet.test.tsx` (status + run only). The
worker-level suites of V1C / V1D are unchanged: the engine still blocks without an approval.
First-sync gate (§17.3) — `first-sync-gate.test.tsx`, real runner + real root navigator: empty
device whose first check fails → no application, empty SQLite and outbox, « Réessayer » → automatic
restore → app open with the data, empty outbox, nothing pushed back; the restore itself failing →
same state, never `RECONCILIATION_REQUIRED`, restored by the tick alone; empty account → gate opens,
first record uploaded by the tick; the waiting state (indicator, plain wording, no button, no
business route, no technical word) replaced at once by the app, by the recoverable state on failure,
and still showing — app not mounted — while the restore fetch is in flight; a populated
device never held back (unreachable remote, offline session, `RECONCILIATION_REQUIRED` left
untouched); empty device on the offline session → no application, retry goes through the session;
a stored `EMPTY` never opening a new session: (A) relaunch online after another device populated the
Business → checked again → automatic restore; (B) relaunch offline → recoverable state, no business
route, empty SQLite and outbox; (C) network back + « Réessayer » → restored, app open, empty outbox;
account still empty → opens only after this session's own check; a failed re-check retried by the
tick although nothing else is due; (D) a populated device usable offline; a synchronized device whose
data was all deleted and the deletions acknowledged → open at once on an offline relaunch; only a
stored `EMPTY`, an initial upload interrupted before any acknowledgement, or a decision without
`sync_state` rows → no application offline; no Supabase → open.
`root-route.test.ts` (the gate only ever replaces `app`).

### 17.5 Real-device checklist

```text
[ ] new account → create a first Client → stay in the app ≤ ~2 min → the row exists remotely
[ ] same, airplane mode while creating, then back online without leaving the app → uploaded by a later tick
[ ] reinstall / second device → sign in → data appears in every tab with no prompt (Products without photos)
[ ] airplane mode right after sign-in on a new device → "Impossible de récupérer vos données", NO tab bar,
    nothing can be created; back online → « Réessayer » (or wait / return to the foreground) → data in every tab
[ ] new account, online → « Récupération de vos données… » shows briefly, then the app opens
[ ] empty account, kill the app, airplane mode, relaunch → "Impossible de récupérer vos données" (not the app)
[ ] synchronized device: delete every record, wait for it to be sent, kill, airplane mode, relaunch → the app opens
[ ] second device: large account on a slow network → the waiting state stays up, indicator animating, until the data is there
[ ] device that already holds data, airplane mode, relaunch → the app opens and works as before
[ ] device with local data signed into a Business that already holds data → nothing uploaded, nothing restored
[ ] release build: no restore prompt, no sync control anywhere
```

## 18. Client notes — an additive CLIENT column (schema v9)

The Client birthday (`clients.birthday`, `MM-DD`) has been part of the remote schema and of both
RPCs since V1A / V1C. Client notes (`docs/domain/CLIENTS.md` §2) add ONE column to the same
aggregate — no new aggregate type, no new sync mechanism, no new conflict rule:

```text
supabase/migrations/20260921120000_add_client_notes.sql

alter table public.clients add column if not exists notes text;     nullable, no default, no CHECK
create or replace function public.sync_push_aggregate(...)          CLIENT branch reads / writes notes
create or replace function public.sync_pull_business_aggregates(..) clients[] objects carry notes
```

- **Non-destructive.** No row is rewritten, so no `updated_at` / `sync_version` moves and no device
  re-pulls anything because of the migration. No table is recreated; ids, tombstones, triggers, RLS
  policies and grants are untouched. The table-level grants and owner-only policies already cover
  the new column; the generic `sync_aggregate_before_write` trigger (`new is distinct from old`)
  already counts a note edit as a meaningful revision, and an identical re-push as none.
- **Functions replaced in place.** Both RPCs list the Client columns explicitly, so they must be
  redefined. `create or replace` with identical signatures keeps their EXECUTE grants, revokes,
  comments, `SECURITY INVOKER` and `search_path = ''`. Their bodies are the V1C / V1D ones with only
  the `notes` differences; every other aggregate is byte-identical.
- **Payload.** `RemoteClientPayload.notes: string | null` — the normalized local text, or `null`.
  A build that knows the field ALWAYS sends the key, so clearing a note is an explicit `null` and
  follows the ordinary `sync_version` conflict contract (§9).
- **Older app builds.** A build that predates the field sends a CLIENT payload without a `notes`
  key. The push keeps the stored note in that case
  (`notes = case when p_payload ? 'notes' then excluded.notes else clients.notes end`), so an older
  device editing a phone number never erases a note written by a newer one. Such a build ignores
  the extra `notes` key of the pull, and its local schema (≤ v8) has no such column.
- **Older remote.** A pulled Client row without a `notes` key parses as "no note" (§16.2) — never
  a validation failure.
- **Order of deployment: apply the migration BEFORE shipping the build that writes notes.** Against
  the previous functions, `jsonb_to_record` silently ignores the unknown `notes` key: the push is
  acknowledged while the note never reaches the cloud, and a later restore would not contain it.
  The migration is applied by hand, like every Souris migration.

Verified in the out-of-repo PGlite harness (§13 policy): the migration applied on a POPULATED
database written by the previous functions — existing rows byte-identical (ids, `sync_version`,
`created_at`, `updated_at`), `notes` NULL everywhere, re-run harmless, an incremental pull after it
returns nothing — then create / edit / clear of notes and birthday, multiline round trip, the
older-build payload preserving the note, CONFLICT on a stale version, `anon` and non-owner refusals,
and the unchanged V1C push checks. Local coverage: `sync-pull-restore.test.ts` (« Client birthday +
notes »: local create → cloud, local edit → cloud, cloud pull → local, fresh-device restore,
clearing both values, NULL-only Clients).

---

## 19. Appointment discount — two additive APPOINTMENT columns (schema v10)

The Appointment discount (`docs/domain/APPOINTMENTS.md` §15.3) adds TWO columns to the existing
`APPOINTMENT` aggregate — no new aggregate type, no new sync mechanism, no new conflict rule:

```text
supabase/migrations/20260922120000_add_appointment_discount.sql

alter table public.appointments add column if not exists discount_percent integer        1–50, nullable
alter table public.appointments add column if not exists discount_amount_cents integer   >= 1, nullable
constraint appointments_discount_check                                                   never both
create or replace function public.sync_push_aggregate(...)          APPOINTMENT branch reads / writes them
create or replace function public.sync_pull_business_aggregates(..) appointments[] objects carry them
```

- **What travels.** The professional's choice only — a whole percentage OR fixed integer cents. No
  discounted total is stored or synced: gross → discount → net stays derived on every device from the
  same item snapshots, so two devices can never disagree on an amount.
- **Non-destructive.** No row is rewritten, so no `updated_at` / `sync_version` moves and no device
  re-pulls anything because of the migration. No table is recreated; ids, tombstones, triggers, RLS
  policies, grants, `appointment_items.price_cents` and the payment columns are untouched. The generic
  `sync_aggregate_before_write` trigger already counts a discount edit as ONE meaningful revision and
  an identical re-push as none.
- **Functions replaced in place.** `create or replace` with identical signatures keeps the EXECUTE
  grants, revokes, comments, `SECURITY INVOKER` and `search_path = ''`. The bodies are the §18 ones
  with only the discount differences; every other aggregate is byte-identical.
- **Payload.** `RemoteAppointmentPayload.discount_percent` / `.discount_amount_cents`
  (`number | null`). A build that knows the discount ALWAYS sends BOTH keys — one value and one
  `null`, or two `null`s — so removing a discount is explicit and follows the ordinary
  `sync_version` conflict contract (§9). The pair is replaced together, so switching from a
  percentage to a fixed amount never trips the one-of CHECK.
- **Older app builds.** A build that predates the discount sends neither key. The push then keeps
  the stored pair (`case when p_payload ? 'discount_percent' or p_payload ? 'discount_amount_cents'
  …`), so an older device moving an Appointment never erases a discount set by a newer one. Such a
  build ignores the two extra keys of the pull, and its local schema (≤ v9) has no such columns.
  **Limit:** that older build does not know the discount, so if IT checks the Appointment out, its
  sheet proposes the gross total. Ship the new build to every device before relying on discounts.
- **Older remote.** A pulled Appointment row without the keys parses as "no discount" (§16.2) —
  never a validation failure. An out-of-range value (a percentage outside 1–50, the domain's
  `MAX_DISCOUNT_PERCENT`; cents below 1), or both values set, is refused by the snapshot validation
  before any local write — pull and restore alike.
- **Pull, restore, tombstones.** Unchanged: `remote-apply.ts` writes the two columns with the rest of
  the row, so an incremental pull and a fresh-device restore carry the discount; a tombstone carries
  no payload.
- **Order of deployment: apply the migration BEFORE shipping the build that writes discounts.**
  Against the previous functions, `jsonb_to_record` silently ignores the unknown keys: the push is
  acknowledged while the discount never reaches the cloud, and a later restore would not contain it.
  The migration is applied by hand, like every Souris migration.

Verified in the out-of-repo PGlite harness (§13 policy): the migration applied on a POPULATED database
written by the previous functions — existing Appointments and items byte-identical (ids, payment,
`sync_version`, `created_at`, `updated_at`, `price_cents`), both columns NULL everywhere, re-run
harmless, an incremental pull after it returns nothing — then create with a discount, add, identical
re-push, switch percentage → fixed, the older-build payload preserving the discount, explicit removal,
CONFLICT on a stale version, the three CHECKs, `anon` and non-owner refusals, tombstones, and the
unchanged push regression checks. Local coverage: `sync-pull-restore.test.ts` (« Appointment discount »:
create → cloud, edit → cloud, removal → cloud, cloud pull → local, fresh-device restore, NULL-only
Appointments, rows without the keys, invalid remote values).

---

## 20. Calendar Blocks — a new aggregate type (schema v11)

Personal unavailability (`docs/domain/CALENDAR_BLOCKS.md`) is the first NEW aggregate since V1A. It is
synchronized by the existing engine — same outbox, same push RPC, same pull RPC, same restore, same
conflict contract. There is no second sync mechanism.

```text
supabase/migrations/20260923120000_create_calendar_blocks.sql

create table public.calendar_blocks (business_id, id) PK, staff_member_id, start_at, end_at, reason,
                                    + sync metadata; CHECK end_at > start_at; CHECK non-blank reason
indexes      (business_id, updated_at) · (business_id, staff_member_id, start_at)
trigger      calendar_blocks_sync_before_write → the generic sync_aggregate_before_write (§7)
RLS          owner select / insert / update — NO delete policy (tombstone only, §8)
grants       revoke all from public, anon, authenticated; grant select, insert, update to authenticated
create or replace function public.sync_count_business_aggregates(..)  also counts calendar_blocks
create or replace function public.sync_push_aggregate(...)            accepts CALENDAR_BLOCK
create or replace function public.sync_pull_business_aggregates(..)   a sixth family: calendar_blocks[]
```

- **What travels.** `RemoteCalendarBlockPayload`: `staff_member_id`, `start_at`, `end_at`, `reason`.
  No client, price, payment, discount or status: there is nothing financial in the row, the payload,
  the table or the pull.
- **Non-destructive.** One new table. No existing table, row, column, id, tombstone, trigger, policy or
  grant is touched, so no `updated_at` / `sync_version` moves and no device re-pulls anything because of
  the migration. The three functions are replaced in place with identical signatures (EXECUTE grants,
  revokes, comments, `SECURITY INVOKER`, `search_path = ''` preserved); every other aggregate branch is
  byte-identical to §19 — the migration was generated from the §19 bodies and diffed.
- **Local side.** `SYNC_AGGREGATE_TYPES` gains `CALENDAR_BLOCK`; SQLite schema v11 rebuilds the two
  bookkeeping tables for it (PERSISTENCE.md §4). Push order: `CLIENT, SERVICE, PRODUCT, APPOINTMENT,
  SALE, CALENDAR_BLOCK` — a block references nothing and nothing references it, so it goes last and its
  tombstone is applied first in the reverse pass. `aggregate-payload.ts` reads it raw,
  `remote-apply.ts` writes it in place (UPDATE, else INSERT), a remote tombstone removes the local row
  with NO guard (nothing references a block), `enqueueInitialUpload` includes it, and
  `isLocalDatabasePopulated` counts it (a device holding only blocks is populated: it uploads, it is
  never restored over). The bootstrap count counts it remotely for the same reason.
- **Validation.** `parseRemoteBusinessSnapshot` checks a live block like the remote CHECKs do — an end
  strictly after the start, a non-blank reason, a non-empty staff member — before anything is written;
  a tombstone carries no payload. `RestoreCounts` gained `calendarBlocks`.
- **Tombstones.** A local deletion is `DELETE` locally + a `CALENDAR_BLOCK DELETE` outbox entry →
  `deleted_at` remotely → pulled by the other devices, which remove their row. A deleted block cannot
  reappear after a pull or a restore: a restore writes live aggregates only and acknowledges the
  tombstone version. Created-and-deleted offline → `ABSENT`, no tombstone fabricated (§15.5).
- **Conflicts.** The ordinary contract of §9 / §15.4 / §16.6 — remote newer + local dirty is a reported
  conflict that overwrites neither side; a lost acknowledgement is retried idempotently. The
  schedule-conflict RULE (a block may not overlap an Appointment's staff-required time) is a local
  product rule and is NOT enforced by sync: two devices editing offline can produce an overlap, and both
  records are then kept and drawn.

### 20.1 Builds and remotes that predate Calendar Blocks

The risk named when this was designed: "an old build pushes an aggregate payload without the blocks
section, and the cloud reads that as zero blocks". It cannot happen here, by construction:

- **Sync is PER AGGREGATE.** There is no dataset-level payload. An older build pushes the five families
  it knows, one aggregate at a time, and never names a `CALENDAR_BLOCK`; it can therefore neither
  overwrite nor tombstone one. The absence of a push is the absence of an opinion — never "delete them
  all". Removing a block takes an explicit `CALENDAR_BLOCK DELETE` from a build that knows them.
- **Its pull parser ignores the sixth key** (`parseRemoteBusinessSnapshot` reads named keys only), and
  its local schema has no such table. Its count of the remote simply includes blocks.
- **Upgrade gap, closed.** That older build still ADVANCES its pull cursor past the blocks it ignored.
  Schema v11 therefore clears the cursor: the first run of the new build reads the complete dataset
  once (acknowledged revisions are skipped) and stores the blocks created meanwhile.
- **Older remote** (migration not applied yet). A pull answer without the `calendar_blocks` key parses
  as "no block" — never a failure, and never a local deletion. A `CALENDAR_BLOCK` push is refused with
  `22023` (`REJECTED`): the entry stays pending with a bounded backoff, the run continues with the
  other aggregates, and the block leaves at the first run after the migration. Nothing is lost, but
  until then it reaches neither the cloud nor another device —
  **apply the migration BEFORE shipping the build.** It is applied by hand, like every Souris migration.

Verified in the out-of-repo PGlite harness (§13 policy), 61 checks: the migration applied on a
POPULATED database written by the §19 functions — every existing table byte-identical (rows, ids,
`sync_version`, `created_at`, `updated_at`, tombstones), existing policies / grants / function ACLs
unchanged, re-run harmless (three policies, one trigger), an incremental pull after it returns nothing,
the five existing families of a full pull identical — then the table shape, RLS, grants and indexes;
create, identical re-push, edit, stale-version CONFLICT, ack-without-row CONFLICT, exact round trip,
incremental pull, `ABSENT`, stale DELETE, tombstone, retry, owner hard-delete refusal, recreate after a
tombstone; the five CHECK / NOT NULL refusals leaving no row; server-owned metadata; `anon` and
non-owner refusals on the RPCs AND the table, Business isolation, `business_id` pinned; an older build's
CLIENT and APPOINTMENT pushes leaving every block (and the note and the discount) untouched; and the
count for an empty Business and for one holding only a block. The V1C / V1D regression harnesses give
the same results before and after the migration (push 44 / 44; pull 40 + its one by-design failure).
Local coverage: `calendar-blocks-sync.test.ts` — create / edit / delete → cloud, offline coalescing,
`ABSENT`, initial upload and push order, a blocks-only device, cloud pull → local for an insert, an
edit and a tombstone with no echo, fresh-device restore, invalid remote blocks, the conflict contract,
an older remote, an older build, and the upgrade gap.
