// Souris — SQLite schema
//
// Each entry is one forward-only migration. `PRAGMA user_version` records the
// last applied version; a database is never wiped on mismatch. Add a new
// entry for every future change — never edit an applied migration.
//
// Snapshot philosophy: Appointment items/phases and Sale items are historical
// snapshots. They reference `service_id` / `product_id` as plain metadata,
// with NO foreign key to the catalog tables, so deleting a Service or a
// Product never touches history. Nested rows (phases, items) DO cascade
// from their owning record so no orphan is ever left behind.

import type { SourisDatabase } from './database';

export interface Migration {
  readonly version: number;
  readonly up: (db: SourisDatabase) => void;
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS souris_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  birth_date TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SERVICE', 'TECHNIQUE')),
  price REAL NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS service_phases (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  requires_staff INTEGER NOT NULL CHECK (requires_staff IN (0, 1)),
  PRIMARY KEY (service_id, position)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  notes TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('CLIENT', 'BUSINESS')),
  cancellation_reason TEXT,
  no_show_recorded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);

CREATE TABLE IF NOT EXISTS appointment_items (
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  item_order INTEGER NOT NULL,
  service_id TEXT NOT NULL,
  service_option_id TEXT,
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('SERVICE', 'TECHNIQUE')),
  price REAL NOT NULL,
  PRIMARY KEY (appointment_id, id)
);

