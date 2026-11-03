# BeautIzzy — Cloud Sync

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
       Appointment deposits                 done — a NEW aggregate type, APPOINTMENT_DEPOSIT, through the same engine (§21)
       Client photos                        done — one additive CLIENT column (a Storage path) + private business-media bucket (§22)
       Product photos                       done — one additive PRODUCT column in the SAME bucket; legacy local images never uploaded (§23)
       Foreground refresh                   done — an idle open device pulls on the 2-min tick; pulled data refreshes the UI IN PLACE (§24)
       Appointment reminder flag            done — one additive nullable column carried by the APPOINTMENT aggregate (§25)
       Client SMS consent                   done — three additive CLIENT columns travelling together (SMS pivot Phase 2;
                                            COMMUNICATIONS.md §34): consent + audit pair, missing-key rule, no backfill
       Reactive sync + pull-to-refresh      done — the sync revision (push-only runs re-render what they settled) and the
                                            native pull gesture of the product lists, joining the run in flight (§29)
V1E    Conflict / Retry Hardening
V1F    Product Image Sync                   superseded by Product photos (§23): one shared photo, no legacy upload
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
                    notes? (§18), photo_path? (§22),
                    sms_marketing_consent? + _updated_at? + _source? (COMMUNICATIONS.md §34 —
                    the triple travels together; a payload without the consent key keeps the
                    stored values, so an older build can never erase a consent),
                    archived_at?, + sync metadata
services            (business_id, id) PK, name, type SERVICE|TECHNIQUE, price_cents, active, + sync metadata
service_phases      (business_id, service_id, id) PK, position (unique per service, deferrable),
                    name, duration_minutes >= 0, requires_staff
appointments        (business_id, id) PK, client_id → clients, staff_member_id, start_at, status,
                    notes?, cancelled_at?, cancelled_by?, cancellation_reason?, no_show_recorded_at?,
                    paid_at?, card_amount_cents?, cash_amount_cents?,
                    discount_percent?, discount_amount_cents? (§19),
                    client_reminder_enabled? (§25), + sync metadata
appointment_items   (business_id, appointment_id, id) PK, item_order (unique per appointment, deferrable),
                    service_id (NO FK), service_option_id?, service_name, service_type, price_cents
appointment_phases  (business_id, appointment_id, appointment_item_id, id) PK, position (unique per item,
                    deferrable), name, duration_minutes >= 0, requires_staff
products            (business_id, id) PK, name, brand?, category?, barcode?, price_cents,
                    photo_path? (§23), stock_quantity >= 0, active, + sync metadata
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
products.image_uri (legacy device path)  — (absent)                        never uploaded; the shared photo is photo_path (§23)
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
APPOINTMENT_DEPOSIT appointment_deposits                        (§21)
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

Since schema v11 the `aggregate_type` vocabulary of both tables also holds `'CALENDAR_BLOCK'` (§20),
and since schema v12 `'APPOINTMENT_DEPOSIT'` (§21); each time the tables were rebuilt with every row
preserved (PERSISTENCE.md §4).

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
appointment_deposits row created / voided                       APPOINTMENT_DEPOSIT UPSERT (never DELETE)
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
DEVICE_ACCOUNT_CONFLICT behavior (AUTH.md §6): nothing is restored for the new account until the
professional explicitly releases the device, which empties and unbinds it — the restore then follows
this very path.

---

## 12. Image boundary

`products.image_uri` is a LEGACY device-local file path under the app's documents directory
(PERSISTENCE.md §9). It is never canonical cloud data, has no remote column, and is never
uploaded. Shared Product photos are `products.photo_path` (§23), implemented with the plan below
(one object per photo, Storage RLS on the path prefix, image bytes never in Postgres or SQLite) —
except that nothing maps or migrates legacy files: a Product gets a shared photo only from an
explicit new photo.

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
  -- { "status": "FINANCIAL_CONFLICT", … }          since §21.2: the write would leave an Appointment with
  --                                                more ACTIVE deposits than its expected total — NOTHING written
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
runs a LOCAL check (`isForegroundSyncTickDue`: an eligible entry, a first sync that a run can still
settle, OR — since §24 — a device that already synchronizes, which then makes one incremental pull)
— a device waiting for a reconciliation makes no request at all. Since V1D.1 a run that answers one of the two one-sided STOPs is followed, within the
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
and product image sync (V1F — superseded by §23). The in-place refresh of the screens after a pull is
done (§24).

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
                        PUSHED · … · pull …) is kept at module level (a restore used to remount the tree;
                        since §24 nothing is remounted, and the module-level line is simply kept)
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

The feature providers hydrate from the persisted snapshot (PERSISTENCE.md §6). A run that wrote
operational rows (`didSyncRunChangeLocalData`: `RESTORED`, or a pull with `applied + deleted > 0`)
is followed by `PersistenceProvider.reloadSnapshot()`, called by `CloudSyncRunner` and by nothing
else. Since §24 it re-reads SQLite IN PLACE: nothing is remounted, navigation, sheets and drafts
stay as they are, and each session provider adopts the fresh persisted state. (Before §24 it
remounted the whole tree, resetting navigation and open drafts.) A run that changed nothing never
calls it.

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

Since §24 the tick asks `isForegroundSyncTickDue = isSyncRunDue || isIncrementalPullAvailable`:
a device that already synchronizes (a CURRENT `ALREADY_SYNCED` / `INITIAL_UPLOAD` decision) runs on
every foreground tick even when idle — its run pushes nothing and makes ONE incremental pull. A
device waiting for a reconciliation still makes no request from the tick; an EMPTY device and a
pending first sync keep the rules above. `hasEligiblePushWork` itself is unchanged.

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
  at once when the remote was counted empty; after a restore, with the usual in-place
  `reloadSnapshot()` (§16.8, §24), which finds a populated device and lands directly in the app.
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
  The migration is applied by hand, like every BeautIzzy migration.

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
  The migration is applied by hand, like every BeautIzzy migration.

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
  **apply the migration BEFORE shipping the build.** It is applied by hand, like every BeautIzzy migration.

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

---

## 21. Appointment deposits — a new aggregate type (schema v12)

Deposits (`docs/domain/APPOINTMENTS.md` §25d) are money received in advance for an Appointment. They
are synchronized as their OWN aggregate, `APPOINTMENT_DEPOSIT`, by the existing engine — same outbox,
same push RPC, same pull RPC, same restore, same conflict contract. No second sync mechanism.

```text
supabase/migrations/20260924120000_create_appointment_deposits.sql

create table public.appointment_deposits (business_id, id) PK, appointment_id → appointments
                                         (composite FK, same Business, ON DELETE RESTRICT),
                                         amount_cents >= 1, payment_method CARD|CASH, paid_at,
                                         status ACTIVE|VOIDED, voided_at (exactly when VOIDED),
                                         recorded_at, + sync metadata
indexes      (business_id, updated_at) · (business_id, appointment_id)
trigger      appointment_deposits_sync_before_write → the generic sync_aggregate_before_write (§7)
RLS          owner select / insert / update — NO delete policy
grants       revoke all from public, anon, authenticated; grant select, insert, update to authenticated
create or replace function public.sync_count_business_aggregates(..)  also counts appointment_deposits
create or replace function public.sync_push_aggregate(...)            accepts APPOINTMENT_DEPOSIT
create or replace function public.sync_pull_business_aggregates(..)   a seventh family: appointment_deposits[]
```

- **Why its own aggregate, not a child of APPOINTMENT.** A child set is REPLACED by every parent push
  (§6): an older build pushing an Appointment without a deposit section would erase them. As its own
  aggregate a deposit is never named by an older build, so it can never be overwritten or removed by
  one — the §20.1 argument. It also matches reality: a deposit is recorded on another day than its
  Appointment, and the Appointment row does not change when one is taken.
- **What travels.** `RemoteAppointmentDepositPayload`: `appointment_id`, `amount_cents`, `payment_method`,
  `paid_at`, `status`, `voided_at`, `recorded_at` (the device's entry instant; remote `created_at` stays
  server-owned). Integer cents, exact instants, no conversion.
