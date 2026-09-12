// Souris — local Business profile and account binding
//
// The single `business_profile` row is the device's account binding: it
// records which Business (and which owning Auth user) the local database
// belongs to. Binding happens once, when the owner completes Business setup
// for the first time on this device (or reconnects to an existing remote
// Business on a device that has no binding yet).
//
// Binding is ONE transaction:
//
//   verify the database is not bound to another account
//   verify operational rows belong to at most ONE current business id
//   rewrite that single local business id → the remote Business id
//   upsert the profile row
//
// Record identities, snapshots, and relationships never change — only the
// business ownership column. Any check failure rolls everything back and
// leaves the database exactly as it was.

import type { BusinessProfile } from '@/domain/business';
import { isBusinessActivityType } from '@/domain/business';

import { runInTransaction, type SourisDatabase } from '../database';
import { BUSINESS_SCOPED_TABLES } from '../schema';
import { fromSqlInstant, fromSqlOptional, toSqlInstant, toSqlOptional } from '../values';

interface BusinessProfileRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly owner_first_name: string;
  readonly owner_last_name: string | null;
  readonly name: string;
  readonly activity_type: string;
  readonly phone: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type LocalAccountBindingErrorCode =
  /** The database already belongs to a different owner or Business. */
  | 'ALREADY_BOUND_TO_OTHER_ACCOUNT'
  /** Operational rows reference several business ids; nothing is merged silently. */
  | 'MULTIPLE_LOCAL_BUSINESS_IDS';

export class LocalAccountBindingError extends Error {
  readonly code: LocalAccountBindingErrorCode;

  constructor(code: LocalAccountBindingErrorCode, message: string) {
    super(message);
    this.name = 'LocalAccountBindingError';
    this.code = code;
  }
}

function toBusinessProfile(row: BusinessProfileRow): BusinessProfile {
  if (!isBusinessActivityType(row.activity_type)) {
    throw new RangeError(`business_profile: unknown activity_type "${row.activity_type}"`);
  }
  const ownerLastName = fromSqlOptional(row.owner_last_name);
  const phone = fromSqlOptional(row.phone);
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerFirstName: row.owner_first_name,
    ...(ownerLastName !== undefined && { ownerLastName }),
    name: row.name,
    activityType: row.activity_type,
    ...(phone !== undefined && { phone }),
    createdAt: fromSqlInstant(row.created_at),
    updatedAt: fromSqlInstant(row.updated_at),
  };
}

/** The device's account binding, or undefined while the database is unbound. */
export function readBusinessProfile(db: SourisDatabase): BusinessProfile | undefined {
  const row = db.getFirstSync<BusinessProfileRow>(
    'SELECT id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at FROM business_profile WHERE singleton = 1',
  );
  return row ? toBusinessProfile(row) : undefined;
}

/** Every distinct `business_id` currently referenced by operational rows. */
export function listLocalBusinessIds(db: SourisDatabase): readonly string[] {
  const union = BUSINESS_SCOPED_TABLES.map(
    (table) => `SELECT DISTINCT business_id AS id FROM ${table}`,
  ).join(' UNION ');
  return db
    .getAllSync<{ readonly id: string }>(`SELECT DISTINCT id FROM (${union}) ORDER BY id`)
    .map((row) => row.id);
}

function writeBusinessProfile(db: SourisDatabase, profile: BusinessProfile): void {
  db.runSync(
    `INSERT INTO business_profile (singleton, id, owner_user_id, owner_first_name, owner_last_name, name, activity_type, phone, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(singleton) DO UPDATE SET
       id = excluded.id,
       owner_user_id = excluded.owner_user_id,
       owner_first_name = excluded.owner_first_name,
       owner_last_name = excluded.owner_last_name,
       name = excluded.name,
       activity_type = excluded.activity_type,
       phone = excluded.phone,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [
      profile.id,
      profile.ownerUserId,
      profile.ownerFirstName,
      toSqlOptional(profile.ownerLastName),
      profile.name,
      profile.activityType,
      toSqlOptional(profile.phone),
      toSqlInstant(profile.createdAt),
      toSqlInstant(profile.updatedAt),
    ],
  );
}

/**
 * Binds the local database to `profile` atomically (see the module header).
 * Re-binding to the SAME owner and Business simply refreshes the cached
 * profile. Throws `LocalAccountBindingError` — with the database unchanged —
 * when the device belongs to another account or when operational rows do
 * not share one single current business id.
 */
export function bindLocalDatabaseToBusiness(db: SourisDatabase, profile: BusinessProfile): void {
  runInTransaction(db, () => {
    const existing = readBusinessProfile(db);
    if (
      existing &&
      (existing.ownerUserId !== profile.ownerUserId || existing.id !== profile.id)
    ) {
      throw new LocalAccountBindingError(
        'ALREADY_BOUND_TO_OTHER_ACCOUNT',
        'This device is already bound to another Souris account',
      );
    }

    const foreignIds = listLocalBusinessIds(db).filter((id) => id !== profile.id);
    if (foreignIds.length > 1) {
      throw new LocalAccountBindingError(
        'MULTIPLE_LOCAL_BUSINESS_IDS',
        `Local data references ${foreignIds.length} different business ids; refusing to merge`,
      );
    }

    const [previousId] = foreignIds;
    if (previousId !== undefined) {
      for (const table of BUSINESS_SCOPED_TABLES) {
        db.runSync(`UPDATE ${table} SET business_id = ? WHERE business_id = ?`, [
          profile.id,
          previousId,
        ]);
      }
    }

    writeBusinessProfile(db, profile);
  });
}