CREATE TABLE IF NOT EXISTS appointment_phases (
  appointment_id TEXT NOT NULL,
  appointment_item_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  requires_staff INTEGER NOT NULL CHECK (requires_staff IN (0, 1)),
  PRIMARY KEY (appointment_id, appointment_item_id, position),
  FOREIGN KEY (appointment_id, appointment_item_id)
    REFERENCES appointment_items(appointment_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  barcode TEXT,
  image_uri TEXT,
  price REAL NOT NULL,
  stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  client_id TEXT,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);

CREATE TABLE IF NOT EXISTS sale_items (
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  PRIMARY KEY (sale_id, id)
);
`;

/**
 * Schema v2 — Client lifecycle. A nullable ISO instant; NULL means active.
 * Existing rows keep NULL, so every persisted Client stays active after the
 * upgrade. No data is copied, rewritten, or re-seeded.
 */
const SCHEMA_V2 = `
ALTER TABLE clients ADD COLUMN archived_at TEXT;
`;

/**
 * Schema v3 — local account binding. ONE row (enforced by the `singleton`
 * primary key) caches the Business this device's data belongs to, together
 * with the owning Auth user id, so Souris opens offline once onboarding
 * completed. Existing rows in every other table are untouched; the row is
 * created only when the owner completes (or reconnects to) Business setup.
 * Never stores tokens or the owner's email — Auth identity stays inside the
 * Supabase client storage.
 */
const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS business_profile (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  owner_first_name TEXT NOT NULL,
  owner_last_name TEXT,
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Schema v4 — Client birthday as day + month only. The new `birthday` column
 * holds the civil `MM-DD` key (docs/domain/CLIENTS.md §2). Existing rows keep
 * their birthday: the month and day of every well-formed historical
 * `birth_date` (`YYYY-MM-DD`) are copied, the year is dropped, and nothing
 * else is touched — no wipe, no reseed, no Client loss. The legacy
 * `birth_date` column is retained untouched for backward compatibility but is
 * no longer read or written; the hydrated Client never pretends the year was
 * meaningful.
 */
const SCHEMA_V4 = `
ALTER TABLE clients ADD COLUMN birthday TEXT;
UPDATE clients
SET birthday = substr(birth_date, 6, 5)
WHERE birth_date IS NOT NULL
  AND birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
`;

/**
 * Schema v5 — Appointment checkout & Cash Register V1.
 *
 * `sales.appointment_id` links a Sale opened from Appointment Details
 * (« Revente ») to its Appointment. Plain reference metadata: NO foreign
 * key and NO cascade, so deleting an Appointment can never delete or rewrite
 * a historical Sale. Existing Sales keep NULL (standalone).
 *
 * `appointments.paid_at / card_amount_cents / cash_amount_cents` hold the
 * explicit checkout: NULL everywhere means "never checked out" — including
 * every existing COMPLETED Appointment, which receives no fabricated payment.
 * A recorded payment has an ISO instant and two non-negative INTEGER cents.
 * No wipe, no reseed, no row rewritten.
 */
const SCHEMA_V5 = `
ALTER TABLE sales ADD COLUMN appointment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_appointment_id ON sales(appointment_id);
ALTER TABLE appointments ADD COLUMN paid_at TEXT;
ALTER TABLE appointments ADD COLUMN card_amount_cents INTEGER
  CHECK (card_amount_cents IS NULL OR card_amount_cents >= 0);
ALTER TABLE appointments ADD COLUMN cash_amount_cents INTEGER
  CHECK (cash_amount_cents IS NULL OR cash_amount_cents >= 0);
`;

/**
 * Schema v6 — standalone Sale payment. The same three nullable columns as
 * the Appointment checkout: NULL everywhere means "no payment recorded",
 * which is what every existing Sale keeps (historical and Appointment-linked
 * Sales never receive a fabricated payment). No wipe, no reseed, no row
 * rewritten.
 */
const SCHEMA_V6 = `
ALTER TABLE sales ADD COLUMN paid_at TEXT;
ALTER TABLE sales ADD COLUMN card_amount_cents INTEGER
  CHECK (card_amount_cents IS NULL OR card_amount_cents >= 0);
ALTER TABLE sales ADD COLUMN cash_amount_cents INTEGER
  CHECK (cash_amount_cents IS NULL OR cash_amount_cents >= 0);
`;

/**
 * Schema v7 — Cloud Sync V1B: local outbox and sync acknowledgement state.
 *
 * `sync_outbox` holds ONE current pending record per aggregate — the
 * `(business_id, aggregate_type, aggregate_id)` key is UNIQUE — written in
 * the same transaction as the business mutation it describes. `operation`
 * is the latest local intent (UPSERT: the current local row must reach the
 * remote; DELETE: a remote tombstone must be sent; the local row is already
 * gone). The row carries only the aggregate identity, never a payload: the
 * future worker reads the current local aggregate at push time.
 * `revision` increases on every coalesced mutation so a worker can settle an
 * entry only if nothing changed while it was pushing. `attempt_count`,
 * `last_error` and `next_attempt_at` are worker bookkeeping (V1C) tied to
 * that revision; a coalesced mutation resets them.
 *
 * `sync_state` records, per aggregate, the remote `sync_version` last
 * acknowledged by this device. It is never written by a local mutation and
 * starts empty: a local-only entity has no acknowledged remote revision.
 *
 * Both tables are created empty. No business row is touched, no wipe, no
 * reseed. `business_id` is the bound Business UUID (`business_profile.id`).
 */
const SCHEMA_V7 = `
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (
    aggregate_type IN ('CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE')
  ),
  aggregate_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  next_attempt_at TEXT,
  UNIQUE (business_id, aggregate_type, aggregate_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (
    aggregate_type IN ('CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE')
  ),
  aggregate_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL CHECK (remote_version >= 1),
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (business_id, aggregate_type, aggregate_id)
);
`;

/**
 * Schema v8 — Cloud Sync V1C-0: monetary values persisted as integer cents.
 *
 * The four euro `REAL` price columns (`services.price`,
 * `appointment_items.price`, `products.price`, `sale_items.unit_price`)
 * become exact non-negative INTEGER cents under explicit names
 * (`price_cents`, `unit_price_cents`), the representation the remote
 * schema already uses and that a sync engine can compare byte for byte.
 *
 * Per table, in ONE transaction with the version bump: add the cents
 * column, convert every existing row with `ROUND(value * 100)` (never a
 * truncating cast: 12.50 → 1250, 0.99 → 99, 0.29 → 29), then drop the
 * legacy REAL column so no runtime SQL can still read or write it. SQLite
 * rewrites the rows in place: ids, rowid order, foreign keys and cascades,
 * snapshots, ordering, checkout cents and every other column are untouched.
 * No wipe, no reseed, no row deleted. Requires SQLite ≥ 3.35 (`DROP
 * COLUMN`); expo-sqlite bundles 3.50.
 */
const SCHEMA_V8 = `
ALTER TABLE services ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (price_cents >= 0);
UPDATE services SET price_cents = CAST(ROUND(price * 100) AS INTEGER);
ALTER TABLE services DROP COLUMN price;

ALTER TABLE appointment_items ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (price_cents >= 0);
UPDATE appointment_items SET price_cents = CAST(ROUND(price * 100) AS INTEGER);
ALTER TABLE appointment_items DROP COLUMN price;

ALTER TABLE products ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (price_cents >= 0);
UPDATE products SET price_cents = CAST(ROUND(price * 100) AS INTEGER);
ALTER TABLE products DROP COLUMN price;

ALTER TABLE sale_items ADD COLUMN unit_price_cents INTEGER NOT NULL DEFAULT 0
  CHECK (unit_price_cents >= 0);
UPDATE sale_items SET unit_price_cents = CAST(ROUND(unit_price * 100) AS INTEGER);
ALTER TABLE sale_items DROP COLUMN unit_price;
`;

/**
 * Schema v9 — Client notes. One nullable free-text column: NULL means "no
 * note", which is what every existing Client keeps. Purely additive — no
 * row rewritten, no wipe, no reseed, no id or sync bookkeeping touched (the
 * migration marks nothing in the outbox: nothing changed for the remote).
 */
const SCHEMA_V9 = `
ALTER TABLE clients ADD COLUMN notes TEXT;
`;

/**
 * Schema v10 — Appointment discount. Two nullable integer columns, at most
 * ONE of them set (the second CHECK): a whole percentage (1–50) or a fixed
 * amount in integer cents. Both NULL means "no discount", which is what
 * every existing Appointment keeps. Purely additive — no row rewritten, no
 * wipe, no reseed, no item snapshot price, payment, id or sync bookkeeping
 * touched (the migration marks nothing in the outbox: nothing changed for
 * the remote). No discounted total is stored; it stays derived.
 */
const SCHEMA_V10 = `
ALTER TABLE appointments ADD COLUMN discount_percent INTEGER
  CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 50);