- **VOIDED is a status, not a tombstone.** Voiding is an ordinary `UPSERT` under the acknowledged
  version (one new revision). BeautIzzy never sends a DELETE for a deposit. The engine contract still
  holds: a remote tombstone (an administrator's) removes the local row without a guard, since nothing
  references a deposit.
- **Local side.** `SYNC_AGGREGATE_TYPES` gains `APPOINTMENT_DEPOSIT`; SQLite schema v12 rebuilds the two
  bookkeeping tables (PERSISTENCE.md §4). Push order: `CLIENT, SERVICE, PRODUCT, APPOINTMENT, SALE,
  CALENDAR_BLOCK, APPOINTMENT_DEPOSIT` — a deposit follows its Appointment (remote FK) and its tombstone
  is applied first in the reverse pass. `aggregate-payload.ts` reads it raw (Business-scoped),
  `remote-apply.ts` writes it in place and refuses a deposit whose Appointment this device does not hold
  (`RemoteReferenceMissingError`, fetched again by the next pull), `enqueueInitialUpload` includes it,
  `isLocalDatabasePopulated` counts it, `RestoreCounts` gained `appointmentDeposits`.
- **Validation.** `parseRemoteBusinessSnapshot` refuses what the remote CHECKs refuse (amount below 1 or
  fractional, unknown method or status, `voided_at` not matching the status) before any write, and
  `assertSnapshotReferences` refuses a complete dataset whose live deposit names an Appointment it does
  not hold.
- **Appointment tombstones.** A pulled Appointment tombstone is `BLOCKED` locally while a deposit of it
  exists (the deletion guard, PERSISTENCE.md §7b); remotely the Appointment can only be tombstoned, and a
  hard delete is refused by the RESTRICT foreign key (`23001`).
- **Conflicts.** The ordinary contract (§9, §15.4, §16.6). The financial invariant (deposits <= expected
  total, APPOINTMENTS.md §25d) is a LOCAL rule enforced by the stores; it is NOT enforced by sync: two
  devices editing offline (one lowering the price, the other taking a deposit) can produce a record whose
  deposits exceed its total. Both are kept; the remaining amount is then shown as `0` and any later edit
  that does not lower the total stays possible.
- **Retries never duplicate.** The deposit id is created once per sheet presentation; an identical
  re-push after a lost acknowledgement leaves the version unchanged (§7), and the local store refuses a
  second insert of the same id.

### 21.2 The financial invariant across devices — server-side rejection

Every device keeps `ACTIVE DEPOSITS <= EXPECTED TOTAL` locally (`docs/domain/APPOINTMENTS.md` §25d), but two
devices editing OFFLINE can each make a locally valid write that is invalid once merged:

```text
expected 100 €
device A (offline)   lowers the total to 50 €     valid against what A knows
device B (offline)   records a 60 € deposit       valid against what B knows
after sync           expected 50 € · deposits 60 €     ← never a valid settled state
```

The ROOT CAUSE is that the two writes touch DIFFERENT aggregates (`APPOINTMENT` and `APPOINTMENT_DEPOSIT`), so
the per-aggregate revision contract (§9) cannot see the incompatibility: each one is a clean, unconflicted
revision of its own row.

The remote holds the authoritative financial state of an Appointment — its items, its discount, the Sales sold
during it and its deposits — so the rule is enforced THERE, at the strongest boundary, and the SECOND of the two
writes is refused before it becomes authoritative:

```sql
public.sync_appointment_expected_total_cents(business, appointment)  items − discount + linked Sale lines
public.sync_appointment_active_deposit_cents(business, appointment)  Σ ACTIVE, non-tombstoned deposits
public.sync_appointment_deposit_breach(business, appointment)        the FINANCIAL_CONFLICT answer, or NULL
```

`sync_push_aggregate` evaluates the breach on the state the write WOULD leave, inside the same savepoint as the
write, for every aggregate that can change it — `APPOINTMENT`, `APPOINTMENT_DEPOSIT`, `SALE` (a linked Sale is
part of the expected total), on UPSERT and on the tombstone path. On a breach it raises `SC422`, the savepoint
undoes everything, and it answers:

```json
{ "status": "FINANCIAL_CONFLICT", "appointment_id": "…", "expected_total_cents": 5000, "active_deposit_cents": 6000 }
```

Scope and exceptions:

- a COMPLETED Appointment is OUT of scope: its expected total may legitimately fall below what was received (a
  Product removed after checkout — the `Écart` of APPOINTMENTS.md §25b). Its deposits push normally;
- an Appointment the remote does not hold yet is out of scope (the FK already refuses an orphan deposit);
- a VOIDED deposit push always goes through: it LOWERS the deposits, and it is how a device resolves a conflict;
- an `APPOINTMENT` tombstone is refused while the Appointment holds deposits — an older build's deletion guard
  does not count them (`FINANCIAL_CONFLICT`, nothing tombstoned);
- nothing else is touched: a CLIENT, SERVICE, PRODUCT or CALENDAR_BLOCK push never evaluates it.

**Client behavior.** `RemotePushResult` gained `FINANCIAL_CONFLICT`. The push worker does NOT settle the entry:
it records the ordinary bounded backoff with `last_error = 'FINANCIAL_CONFLICT'`, reports it in the run summary
(`financialConflicts`, present only when there is one) and moves on to the other aggregates. The local record is
never dropped, never rewritten: the deposit (or the price change) stays exactly as the professional entered it,
pending. The device then pulls the other side of the race, holds the invalid combination locally, and Appointment
Details shows « Conflit financier à résoudre » — no checkout, no new deposit — until the professional voids the
deposit or raises the total. The next run then pushes the pending entry, and both sides converge.

**Why not a local-only rule.** Nothing on a device can see a change another device has not pushed yet, so a
local rule can only ever refuse its own writes. And nothing may be repaired silently — clamping, voiding or
overwriting one side would destroy financial history.

**Older remotes.** A remote whose migration is not applied (or an older one) simply does not evaluate the rule;
the local rules still hold on every device, and a merged invalid state is still detected and surfaced locally
(§7 of the domain rule). The check is additive: no existing status, payload or contract changed.

### 21.1 Builds and remotes that predate deposits

- **Older build.** It never names an `APPOINTMENT_DEPOSIT`, so it can neither overwrite nor tombstone one;
  its pull parser ignores the seventh key; its local schema has no such table. **Limit:** it does not know
  the deposits, so if IT checks an Appointment out, its sheet proposes the whole expected total — ship the
  new build to every device before relying on deposits.
- **Upgrade gap, closed.** Schema v12 clears the pull cursor (as v11 did): the first run of the new build
  reads the complete dataset once and stores the deposits recorded meanwhile.
- **Older remote** (migration not applied yet). A pull answer without the `appointment_deposits` key parses
  as "no deposit" — never a failure, never a local deletion. An `APPOINTMENT_DEPOSIT` push is refused with
  `22023` (`REJECTED`): the entry stays pending with a bounded backoff, the other aggregates keep syncing,
  and the deposit leaves at the first run after the migration. Nothing is lost, but until then it reaches
  neither the cloud nor another device — **apply the migration BEFORE shipping the build.** It is applied by
  hand, like every BeautIzzy migration.

Verified in the out-of-repo PGlite harness (§13 policy), 67 checks: the migration applied on a POPULATED
database written by the §20 functions — every existing table byte-identical, policies / grants / function
ACLs unchanged, re-run harmless (three policies, one trigger), an incremental pull after it returns nothing,
the six existing families of a full pull identical — then the table shape, RLS and grants; create,
identical re-push, void as an UPSERT (one revision, no tombstone), stale-version CONFLICT, ack-without-row
CONFLICT, a second deposit of the same Appointment, exact round trip, incremental pull, `ABSENT`, owner
hard-delete refusal, the RESTRICT foreign key protecting an Appointment that holds a deposit; the CHECK /
NOT NULL / composite-FK refusals (including an Appointment of another Business) leaving no row;
server-owned metadata; `anon` and non-owner refusals on the RPCs and the table, Business isolation,
`business_id` pinned; an older build's APPOINTMENT push leaving every deposit (and the block, the note and
the discount) untouched; and the invariant of §21.2 — a deposit within the total applied, an Appointment
reduction below the deposits refused with both amounts and nothing written or revised, a raise always accepted,
a second deposit that fits exactly applied and the one cent too many refused with no row created, a void always
accepted, the reduction going through once the deposit was voided, the linked Sale counted in the total, its
tombstone and an Appointment tombstone refused while deposits stand, a COMPLETED Appointment out of scope, and
a CLIENT push never touched by it. The V1C / V1D regression harnesses give the same results before and after the
migration (push all passed; pull 40 + its one by-design failure). Local coverage:
`appointment-deposits-sync.test.ts` — create / void → cloud, offline coalescing, several deposits, initial
upload and push order, retry without duplicate, a refused push kept pending, Business scope, cloud pull →
local with no echo, fresh-device restore (history, ACTIVE totals, VOIDED state, Cash Register and remaining
identical), invalid remote deposits and dangling references, the Appointment tombstone guard, the conflict
contract, an older remote, an older build, and the upgrade gap.

