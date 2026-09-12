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

export const migrations: readonly Migration[] = [
  { version: 1, up: (db) => db.execSync(SCHEMA_V1) },
  { version: 2, up: (db) => db.execSync(SCHEMA_V2) },
];

export const CURRENT_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0;

/** Every canonical table, in a deletion order that respects foreign keys. */
export const SOURIS_TABLES = [
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