ALTER TABLE appointments ADD COLUMN discount_amount_cents INTEGER
  CHECK (
    discount_amount_cents IS NULL
    OR (discount_amount_cents >= 1 AND discount_percent IS NULL)
  );
`;

/**
 * Schema v11 — Calendar Blocks (personal unavailability).
 *
 * 1. `calendar_blocks` — a NEW table, created empty. A block is a staff
 *    member + an interval + a reason (docs/domain/CALENDAR_BLOCKS.md): no
 *    client, no price, no payment, no status. The two CHECKs mirror the
 *    domain: a meaningful reason, an end strictly after the start (both are
 *    fixed-width ISO-8601 UTC text, so text order IS chronological order). No
 *    sync column: like every aggregate, revisions and deletions live in
 *    `sync_outbox` / `sync_state`, and a local deletion removes the row.
 *
 * 2. The `aggregate_type` vocabulary of `sync_outbox` and `sync_state` gains
 *    `CALENDAR_BLOCK`. SQLite cannot alter a CHECK, so both bookkeeping
 *    tables are rebuilt with the documented copy procedure — new table, every
 *    row copied with its columns unchanged, old table dropped, new one
 *    renamed — inside this migration's transaction. NOTHING is lost: pending
 *    intents keep their `id` (FIFO position), revision and retry state, the
 *    AUTOINCREMENT sequence is carried over so an id is still never reused,
 *    and every acknowledged remote version is preserved. No operational row
 *    is read or written.
 *
 * 3. The pull cursor is cleared. A build that predates Calendar Blocks
 *    ignores the `calendar_blocks` family of a pull and still advances its
 *    cursor, so blocks created on another device meanwhile would sit BEFORE
 *    the cursor forever. Without a cursor the next pull reads the complete
 *    dataset once: known revisions are skipped one comparison each, and the
 *    blocks this device never stored arrive (CLOUD_SYNC.md §20).
 *
 * No existing Client, Service, Appointment, Product or Sale row is touched;
 * no wipe, no reseed; the migration records nothing in the outbox.
 */
const SYNC_AGGREGATE_TYPE_CHECK_V11 =
  "aggregate_type IN ('CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE', 'CALENDAR_BLOCK')";

const SCHEMA_V11 = `
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_start_at ON calendar_blocks(start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_blocks_business_staff_start_at
  ON calendar_blocks(business_id, staff_member_id, start_at);

CREATE TABLE sync_outbox_v11 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (${SYNC_AGGREGATE_TYPE_CHECK_V11}),
  aggregate_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  next_attempt_at TEXT,
  UNIQUE (business_id, aggregate_type, aggregate_id)
);