---

## 22. Client photos — a Storage path on the CLIENT aggregate (schema v13)

A Client portrait (`docs/domain/CLIENTS.md`, `photoPath`) is user data: it must survive a reinstall
and reach every device. Its bytes live in Supabase Storage; the CLIENT aggregate carries only the
stable object path. No new aggregate type, no second sync mechanism.

```text
supabase/migrations/20260925120000_add_client_photos.sql

alter table public.clients add column if not exists photo_path text;   nullable, no default
storage bucket business-media                                          private, image/jpeg, 5 MB
public.is_business_media_owner(object_name)                            first folder = an owned Business
storage.objects policies (business-media only)                         select / insert / delete, owner only;
                                                                       NO update, nothing for anon
create or replace function public.sync_push_aggregate(...)             CLIENT branch reads / writes photo_path
create or replace function public.sync_pull_business_aggregates(..)    clients[] objects carry photo_path
```

- **Object path.** `<business_id>/clients/<client_id>/<photo_id>.jpg`. The first folder is the
  Business: the Storage policies admit an object only when it names a Business the signed-in user
  owns (a non-UUID first folder is refused without ever being cast), so one Business can never
  read, list, write or remove another's photos. A new photo is a new object; an object is never
  overwritten (`upsert: false`, no update policy).
- **Lifecycle (device).** Upload the normalized JPEG → commit the path on the Client (SQLite +
  outbox, like any Client edit) → remove the replaced object, best effort. A failed upload or
  commit changes nothing; a removal clears the path first (local-first) and removes the object
  best effort. A leftover object never fails a committed change.
- **Reading.** A device resolves the path into its cached copy under
  `<documents>/client-photos/`, or downloads it once through a 60-second signed URL that is used
  for that download only and never stored. Unavailable → initials.
- **Payload.** `RemoteClientPayload.photo_path: string | null`, always sent by a build that knows
  it; clearing is an explicit `null` and follows the ordinary conflict contract (§9).
- **Older builds / older remotes.** A payload without the key keeps the stored path (the same
  `case when p_payload ? … end` rule as notes, §18); a pulled row without the key parses as "no
  photo".
- **Order of deployment: apply the migration BEFORE shipping the build that sets photos.** Against
  the previous functions a pushed path is silently dropped by `jsonb_to_record`; without the
  bucket every upload is refused (the app keeps the previous photo and says so).
- **Not covered.** Permanently deleting a Client does not remove its photo object yet (an orphan
  object, invisible to every device). Product photos use the same bucket (§23).

Verified in the out-of-repo PGlite harness (§13 policy, a stubbed `storage` schema): the migration
applied on a POPULATED database written by the previous functions — existing rows byte-identical,
`photo_path` NULL everywhere, re-run harmless, incremental pull empty — then set / replace / clear
through the push RPC, an older-build payload keeping the photo, CONFLICT on a stale version, a
non-owner push refused, and the Storage policies (own prefix only, non-UUID and root paths refused,
another bucket untouched, anon nothing, no update, cross-Business delete impossible). Local
coverage: `sync-pull-restore.test.ts` (« Client photo »), `client-photo-migration.test.ts`,
`client-photo-storage.test.ts`, `ClientProfilePhoto.test.tsx`.

---

## 23. Product photos — ONE shared photo per Product id (schema v14)

Before: a Product image was a device-local file (`products.image_uri`), never synced. The same
Product could show photo A on one device, photo B on another, nothing on a third. Now a Product has
ONE authoritative photo, identified by the Product id, in the SAME private `business-media` bucket
as Client photos (§22) and through the same lifecycle (`src/persistence/media/business-media.ts`).

```text
supabase/migrations/20260926120000_add_product_photos.sql   (builds on 20260925120000)

alter table public.products add column if not exists photo_path text;   nullable, no default
update storage.buckets … 'business-media'                              allowed types: jpeg + png
create or replace function public.sync_push_aggregate(...)             PRODUCT branch reads / writes photo_path
create or replace function public.sync_pull_business_aggregates(..)    products[] objects carry photo_path
```

- **Object path.** `<business_id>/products/<product_id>/<photo_id>.<jpg|png>` — PNG for a
  transparent cut-out (it keeps its sticker presentation). The bucket is reused, not recreated.
  **No Storage policy change**: the policies of §22 already scope every object of the bucket by its
  first folder, the Business id — Product objects get exactly the isolation of Client photos.
- **Legacy images are never promoted.** Neither the migrations, nor sync, nor any unrelated edit
  uploads `image_uri`: two devices with different legacy images would otherwise race over which one
  becomes authoritative. A Product receives a shared photo ONLY when the professional explicitly
  takes or chooses one (then saves). From then on every device shows it; a legacy image never
  overrides a `photo_path` (one precedence rule, `selectProductImageUri`, PRODUCTS.md §11).
- **Lifecycle.** Save with a new photo: normalize → upload a new object → write the Product with its
  path → remove the replaced object and the obsolete legacy file, best effort. Upload failure: the
  whole Save is refused and nothing is written. Removal: the path is cleared (synced as `null`), then
  the object is removed. Deleting the Product removes its object.
- **Reading.** Each device caches the object under `<documents>/product-photos/`, downloaded once
  through a 60-second signed URL; offline and never cached → the no-photo placeholder.
- **Payload.** `RemoteProductPayload.photo_path: string | null`, always sent by a build that knows it.
- **Older builds / older remotes.** A PRODUCT payload without the key keeps the stored path, so an
  older device changing a price or a stock count never erases the shared photo; an older build
  ignores the pulled key (and keeps showing its own legacy image, which only it can see). A pulled
  row without the key parses as "no shared photo".
- **Order of deployment: apply the migration BEFORE shipping the build that sets Product photos.**
  Against the previous functions a pushed path is silently dropped; without the PNG type a cut-out
  upload is refused (the Save is then refused and nothing is lost).

Verified in the out-of-repo PGlite harness: the migration applied on a POPULATED database written
by the previous functions — existing rows byte-identical, `photo_path` NULL on every Product, Client
photos untouched, Storage policies untouched, the bucket reused (private, 5 MB, jpeg + png), re-run
harmless — then set / replace / remove through the push RPC, another device pulling the path, an
older-build payload keeping the photo, CONFLICT on a stale version, a non-owner push refused, and
Product objects isolated per Business (own prefix only, anon nothing, no update, cross-Business
delete impossible). Local coverage: `sync-pull-restore.test.ts` (« Product photo », including two
devices with different legacy images), `product-photo-migration.test.ts`,
`ProductCatalogProvider.test.tsx`, `ProductCatalogScreen.test.tsx` (display precedence),
`ProductEditorScreen.test.tsx`.

---

## 24. Foreground refresh — idle devices pull, the UI refreshes in place

Before: an idle, already-synchronized device only pulled at launch and on return to the foreground;
the 2-minute tick ran only for its OWN pending writes (§17.2). Two open devices therefore did not
see each other's changes — stock, photos, Clients, Appointments alike — until one of them was
relaunched, backgrounded, or edited something. And when a pull did apply rows, `reloadSnapshot()`
remounted the whole tree (§16.8): navigation reset, sheets closed, drafts lost.

Now — no second mechanism, no Supabase Realtime, no new timer:

```text
foreground tick (the existing 2 min, foreground only, single-flight)
  isForegroundSyncTickDue = isSyncRunDue || isIncrementalPullAvailable
    local writes    → the existing run: push the outbox, then the incremental pull
    idle            → the same run: nothing to push, ONE incremental pull since the stored cursor
    reconciliation  → nothing (no request)
  pull applied nothing   → nothing else: no re-read, no re-render
  pull applied rows      → reloadSnapshot(): SQLite re-read IN PLACE
                             → each session provider adopts its fresh collection (useSnapshotRefresh)
                             → mounted screens re-render with the new persisted values
```

- **Guards.** Unchanged: Supabase configured, a LIVE session (never the offline fallback, never
  signed out), a bound Business, the app in the foreground, the first-sync gate settled, the worker
  and its orchestration single-flight (a tick during a run makes no second request). There is no
  connectivity probe: an unreachable remote fails the run harmlessly (`FAILED`, nothing written,
  no dialog) and the next tick tries again.
- **Cursor.** The idle pull is the ordinary incremental pull (§16.5): changes since the stored
  cursor, then the cursor advances. Never a full restore.
- **In place.** `reloadSnapshot()` keeps the persistence subtree's key: nothing is remounted. The
  Client, Service, Product, Sale, Appointment (with deposits, through the same previous-day
  reconciliation as at mount) and Calendar Block sessions replace their PERSISTED collections only.
  Drafts live in the screens (a Sale being composed, an Appointment being created or edited, a
  checkout, a Product or Client form, a search query, an open sheet) and are never touched; a draft
  refers to records by id, so it shows the synced name / stock / photo of what it references while
  keeping its own values (typed price, quantities, selected Client, step). Pulls never overwrite an
  aggregate with pending local changes (§16.6), so memory and SQLite cannot diverge.
- **Propagation delay.** A change made on one device reaches another open device within roughly
  two ticks at most: the writer pushes on its next tick (or at once on foreground), the reader pulls
  on its next tick — about 2 minutes each in the worst case.
- **Cost.** One small RPC per foreground tick for a synchronizing device; nothing in the background.

Coverage: `CloudSyncRunner.test.tsx` (idle tick pulls once with a cursor and pushes nothing; no
pull in the background; no overlapping run; no request under reconciliation; a remote change
applied in place with the same mounted screen and its local state; a no-change pull re-renders
nothing; a Product's stock 4 / photo C → stock 3 / photo D through ONE idle tick),
`SaleCreationScreen.test.tsx` (an unsaved Sale draft survives), `AppointmentCreationScreen.test.tsx`
(the whole creation draft survives), `ProductEditorScreen.test.tsx` (an open detail stays open and
updates; an unsaved edit form is never replaced), `ClientProfilePhoto.test.tsx` (a Client photo
from another device appears on the mounted profile, an open sheet stays open).

---

## 25. Appointment reminder flag — one additive nullable APPOINTMENT column (Lot B)

`appointments.client_reminder_enabled` (nullable boolean; SQLite schema v15, remote migration
`20260927120000_add_appointment_email_reminders.sql`) carries the per-appointment client
reminder override of Communications Lot B (`docs/architecture/COMMUNICATIONS.md` §12). NULL is
"never explicitly set", which the domain reads as ENABLED; the global, server-authoritative
Business preference — NOT part of any sync aggregate — remains the master switch.

Through the engine it behaves exactly like the client-notes column (§18):

- carried by the APPOINTMENT aggregate; ALWAYS sent by a build that knows it (true, false, or
  null), so an explicit choice and its removal both reach the remote;
- the push keeps the STORED value when the payload has no such key: an older build changing a
  time or a price never erases an explicit opt-out;
- the pull carries the key; a device that predates it ignores it, and
  `parseRemoteBusinessSnapshot` reads a missing key as null (older remote functions);
- the migration rewrites no row and bumps no `sync_version`: nothing is re-pushed or re-pulled
  because of it, and no unrelated sync data goes dirty.

The queue side of Lot B (`business_communication_preferences`, the reconciliation triggers, the
projection RPC) stays OUTSIDE the sync engine, like the whole Communication Core: no aggregate
type, no outbox entry, no snapshot key.

---

## 26. Entitlement refusals — the push pass on hold, the pull unaffected (BeautIzzy Plus 6.5C, step 3)

BeautIzzy Plus makes business WRITES a paid capability: a later server step (Phase 6.5C, step 4)
will make `sync_push_aggregate` answer a structured `{ "status": "ENTITLEMENT_REQUIRED" }` — nothing
written — when the owner holds no verified production Plus entitlement in the server-side mirror
(`docs/architecture/SUBSCRIPTIONS.md`). The deployed functions never answer it yet; this section is
what the CLIENT does with it, implemented and verified ahead of the server so that a refusal can
never cost a local change, nor stop a device from receiving what others changed. Reading never
needs Plus: the pull RPC is untouched by any of this.

**The rule.** A refusal is about the owner's subscription, never about one aggregate — every write
of the Business would be refused the same way. It is therefore a per-Business, recoverable
restriction, and never: an authentication failure (`FORBIDDEN` keeps stopping the run), a
rejection of the aggregate (`REJECTED` keeps its per-entry backoff), an unknown answer, a run-level
failure, a settlement or an acknowledgement.

```text
sync-gateway.ts        parses the status; whatever detail the server adds later is not read
remote-gateway.ts      RemotePushResult gains { status: 'ENTITLEMENT_REQUIRED' }
entitlement-hold.ts    ONE hold per Business in souris_metadata['sync_entitlement_hold']:
                       { businessId, refusals, refusedAt, nextAttemptAt } — trusted for that
                       Business only, like the first-sync decision; cleared by the development reset
push-worker.ts         on the refusal: the entry stays EXACTLY as it is (payload, operation, revision,
                       created instant, place in the order) with attempt_count + 1,
                       last_error = 'ENTITLEMENT_REQUIRED' and next_attempt_at = the hold's instant;
                       the hold is written with refusals + 1 and the bounded backoff of any retry
                       (1, 2, 4 … 60 minutes); the remaining eligible entries are NOT sent in this
                       run; the run goes ON to the pull. A hold still in force skips the push pass
                       without a single request; the first answer of any other kind (APPLIED,
                       ABSENT, CONFLICT, FINANCIAL_CONFLICT) for a write of the Business ends an
                       elapsed hold. `hasEligiblePushWork` / `isSyncRunDue` read false under a hold
                       (the tick never starts a run just to be refused); `isForegroundSyncTickDue`
                       stays true for a synchronizing device, so the idle tick keeps PULLING
CloudSyncRunner.tsx    Plus back — the access session turns from read-only to full (a verified
                       entitlement, a purchase, a restore): `liftSyncEntitlementHold` removes the
                       hold and makes the deferred entries eligible at once (ONE transaction; counts
                       and errors kept), then ONE run follows under the usual conditions. Only the
                       transition fires it: with enforcement disabled nothing ever does, and a tree
                       without an access provider behaves as before (`useOptionalBusinessAccess`)
```

**What the device never assumes.** A local transition to full access is not server authorization:
after the lift, the run sends the first held entry and obeys the answer — a refusal records a fresh
hold (refusals start again at 1), the change stays pending, and nothing loops. A local mutation
made under a hold (a change made during the offline grace, say) coalesces into its entry as always
and waits for the hold like the others. A hold recorded for another Business id holds nothing, and
the worker still refuses to run for a Business the device is not bound to; the outbox stays
Business-scoped, so a logout or an account switch never pushes another account's changes.

**Result shape.** A PUSHED result carries `entitlementHold: { until, refused? }` — `refused` names
the entry whose push received the refusal in THIS run, absent when the pass was skipped under a hold
recorded earlier; `failed` does not count it, `stoppedBy` is not set, `pull` is present as usual.

**Verification.** `src/persistence/__tests__/sync-entitlement-hold.test.ts` (the hold record and
its isolation; a normal push untouched; the refused entry preserved field by field with nothing
acknowledged; the pull in the same run and under the hold; several entries — one request, the
others untouched, dependency order on recovery; repeated refusals at 1, 2, 4 … 60 minutes with the
tick sending nothing in between; a mutation during the hold; a restart; recovery once each; the
server still refusing after a local lift; another Business's hold; a conflict ending the hold;
FORBIDDEN unchanged; the deployed server never refusing), `sync-gateway.test.ts` (the status
parsed, details ignored) and `CloudSyncRunner.test.tsx` (the lift and the single run on the
read-only → full transition, with and without the server agreeing, and no run without a
transition).

### 26.1 The server side (Phase 6.5C, step 4) — the RPC boundary only

`supabase/migrations/20261006120000_add_business_mutation_entitlement_enforcement.sql` adds what
the client above was prepared for, behind a SECOND server-side switch:

```text
server_feature_flags                    ONE new row, BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT, inserted
                                        false with `on conflict do nothing` — a re-run never flips it;
                                        independent of COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT and of the
                                        app's build constant
business_mutation_entitlement_enforcement_enabled()
                                        the flag reader; SECURITY DEFINER; executable by nobody (owner only)
business_mutation_is_entitled(business, at)
                                        THE rule: the signed-in caller owns the Business — the same FALSE for
                                        a foreign, a nonexistent or a NULL Business — AND (enforcement
                                        disabled, OR subscription_has_plus_access(owner, at)). SECURITY
                                        DEFINER out of necessity (the access rule and the reader are
                                        owner-only); STABLE; granted to `authenticated` ONLY — the push RPC
                                        is SECURITY INVOKER and asks it as the owner; step 5's policies will
                                        reuse it
sync_push_aggregate                     replaced IN PLACE: same signature, same grants, the deployed body
                                        plus ONE check after the owner check and the argument validation and
                                        BEFORE the `for update` read:
                                          if not business_mutation_is_entitled(p_business_id)
                                          then return '{"status":"ENTITLEMENT_REQUIRED"}'
                                        An ownership failure is still 42501, a malformed call still 22023; a
                                        refusal locks, reads and writes nothing — no version, tombstone or
                                        history moves, UPSERT and DELETE alike (a DELETE of an absent or an
                                        already tombstoned row is refused too, never ABSENT or a replayed
                                        APPLIED while unentitled; once Plus is back the replay semantics are
                                        exactly the deployed ones)
business_mutation_set_entitlement_enforcement(boolean)
                                        the operator switch: flips the row and reports how many Businesses
                                        lack Plus right now; no EXECUTE grant (table owner only); converges
                                        nothing — the device keeps and resends its refused writes (§26)
```

Untouched: the pull RPC, the count RPC, every policy, Storage, every communication and mirror
object, every row. With the switch disabled every push behaves exactly as before, for every
Business, including the accounts without any mirrored row.

**Boundary.** This is enforcement at the sync RPC. The owner-only INSERT / UPDATE / DELETE
policies of the operational tables still let a direct PostgREST table call write, the Storage
policy still lets the owner upload business media, and `communications_update_preferences` /
`communications_update_lifecycle_sms_preferences` still accept an enable: these bypass paths are
the explicit work of step 5 (the rule above reused in `with check` predicates, the Storage policy
and the preference RPCs). Server-side business-mutation protection is NOT complete before step 5.

**Deployment order.** Apply the migration BY HAND, never automatically; the deployed app builds
(step 3 and later) already parse the answer, and builds that predate step 3 would read it as an
unknown answer with backoff — another reason the switch ships disabled. Enabling is a separate,
deliberate operator step (`supabase/README.md` › Business mutation entitlement enforcement) that
presupposes the 6.5A webhook in production and the backfill of every paying account: a Business
whose owner has NO mirrored row is refused under enforcement.

**Verification.** 87 checks against the full 21-migration chain in an isolated in-process Postgres
under the strict role stub (`supabase/README.md` lists them), plus the source-level guard
`src/infrastructure/supabase/__tests__/sync-entitlement-migration.test.ts`.

### 26.2 The remaining write paths (Phase 6.5C, step 5) — protection complete at the database

`supabase/migrations/20261007120000_complete_business_mutation_entitlement_enforcement.sql` closes,
with the SAME rule `business_mutation_is_entitled(business, at)` of step 4 and nothing new about
subscriptions, the three authenticated write paths that went around the push RPC:

```text
row-level policies    the eleven operational tables — clients, services, service_phases, appointments,
                      appointment_items, appointment_phases, products, sales, sale_items,
                      calendar_blocks, appointment_deposits — have their INSERT and UPDATE policies
                      replaced UNDER THEIR NAMES (drop + create: no permissive policy of the previous
                      shape survives to OR around the rule):
                        INSERT   with check (owner AND rule)
                        UPDATE   using (owner) · with check (owner AND rule)  — the row stays targetable,
                                 so a refused update is an explicit 42501 on the new row, never "0 rows"
                        DELETE   using (owner AND rule)                       — children only; a refused
                                 delete affects 0 rows
                      SELECT policies, table grants, triggers, constraints, the tombstone model and the
                      `businesses` policies are untouched. A child's new business_id must be a Business
                      the caller owns AND may write; a parent's business_id is pinned by its trigger:
                      no row can be moved to another Business to escape the rule
Storage               `is_business_media_writable(name)` = the owner predicate AND the rule on the first
                      folder (the Business id; a non-UUID folder is refused without being cast). The
                      business-media INSERT policy uses it; SELECT and DELETE stay owner-only (reading,
                      listing and REMOVING a photo need no Plus: cleanup and privacy); there is still no
                      UPDATE policy — an object is never overwritten, a replacement is a new object
preference RPCs       communications_update_preferences, communications_update_sms_preferences (dormant),
                      communications_update_lifecycle_sms_preferences: after the owner check and the
                      required-argument check, BEFORE any validation or write, a request that would turn
                      a switch ON that is not already on answers { "status": "ENTITLEMENT_REQUIRED" }
                      unless the rule holds. Turning OFF, keeping ON (a Reply-To edit, a knob change) and
                      every deployed answer (UPDATED, INVALID_REPLY_TO, INVALID_VALUE, 42501, 22023) are
                      byte-identical. The 6.5B scheduling, worker gate and switch are not rewritten
```

**What a read-only account keeps, by design:** every read (SELECT policies, the pull and count
RPCs, Storage SELECT); authentication and the Business profile; disabling any communication;
removing a photo; every service-role path (the worker, the webhook and the mirror functions never
run as `authenticated`). The only write an unentitled owner may still make to a business table is
the WITHDRAWAL of a client's promotional SMS consent — nothing else of the client, never a grant —
through the push RPC's narrow exception of step 8 (§26.3); every other consent change the
professional records on a client is a business mutation, guarded by the application since Phase 4
(`write-guard.ts`); the client's own STOP path (`CLIENT_STOP`, reserved) is a server-side write and
unaffected.

**Disabled = unchanged.** While the switch is off the rule answers TRUE for every owner, so every
policy, the Storage policy and the three RPCs behave exactly as the deployed ones: the effective
write permissions of the shipped app builds are the same, including for accounts without any
mirrored row. Applying the migration reads, writes, reschedules or deletes no row.

**Client impact once enabled.** Deployed builds never write tables directly (the engine pushes
through the RPC), so the policy change is invisible to them; a photo upload refused by Storage is
reported by the media gateway as an upload failure and the previous photo is kept (the row change
waits in the outbox like any other); a preference refusal is read by the deployed gateway as an
unknown answer (`BADRESULT`) and shown as a generic failure, with nothing changed — the dedicated
wording is a later client step.

**What PGlite does not prove.** The harness runs the policies on a Storage STUB (`storage.objects`
with RLS and the platform's grants, `storage.foldername`); the real Storage API (upload with
`upsert: false`, the object owner columns, listing), PostgREST's own translation of a WITH CHECK
violation into an HTTP answer, and the platform's default grants are rehearsed on Staging
(`supabase/README.md` › Business mutation entitlement enforcement — step 5 › Staging checklist),
never claimed from the stub.

**Verification.** 378 checks against the full 22-migration chain under the strict role stub (every
table, insert / update / delete, the status grid, cross-Business and tenant-escape attempts, the
OR-bypass test, Storage, the preference gates, consent and history, the two switches, the idempotent
re-run, effective privileges), plus the source guard
`src/infrastructure/supabase/__tests__/business-mutation-policies-migration.test.ts`; the step 4
(87), 6.5A (81) and 6.5B (144) harnesses still pass with the migration appended.

### 26.3 The consent-withdrawal exception (Phase 6.5C, step 8)

`supabase/migrations/20261009120000_add_client_consent_withdrawal_exception.sql`,
`src/domain/clients/consent-withdrawal.ts`. ONE business write is privacy-protective rather than
paid: WITHDRAWING a client's promotional SMS consent. The server schedules lifecycle SMS from its
own copy of the consent (`COMMUNICATIONS.md` §34–§44), so a withdrawal that stays on a read-only
device protects nobody. Step 8 lets it through, on both sides, under one rule:

```text
a CLIENT UPSERT whose payload says sms_marketing_consent = 'OPTED_OUT'
and whose every OTHER key equals the stored row
(first_name, last_name, phone, email, birthday, notes, photo_path, archived_at)
```

- **Device** (`ClientSessionProvider.updateClient`): an edit that satisfies
  `isClientSmsConsentWithdrawalOnly(current, next)` — next consent OPTED_OUT, every identity field
  unchanged — skips the write guard; it is written to SQLite and queued like any Client edit.
  Granting or clearing a consent, or a withdrawal bundled with any other change, is guarded as
  before (`BusinessAccessDeniedError`, nothing written).
- **Server** (`sync_push_aggregate`, replaced in place with the step 4 body plus the exception
  INSIDE its refusal branch): when the rule refuses, a CLIENT UPSERT is first handed to
  `sync_withdraw_client_sms_consent` — SECURITY DEFINER, owner-checked, EXECUTE for
  `authenticated` only — which answers NULL for anything that is not exactly a withdrawal of an
  existing, non-deleted client of the caller's Business (the refusal then stands:
  `ENTITLEMENT_REQUIRED`, nothing written, the entry held on the device until Plus is back —
  nothing is discarded), and otherwise writes the THREE consent columns of that one row and
  nothing else, answering `{ "status": "APPLIED", "sync_version": n }`. The before-write trigger
  bumps the version and the instant; the lifecycle trigger cancels the client's pending offers.
  An already withdrawn consent is acknowledged with the current version; a withdrawal on top of
  an unseen revision whose other fields are identical is applied (it overwrites nothing else) and
  the device pulls the new version as usual.