INSERT INTO sync_outbox_v11
  (id, business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at,
   attempt_count, last_error, next_attempt_at)
SELECT id, business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at,
       attempt_count, last_error, next_attempt_at
FROM sync_outbox
ORDER BY id;

-- Carry the AUTOINCREMENT high-water mark over: it may be above MAX(id) when
-- settled entries were deleted, and an id must never be handed out twice.
DELETE FROM sqlite_sequence WHERE name = 'sync_outbox_v11';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'sync_outbox_v11', seq FROM sqlite_sequence WHERE name = 'sync_outbox';

DROP TABLE sync_outbox;
ALTER TABLE sync_outbox_v11 RENAME TO sync_outbox;

CREATE TABLE sync_state_v11 (
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (${SYNC_AGGREGATE_TYPE_CHECK_V11}),
  aggregate_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL CHECK (remote_version >= 1),
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (business_id, aggregate_type, aggregate_id)
);

INSERT INTO sync_state_v11 (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at)
SELECT business_id, aggregate_type, aggregate_id, remote_version, last_synced_at
FROM sync_state;

DROP TABLE sync_state;
ALTER TABLE sync_state_v11 RENAME TO sync_state;

DELETE FROM souris_metadata WHERE key = 'sync_pull_cursor';
`;

/**
 * Schema v12 — Appointment deposits (« Acomptes »).
 *
 * 1. `appointment_deposits` — a NEW table, created empty. One row per
 *    deposit: money actually received in advance for an Appointment, in exact
 *    integer cents, by ONE method (docs/domain/APPOINTMENTS.md §25d). Never a
 *    column of `appointments`. `appointment_id` is plain reference metadata,
 *    exactly like `sales.appointment_id`: NO foreign key and NO cascade — the
 *    Appointment permanent-deletion guard refuses to delete an Appointment
 *    that holds a deposit, VOIDED ones included. The CHECKs mirror the domain:
 *    a strictly positive amount, the CARD / CASH vocabulary, the ACTIVE /
 *    VOIDED vocabulary, and `voided_at` present exactly when VOIDED.
 *    `recorded_at` is when the deposit was entered (the domain `createdAt`;
 *    remotely `created_at` is server-owned sync metadata, hence the name).
 *    A deposit is never deleted by a user action: a correction is a status
 *    change.
 *
 * 2. The `aggregate_type` vocabulary of `sync_outbox` and `sync_state` gains
 *    `APPOINTMENT_DEPOSIT` (its own aggregate, CLOUD_SYNC.md §21). SQLite
 *    cannot alter a CHECK, so both bookkeeping tables are rebuilt with the
 *    documented copy procedure of schema v11 — every row copied unchanged,
 *    `id` (FIFO position), revision and retry state kept, the AUTOINCREMENT
 *    sequence carried over, every acknowledged remote version preserved.
 *
 * 3. The pull cursor is cleared, for the reason of schema v11: a build that
 *    predates deposits ignores the `appointment_deposits` family of a pull and
 *    still advances its cursor. The next pull reads the complete dataset once
 *    (acknowledged revisions are skipped) and stores the deposits recorded on
 *    another device meanwhile.
 *
 * No existing Client, Service, Appointment, Product, Sale or Calendar Block
 * row is touched; no wipe, no reseed; the migration records nothing in the
 * outbox.
 */
const SYNC_AGGREGATE_TYPE_CHECK_V12 =
  "aggregate_type IN ('CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE', 'CALENDAR_BLOCK', 'APPOINTMENT_DEPOSIT')";

const SCHEMA_V12 = `
CREATE TABLE IF NOT EXISTS appointment_deposits (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 1),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CARD', 'CASH')),
  paid_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'VOIDED')),
  voided_at TEXT,
  recorded_at TEXT NOT NULL,
  CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_appointment_deposits_appointment_id
  ON appointment_deposits(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_deposits_paid_at ON appointment_deposits(paid_at);

CREATE TABLE sync_outbox_v12 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (${SYNC_AGGREGATE_TYPE_CHECK_V12}),
  aggregate_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  next_attempt_at TEXT,
  UNIQUE (business_id, aggregate_type, aggregate_id)
);