- **Direct PostgREST writes** are untouched: the step 5 policies still refuse an unentitled
  owner's UPDATE of `clients`, consent included. The exception is reachable through the two
  functions only; a direct call of the helper by the owner withdraws her own client's consent the
  same way and can do nothing else; another owner's client is 42501.
- **Disabled = unchanged.** The refusal branch is never entered while the switch is off, so every
  push behaves exactly as before.

Known limit: an entry queued BEFORE access lapsed that already carries another change of the same
client, then a withdrawal recorded while read-only, is one payload with both — not a pure
withdrawal — and stays held until Plus returns (the only way to split it would be a second queue).
Verification: a 56-check PGlite harness (`supabase/README.md` › Client consent withdrawal), the
source guard `client-consent-withdrawal-migration.test.ts`, the fake remote's replica of the rule
(`sync-entitlement-hold.test.ts`) and the provider tests
(`business-mutation-protection.test.tsx`).

## 27. Service categories and descriptions — a new aggregate type and two SERVICE keys (schema v17)

Multi-profession Step 3 (`docs/domain/SERVICES.md` §11). One more aggregate of the same outbox →
push → pull / restore pipeline, plus two optional keys on SERVICE. No second engine.

```text
SERVICE_CATEGORY   service_categories        { name, description | null, position }
SERVICE            services + service_phases  + category_id | null, description | null
```

- **Push order.** SERVICE_CATEGORY goes with the Clients (rank 0), before the Services that name
  it. No foreign key either way: the order is a courtesy, not a requirement.
- **Always both keys.** A build that knows the fields always sends `category_id` and
  `description` (values or nulls). The remote KEEPS the stored values when a payload omits a key —
  the payload of a build that predates them — so an older device editing a price never erases a
  description (`p_payload ? 'description'`, like `clients.notes`).
- **Pulled payloads.** A pulled SERVICE without the keys (a remote that predates them) keeps the
  local values; an explicit null clears. The `service_categories` family is optional in the pull
  (absent = none) and validated like every family.
- **Deletion.** Deleting a category locally records its DELETE plus one SERVICE upsert per
  detached Service. A pulled category tombstone removes the local row; Services still naming it
  read as uncategorized.

### 27.1 Rollout safety — a build ahead of its remote

- **Readiness proof.** The pull of a migrated remote always carries the `service_categories` key
  (an empty array when there is none). The first pull or restore that sees it records
  `sync_remote_service_catalogue` (`souris_metadata`).
- **Deferral.** Until then the push worker DEFERS every write an old remote would lose silently:
  any SERVICE_CATEGORY entry (the old functions reject the type) and any SERVICE upsert carrying a
  non-null category or description (`jsonb_to_record` would drop the keys and still acknowledge).
  A deferred entry is never sent and never acknowledged; it keeps `last_error =
  REMOTE_SCHEMA_PENDING` and the bounded backoff. The proof clears that backoff, so the writes go
  with the next run. A SERVICE write without the new fields syncs as always: an unmigrated
  Production never stalls the existing catalogue.
- **One-time refresh.** A build that predates v17 stored pulled Services without the two fields
  and acknowledged their revisions; the pull skips acknowledged revisions, so the upgraded device
  would never adopt them. Schema v17 therefore clears the pull cursor and arms
  `sync_service_catalogue_refresh`: while armed, the pull re-applies a SERVICE revision EQUAL to
  the acknowledged one when nothing is pending locally (exactly the state the device had, plus the
  fields). The first complete pull that finishes disarms it; a restore disarms it too.
- **Known limit.** A device that stays on an OLD build while another sets a description, then
  upgrades WITH a pending local change to that Service, pushes the description it never received
  (null). The refresh never overrides a pending change by design; the window closes once every
  device runs the new build. Production has one device per Business today.

Verification: `service-catalogue-sync.test.ts` (fake remote, migrated and unmigrated),
`service-categories-store.test.ts`, `service-catalogue-migration.test.ts`, the source guard
`service-catalogue-migration.test.ts` (infrastructure) and a 48-check PGlite harness
(`supabase/README.md` › Service categories and descriptions).

## 28. Sale adjustments — a new aggregate type with server-side ceilings (schema v18)

Corrections and refunds of completed Sales (`docs/domain/SALES.md` §15) are their OWN aggregate,
`SALE_ADJUSTMENT`, of the same outbox → push → pull / restore pipeline. No second engine.

```text
supabase/migrations/20261011120000_create_sale_adjustments.sql

sale_adjustments        (business_id, id) PK; composite FK to sales (RESTRICT) and to the refund a
                        REVERSAL neutralises; kind / status / reason vocabularies; integer cents;
                        voided_at exactly when VOIDED; refunded_at + settled_at together, present
                        once SETTLED; at most ONE live reversal per refund (unique index)
sale_adjustment_items   its lines, copied from the Sale snapshot; written once (select / insert only)
helpers                 sync_sale_adjustment_transition_allowed, sync_sale_refundable_base_cents,
                        sync_sale_adjustment_breach
RPCs replaced in place  count (+ sale_adjustments), push (SALE_ADJUSTMENT, immutability, ceilings,
                        Sale-row lock), pull (+ the sale_adjustments family, always present)
```

- **Why its own aggregate.** A SALE push replaces the Sale's whole child set; an adjustment placed
  under `sale_items` would be erased by an older build pushing the Sale. As its own aggregate an
  adjustment is never named by an older build, so it can never be overwritten or deleted by one.
- **What travels.** `RemoteSaleAdjustmentPayload` (`sale_id`, `kind`, `reverses_adjustment_id`, `reason`,
  `note`, `staff_member_id`, `refund_card_cents`, `refund_cash_cents`, `initial_status`, `status`,
  `refunded_at`, `settled_at`, `voided_at`, `recorded_at`, `items[]`). Instants exact; cents exact.
- **Push order.** After SALE and PRODUCT (rank 7): the Sale exists remotely first (FK), and the
  restocked PRODUCT carries its own new quantity — applying a pulled adjustment NEVER moves stock,
  so the same units are never restored twice.
- **Immutability (server).** A stored adjustment never changes but for its status, forward only
  (`PENDING → SETTLED | VOIDED`); an identical replay passes. Any other change, or an adjustment
  tombstone, answers `{ status: 'ADJUSTMENT_CONFLICT', sale_id, reason: 'IMMUTABLE' }` — nothing written.
- **A Sale that holds adjustments is FROZEN — answered `CONFLICT`.** Any SALE upsert that would change
  its row or its lines, and any SALE tombstone, while a live adjustment names it, is undone and answered
  `{ status: 'CONFLICT', sync_version }`; an identical replay still passes. `CONFLICT` — not
  `ADJUSTMENT_CONFLICT` — on purpose: it is the refusal EVERY build understands, including the Production
  build that predates adjustments (an unknown status would read as a run-level failure there: push stopped,
  pull skipped). Such a build keeps that ONE entry pending with its bounded backoff and `last_error =
  CONFLICT`, reports a conflict, pushes every other pending entry and still pulls; it is never told the
  write was applied, and nothing remote is touched. Only builds that know adjustments ever push a
  SALE_ADJUSTMENT, so only they ever receive `ADJUSTMENT_CONFLICT`. Typical trigger: an older build
  removing a Revente line after checkout (allowed by its own rules) on a Sale another device refunded.
- **Ceilings (server, concurrent devices).** Every SALE / SALE_ADJUSTMENT write locks the Sale row
  (`FOR UPDATE`), then evaluates `sync_sale_adjustment_breach` INSIDE its savepoint on the state it would
  leave: Σ effective refunds ≤ the refundable base (`CEILING`), Σ units per line ≤ sold (`UNITS`), a
  compensation answers exactly one settled refund for its whole amount — `RECORDED_IN_ERROR` with the
  same methods on the same day, `REFUND_RETURNED` on or after the refund day, any methods (`REVERSAL`).
  Two devices refunding the same Sale offline are evaluated one after the other; the SECOND is refused
  and nothing of it is written.