INSERT INTO sync_outbox_v12
  (id, business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at,
   attempt_count, last_error, next_attempt_at)
SELECT id, business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at,
       attempt_count, last_error, next_attempt_at
FROM sync_outbox
ORDER BY id;

-- Carry the AUTOINCREMENT high-water mark over (see schema v11).
DELETE FROM sqlite_sequence WHERE name = 'sync_outbox_v12';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'sync_outbox_v12', seq FROM sqlite_sequence WHERE name = 'sync_outbox';

DROP TABLE sync_outbox;
ALTER TABLE sync_outbox_v12 RENAME TO sync_outbox;

CREATE TABLE sync_state_v12 (
  business_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (${SYNC_AGGREGATE_TYPE_CHECK_V12}),
  aggregate_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL CHECK (remote_version >= 1),
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (business_id, aggregate_type, aggregate_id)
);

INSERT INTO sync_state_v12 (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at)
SELECT business_id, aggregate_type, aggregate_id, remote_version, last_synced_at
FROM sync_state;

DROP TABLE sync_state;
ALTER TABLE sync_state_v12 RENAME TO sync_state;

DELETE FROM souris_metadata WHERE key = 'sync_pull_cursor';
`;

export const migrations: readonly Migration[] = [
  { version: 1, up: (db) => db.execSync(SCHEMA_V1) },
  { version: 2, up: (db) => db.execSync(SCHEMA_V2) },
  { version: 3, up: (db) => db.execSync(SCHEMA_V3) },
  { version: 4, up: (db) => db.execSync(SCHEMA_V4) },
  { version: 5, up: (db) => db.execSync(SCHEMA_V5) },
  { version: 6, up: (db) => db.execSync(SCHEMA_V6) },
  { version: 7, up: (db) => db.execSync(SCHEMA_V7) },
  { version: 8, up: (db) => db.execSync(SCHEMA_V8) },
  { version: 9, up: (db) => db.execSync(SCHEMA_V9) },
  { version: 10, up: (db) => db.execSync(SCHEMA_V10) },
  { version: 11, up: (db) => db.execSync(SCHEMA_V11) },
  { version: 12, up: (db) => db.execSync(SCHEMA_V12) },
];

export const CURRENT_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0;

/**
 * Every canonical OPERATIONAL table, in a deletion order that respects
 * foreign keys. `business_profile` is deliberately absent: the account
 * binding survives a development data reset.
 */
export const SOURIS_TABLES = [
  'appointment_deposits',
  'calendar_blocks',
  'sale_items',
  'sales',
  'appointment_phases',
  'appointment_items',
  'appointments',
  'service_phases',
  'services',
  'products',
  'clients',
] as const;

/** The tables whose rows carry a `business_id`; the ONLY columns account binding rewrites. */
export const BUSINESS_SCOPED_TABLES = [
  'services',
  'appointments',
  'products',
  'sales',
  'calendar_blocks',
  'appointment_deposits',
] as const;

/**
 * Local sync bookkeeping (schema v7). Not operational data: never part of
 * the hydrated snapshot, never uploaded. Cleared with the operational tables
 * by the development reset, because pending intents and acknowledged remote
 * revisions describe rows that the reset removes.
 */
export const SYNC_TABLES = ['sync_outbox', 'sync_state'] as const;