- **Client behaviour.** `RemotePushResult` gained `ADJUSTMENT_CONFLICT`. The worker keeps the entry
  pending (`last_error = ADJUSTMENT_CONFLICT`, bounded backoff), reports it (`adjustmentConflicts`), and
  goes on. The record stays on the device and reads « Refusé par le serveur … À vérifier. » — it is
  never presented as synchronized. Resolution is explicit and says what really happened (§28.1): money
  not returned → the refused record is voided (the one case a SETTLED record may be voided,
  `isSaleAdjustmentServerRefused`: refused AND never acknowledged) and the VOIDED record syncs as
  history; money returned → it is voided AND an exceptional outflow records the money. Nothing is
  merged, clamped or dropped.
- **Rollout safety.** Until a pull answers with the `sale_adjustments` key (`sync_remote_sale_adjustments`,
  `sale-adjustment-sync.ts`), the worker DEFERS every SALE_ADJUSTMENT entry (`REMOTE_SCHEMA_PENDING`):
  money is never sent to — or "acknowledged" by — a remote that does not enforce the ceilings. Schema v18
  clears the pull cursor. Older builds ignore the family; an older remote's pull parses as "none".
- **Pull and restore.** Validated like every family (vocabularies, cents, status ↔ instants, a
  reversal without lines); a complete dataset whose live adjustment names a Sale it does not hold is
  refused; a pulled adjustment whose Sale is missing locally is fetched again (`RemoteReferenceMissingError`).
  A pulled SALE tombstone is `BLOCKED` locally while the Sale holds an adjustment.

Verified locally: `src/persistence/__tests__/sale-adjustments.test.ts` (fake remote, two devices,
deferral, replay, restore, isolation, and the Production build's trim / removal of a frozen Sale) and an
out-of-repo PGlite 0.2.17 harness with the strict role stub (62 checks, migration applied on a database
populated through the previous functions, then re-applied; every answer to a SALE write stays in the
vocabulary the Production build parses). PGlite is single-connection: the Sale-row lock is verified for its presence and effect on
sequential writes, NOT under true parallel transactions — validate on Staging with two devices.


### 28.1 Exceptional outflows after a refusal (no schema change; remote 20261012120000)

The resolution « l’argent a bien été rendu » of a refused refund (SALES.md §15.1) writes, in ONE local
transaction, the refused record VOIDED and a NEW SALE_ADJUSTMENT whose id is `<refused id>-outflow`:
kind REFUND, money only, SETTLED, same amounts / methods / refund day / reason / note / operator. Two
ordinary SALE_ADJUSTMENT outbox entries; the voided record's entry is the older one, so it normally
reaches the remote first. No SQLite migration, no new aggregate type, no new payload key: the link IS
the identity, so a pull or a restore recovers it.

- **Remote rule** (`supabase/migrations/20261012120000_add_sale_refund_outflows.sql`): ONE function
  body replaced (`sync_sale_adjustment_breach`) and ONE immutable helper
  (`sync_sale_refund_outflow_source`). An outflow is excluded from the money and unit ceilings; it must
  be money only (no item), > 0, kind REFUND, SETTLED at once; when the remote holds its refused record,
  that record must be the same refund (Sale, card and cash cents, refund day), settled when recorded,
  and now VOIDED — so the same money never counts twice, whichever arrives first (an outflow before its
  source is accepted; a LIVE source after its outflow is refused). Refusals answer
  `ADJUSTMENT_CONFLICT` with reason `OUTFLOW` and write nothing. `sync_push_aggregate`, the pull, the
  Sale-row lock and the immutability rule are unchanged (an identical replay passes; any other content
  under the same id is `IMMUTABLE`).
- **In front of a remote without 20261012120000** the outflow is answered `CEILING` like any
  over-refund: kept pending, shown « Pas encore acceptée par le serveur (il doit être mis à jour) », never
  voidable, still counted in the Caisse, sent once the migration is applied.
- **Older builds.** The Production build (TestFlight 10, v17) never names SALE_ADJUSTMENT. A v18 build
  without outflows never creates such an id; pulling one, it reads an ordinary settled refund (money
  counted, its local « remaining » for that Sale floors at 0).

Verified locally: `src/persistence/__tests__/sale-adjustments.test.ts` (both answers, two devices,
idempotent replay with a lost acknowledgement, restock taken back, restore, an unmigrated remote, the
modelled remote rule incl. order) and an out-of-repo PGlite 0.2.17 harness (59 checks for the new
migration on a populated database, re-run; the 62 checks of 20261011120000 re-run with it applied on
top). True parallel transactions remain a Staging check (§28).

### 28.2 No new refund once refunds + outflows reach the base (no schema change; remote 20261013120000)

Exceptional outflows stand outside the ceiling of normal refunds (§28.1), so the ceiling alone still
accepted a NEW refund for the room it never used: an 18 € Sale, 12 € refunded, 10 € really returned
after a refusal (22 € given back) still accepted 6 € more.

- **Client.** `remainingCents` = base − effective refunds − effective outflows, floored at 0. It drives
  every path: `getSaleActions` (no « Rembourser », no « Rembourser intégralement »), the refund screen
  (« Encore remboursable », the default amount, validation), `prepareSaleAdjustment` in the session and
  the store's in-transaction re-check. Unit corrections and compensations stay available.
- **Remote (`sync_sale_adjustment_breach`, ONE function replaced in place).** A NEW money refund — a row
  this very transaction inserted (`created_at` is server-owned: now(), never moved by
  `sync_push_aggregate`'s ON CONFLICT), not an outflow, amount > 0, PENDING or SETTLED — is refused
  (`ADJUSTMENT_CONFLICT`, reason `CEILING`, nothing written) when effective refunds + effective outflows
  exceed the base. Not a state rule on purpose: the breach reads the whole Sale after every write, and a
  state rule would refuse the outflow that records the over-refund and every later write of that Sale
  (replays, a pending refund settled, compensations, unit corrections). The Sale-row lock serialises
  the writes of one Sale.
- **Concurrent devices.** A device that refunded offline before it pulled the outflow is refused like
  any over-refund; the current build then asks whether that money really left (§28.1), so real money is
  carried forward as another outflow, never erased.
- **Compatibility.** TestFlight 10 (v17) never names SALE_ADJUSTMENT. Every answer is one adjustment
  builds already know (`ADJUSTMENT_CONFLICT` / `CEILING`). A v18 build without outflows read a pulled
  outflow as a normal refund, so its local remainder was already 0. Without this migration, the remote
  keeps accepting such refunds from devices that have not pulled the outflow yet (the current build
  refuses them locally once it has it).

Verified locally: `src/domain/sales/__tests__/refund-outflow.test.ts`, `sale-actions.test.ts`,
`SaleRefundRefusal.test.tsx` (route and session bypass), `ClientPurchaseActions.test.tsx`,
`src/persistence/__tests__/sale-adjustments.test.ts` (modelled remote rule, an offline device refused
then carried forward, the store re-check) and an out-of-repo PGlite 0.2.17 harness (52 checks: the gap
before the migration, no row rewritten, new refunds refused settled or pending, replays / status moves /
compensations / unit corrections / outflows accepted, compensations freeing room, partial balances, the
plain ceiling and the outflow rule unchanged; the 59 + 62 checks of §28.1 / §28 re-run with it on top).

Superseded in one point by §28.3: « new » is no longer read from `created_at = now()`.

### 28.3 The new refund is the row the write inserted (no schema change; remote 20261014120000)

`now()` is the start instant of the whole TRANSACTION. Keyed on `created_at = now()`, the §28.2 rule
read every refund a transaction had inserted as « new » to every later write of that transaction (and a
refund committed by a transaction that started in the same microsecond as « new » too): a legitimate
outflow, compensation, status move or replay written after it was refused `CEILING` (18 € Sale: refund
12 € accepted, then — same transaction — the outflow of a refused 10 € refund refused). It never wrongly
ACCEPTED: the write's own row always matched. The app sends one write per RPC transaction, so no device
met it; the rule no longer rests on that.

- **Remote.** `sync_push_aggregate` (replaced in place, otherwise identical to 20261011120000) passes its
  own id as the inserted adjustment when, under the locks it already holds, the remote did not hold that
  record (or held it tombstoned) — NULL for a replay or a status move. New overload
  `sync_sale_adjustment_breach(uuid, text, text)`: the §28.2 body judging only that row. The former
  `sync_sale_adjustment_breach(uuid, text)` is the state rules only (NULL inserted row); nothing calls it.
- **Unchanged.** Every answer for one write per transaction, the Sale-row lock, immutability, the
  savepoint, payloads, the pull, stored rows. TestFlight 10 (v17) never names `SALE_ADJUSTMENT`. The fake
  remote (`realRefundCeiling`) already modelled « the id this write created ».

**Adjustment identity under concurrency (same migration).** Two concurrent pushes of the SAME adjustment
id naming DIFFERENT Sales locked different Sale rows; the second missed the first's uncommitted insert,
skipped the immutability check and went through `ON CONFLICT DO UPDATE` — a SETTLED refund could become
VOIDED and gain another Sale's line, and the device was told `APPLIED`. Now, for `SALE_ADJUSTMENT`:

- a transaction-scoped advisory lock on (Business, adjustment id), taken after the entitlement check and
  BEFORE any row lock — lock order is always advisory → Sale row → adjustment row; a `SALE` write takes
  only the Sale row, so one write per transaction cannot close a cycle;
- `sync_sale_adjustment_payload_differs` — the 20261011120000 immutability comparison as one function,
  read by the pre-write check and by a post-write check;
- `ON CONFLICT … DO UPDATE … WHERE` the forward status rule;
- after the write, inside the savepoint: the stored record must equal the payload (identity, Sale, amounts
  per method, lines, status, instants), otherwise everything is undone and the answer is `IMMUTABLE`.

The lock alone and the post-write check alone each close the race (both verified).

Verified locally: source guard `refund-write-scoped-newness-migration.test.ts`; a real local PostgreSQL 17
cluster with genuine concurrent connections (same id / same or other Sale, other method, owners, concurrent
refunds, status races, outflow vs stale refund, lock order, deadlock victim rolled back whole); out-of-repo PGlite 0.2.17
matrix run on the chain without and with the migration (several writes per transaction, different Sales,
replays, lost acknowledgements, pending → settled, voids, compensations, stale devices, a historical row
stamped with the transaction instant). Concurrency between two connections cannot run in PGlite: it rests
on the unchanged Sale-row lock, validated on Staging for §28.2.

---

## 29. Reactive synchronization and pull-to-refresh — the UI follows every run

Before: a pull that applied rows re-read the snapshot in place (§24), but a run that only PUSHED
rewrote the sync bookkeeping — `sync_outbox` settled or refused, `sync_state` acknowledged — without
touching one operational row, so nothing re-rendered. The status a refund shows (« Pas encore
synchronisé », « Synchronisé », « Refusé par le serveur ») is read from that bookkeeping, and stayed
stale on the open Sale detail and in the Caisse until the user left the screen. And no product
screen could ask for an exchange: the next tick was the only way.

Now — the same runner, the same worker, no second mechanism, no timer added:

```text
run result
  changed operational rows (restore, applied / deleted pull)   → reloadSnapshot()          (§24, unchanged)
  changed the sync bookkeeping (didSyncRunChangeSyncBookkeeping:
    an entry enqueued, sent, failed, in conflict, refused;
    an aggregate acknowledged by a pull)                       → CloudSyncRevision + 1
  exchanged nothing (idle tick)                                → nothing: no re-read, no re-render

CloudSyncRevision (providers/CloudSyncRevision.tsx)
  a counter the runner provides; its own context and module, apart from the control
  SaleSessionProvider subscribes: its sync-state getter follows the revision, its consumers
  re-render and read the fresh states — the refund status changes on the screen that is open,
  within the run that sent it

pull-to-refresh (features/sync)
  SyncRefreshControl   the platform RefreshControl in the brand accent, one per list / summary
  useSyncRefresh       the ONE behaviour: refreshNow() of the control, the indicator for the
                       real duration of the run, one request for any number of pulls
  refresh-outcome      SYNCED | FAILED | UNAVAILABLE, read from the run result alone
```

- **`refreshNow` joins.** The runner's orchestration lives in `cloud-sync-orchestration.ts`: `runOnce`
  (the automatic triggers) answers `SKIPPED / ALREADY_RUNNING` during a run, as before; `refreshNow`
  returns the promise of the run in flight — a tick, a foreground return, another screen's pull —
  or starts one. Ten quick pulls therefore make ONE request, and the native indicator lasts until
  that run ends. The lock outlives the orchestration (one per runner), so a run started under the
  previous conditions is still in flight for the next.
- **A real exchange.** The gesture runs the ordinary run: pending local writes go up first, then
  what changed elsewhere comes down under the conservative contract (§9). Local-first is untouched:
  nothing is lost, nothing is replaced, conflicts and refusals are the ones §15–§16 and §28 report,
  and they are shown by the record they concern — never by the gesture. A device whose first sync
  is EMPTY (both sides empty) does not poll (§17.2); the pull is how it discovers a first record
  created elsewhere (the run counts the remote again → RESTORE_REQUIRED → restored).
- **Nothing implied.** `OFFLINE` (the remote could not be reached), `FAILED` (a transport or server
  failure, invalid remote data) and `UNAVAILABLE` (no live session, no gateway, a first sync waiting
  for a reconciliation): the indicator retracts, the local data stays, and ONE line is said three
  ways at once — a warning haptic, a screen-reader announcement, and a small floating glass capsule
  (`SyncRefreshFeedback`, mounted once in the `(app)` layout, the material of the receipt printer's
  action notice) that leaves after 2.6 s and takes no touch. « Actualisation impossible. Vérifiez
  votre connexion. » / « … Réessayez. » / « … pour le moment. ». The capsule is hidden from assistive
  tech (the announcement already says it); a newer line replaces the current one, so pulls that
  joined one run never stack. `SYNCED` says nothing: the data speaks. Nothing advertises the gesture
  when idle — no hint text, no arrow, no header button, no tutorial. Where NO runner is mounted at
  all (`CloudSyncControl.runner` false: the Playground demo, a tree without a runner) the gesture
  retracts and says nothing — a demo has no remote, so it cannot fail to reach one. The host is
  mounted after the Stack with an Android elevation: Android orders elevated siblings by elevation
  first, and the native screen stack is one.
- **Android.** A ScrollView given a `refreshControl` is wrapped in a SwipeRefreshLayout there, which
  the react-native-screens `ScrollViewMarker` refuses as a child (a native crash of the Agenda tab,
  found on the emulator). `TabBarGlassScrollEdge` therefore mounts the marker on iOS only — Android
  has no scroll-edge effect to hide anyway.
- **Where.** Accueil, Agenda (Day timeline, Week view), Caisse, Ventes, the Sale detail, Produits
  (list and empty states), Clientes (directory, empty state included), the client appointment and
  purchase histories.
- **Rendering.** The revision context re-renders its subscribers only; the control context is
  unchanged for a run (the root navigator and the Plus control never re-render for it). An idle run
  advances nothing. The product never reads the first-sync gate or an approval: the production
  boundary test enumerates the readers.
- **Not changed.** The triggers (launch, foreground, the 2-minute tick, Plus back), their guards,
  the worker, the conflict contract, the financial rules, the remote schema. A local write still
  leaves the device with its next tick or its next pull: a change made on one device reaches another
  open device within two ticks at most, or at once through the gesture on both sides.

Coverage: `cloud-sync-orchestration.test.ts`, `CloudSyncRefresh.test.tsx` (revision after a push-only
run, none after an idle one; a real exchange on refresh; three pulls → one request; offline refresh
keeps the pending write), `features/sync/__tests__` (indicator for the run, outcomes, the capsule:
offline / failed / unavailable lines, none on success, one for joined pulls, gone after its hold),
`HomeRemoteRefresh.test.tsx` (the gesture on Accueil, the tick without a gesture, nothing advertised),
`SaleRefundSyncStatus.test.tsx` (pending → sent, offline stays pending, server refusal appears on the
open detail), `CashRegisterRemoteRefresh.test.tsx`, `ProductCatalogRemoteRefresh.test.tsx`,
`ClientDirectoryRemoteRefresh.test.tsx`, `SalesHistoryRemoteRefresh.test.tsx`,
`AgendaRemoteRefresh.test.tsx` — all through `providers/testing/cloud-sync-harness.tsx`: device A
uploads, this device restores under the real stack, the tick and the gesture are the app's own.
