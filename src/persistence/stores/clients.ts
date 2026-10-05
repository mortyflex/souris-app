// Souris — Client store
//
// birthday (schema v4) is the civil `MM-DD` key of the Client birthday and
// stays a string end to end: it is parsed into the day + month domain value
// on load and never turned into a Date, a timestamp or a year
// (docs/domain/CLIENTS.md). The legacy `birth_date` column (schema ≤ v3) is
// retained but no longer read or written.
//
// notes (schema v9) is the free-text Client note, stored exactly as the
// normalized domain text (line breaks included) or NULL when absent.
//
// photo_path (schema v13) is the stable object path of the Client photo in
// the Business media storage, or NULL. It is written ONLY by
// `setClientPhotoPath` (and by insertion): identity edits never touch it, so
// a form that knows nothing about photos can never erase one.
//
// sms_marketing_consent + _updated_at + _source (schema v16) travel
// together: the explicit promotional SMS consent (OPTED_IN / OPTED_OUT) with
// its audit pair, or three NULLs for UNKNOWN. The domain value is one
// optional record (ClientSmsMarketingConsent); a row whose triple is
// incomplete or out of vocabulary reads as UNKNOWN rather than crashing.
//
// archived_at (schema v2) is an ISO instant or NULL. NULL is the active
// state; the domain value is a Date, restored exactly. Permanent deletion
// verifies Appointment and Sale references INSIDE its transaction, so the
// stored rows — never in-memory arrays — decide whether it is allowed.
//
// Every mutation marks the CLIENT aggregate in the sync outbox within its own
// transaction (Cloud Sync V1B): identity edits, archive and restore are
// UPSERTs; permanent deletion is a DELETE that outlives the row. The bulk
// insertion of the client import (`insertClients`) is the same row insert +
// the same UPSERT mark, repeated inside ONE transaction per batch.

import {
  canDeleteClientPermanently,
  formatBirthdayKey,
  isClientSmsMarketingConsentSource,
  isClientSmsMarketingConsentStatus,
  normalizeClientNotes,
  parseBirthdayKey,
  type Client,
  type ClientReferences,
  type ClientSmsMarketingConsent,
} from '@/domain/clients';

import { runInTransaction, type SourisDatabase } from '../database';
import { readBoundBusinessId } from '../sync/aggregate';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import { fromSqlInstant, fromSqlOptional, toSqlInstant, toSqlOptional } from '../values';

interface ClientRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly photo_path: string | null;
  readonly sms_marketing_consent: string | null;
  readonly sms_marketing_consent_updated_at: string | null;
  readonly sms_marketing_consent_source: string | null;
  readonly archived_at: string | null;
}

interface CountRow {
  readonly count: number;
}

/** Raised when a permanent deletion is refused because history references the Client. */
export class ClientDeleteConflictError extends Error {
  constructor(
    readonly clientId: string,
    readonly references: ClientReferences,
  ) {
    super(`Client "${clientId}" is referenced by Appointments or Sales and cannot be deleted`);
    this.name = 'ClientDeleteConflictError';
  }
}

/** The complete stored triple, or undefined (UNKNOWN) for anything less. */
function toSmsMarketingConsent(row: ClientRow): ClientSmsMarketingConsent | undefined {
  if (
    row.sms_marketing_consent === null ||
    row.sms_marketing_consent_updated_at === null ||
    row.sms_marketing_consent_source === null ||
    !isClientSmsMarketingConsentStatus(row.sms_marketing_consent) ||
    !isClientSmsMarketingConsentSource(row.sms_marketing_consent_source)
  ) {
    return undefined;
  }
  return {
    status: row.sms_marketing_consent,
    updatedAt: fromSqlInstant(row.sms_marketing_consent_updated_at),
    source: row.sms_marketing_consent_source,
  };
}

function toClient(row: ClientRow): Client {
  const lastName = fromSqlOptional(row.last_name);
  const phone = fromSqlOptional(row.phone);
  const email = fromSqlOptional(row.email);
  const birthday = row.birthday === null ? undefined : parseBirthdayKey(row.birthday);
  const notes = normalizeClientNotes(row.notes);
  const photoPath = fromSqlOptional(row.photo_path);
  const smsMarketingConsent = toSmsMarketingConsent(row);
  const archivedAt = row.archived_at === null ? undefined : fromSqlInstant(row.archived_at);
  return {
    id: row.id,
    firstName: row.first_name,
    ...(lastName !== undefined ? { lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(birthday !== undefined ? { birthday } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(photoPath !== undefined ? { photoPath } : {}),
    ...(smsMarketingConsent !== undefined ? { smsMarketingConsent } : {}),
    ...(archivedAt !== undefined ? { archivedAt } : {}),
  };
}

function toBirthdayColumn(client: Client) {
  return toSqlOptional(client.birthday === undefined ? undefined : formatBirthdayKey(client.birthday));
}

function toNotesColumn(client: Client) {
  return toSqlOptional(normalizeClientNotes(client.notes));
}

/** The three consent columns, always written together (or three NULLs). */
function toConsentColumns(client: Client): [string | null, string | null, string | null] {
  const consent = client.smsMarketingConsent;
  if (consent === undefined) return [null, null, null];
  return [consent.status, toSqlInstant(consent.updatedAt), consent.source];
}

export function loadClients(db: SourisDatabase): readonly Client[] {
  return db
    .getAllSync<ClientRow>(
      'SELECT id, first_name, last_name, phone, email, birthday, notes, photo_path, sms_marketing_consent, sms_marketing_consent_updated_at, sms_marketing_consent_source, archived_at FROM clients ORDER BY rowid',
    )
    .map(toClient);
}

/** The row + its CLIENT outbox mark; the caller owns the transaction. */
function insertClientRow(db: SourisDatabase, client: Client): void {
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birthday, notes, photo_path, sms_marketing_consent, sms_marketing_consent_updated_at, sms_marketing_consent_source, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      client.id,
      client.firstName,
      toSqlOptional(client.lastName),
      toSqlOptional(client.phone),
      toSqlOptional(client.email),
      toBirthdayColumn(client),
      toNotesColumn(client),
      toSqlOptional(client.photoPath),
      ...toConsentColumns(client),
      client.archivedAt === undefined ? null : toSqlInstant(client.archivedAt),
    ],
  );
  markAggregateUpserted(db, 'CLIENT', client.id);
}

export function insertClient(db: SourisDatabase, client: Client): void {
  runInTransaction(db, () => insertClientRow(db, client));
}

/** Raised when a bulk insertion is attempted on a database not bound to a Business. */
export class ClientBulkInsertUnboundError extends Error {
  constructor() {
    super('Bulk Client insertion requires a database bound to a Business');
    this.name = 'ClientBulkInsertUnboundError';
  }
}

/**
 * Inserts a batch of NEW Clients (the client import) in ONE transaction:
 * every row with its CLIENT UPSERT outbox entry, or nothing at all.
 *
 * - The database must be bound to a Business: an unbound device records no
 *   sync intent, so a batch written there could never reach the normal sync
 *   path. Refused with ClientBulkInsertUnboundError before any write.
 * - Retry-safe: a Client whose id is already stored (a chunk that committed
 *   before a later one failed) is skipped, never duplicated nor overwritten.
 *
 * Returns the Clients actually inserted, in order.
 */
export function insertClients(db: SourisDatabase, clients: readonly Client[]): readonly Client[] {
  const inserted: Client[] = [];
  runInTransaction(db, () => {
    if (readBoundBusinessId(db) === undefined) throw new ClientBulkInsertUnboundError();
    for (const client of clients) {
      const stored = db.getFirstSync<{ readonly id: string }>('SELECT id FROM clients WHERE id = ?', [
        client.id,
      ]);
      if (stored !== null) continue;
      insertClientRow(db, client);
      inserted.push(client);
    }
  });
  return inserted;
}

/**
 * Replaces every identity field of the Client with the same id — the
 * promotional SMS consent included (the form carries it). The lifecycle and
 * photo columns are untouched: identity edits never archive, restore, or
 * change the photo.
 */
export function updateClient(db: SourisDatabase, client: Client): void {
  runInTransaction(db, () => {
    const result = db.runSync(
      'UPDATE clients SET first_name = ?, last_name = ?, phone = ?, email = ?, birthday = ?, notes = ?, sms_marketing_consent = ?, sms_marketing_consent_updated_at = ?, sms_marketing_consent_source = ? WHERE id = ?',
      [
        client.firstName,
        toSqlOptional(client.lastName),
        toSqlOptional(client.phone),
        toSqlOptional(client.email),
        toBirthdayColumn(client),
        toNotesColumn(client),
        ...toConsentColumns(client),
        client.id,
      ],
    );
    if (result.changes !== 1) {
      throw new Error(`updateClient: Client "${client.id}" not found`);
    }
    markAggregateUpserted(db, 'CLIENT', client.id);
  });
}

/**
 * Sets (a stable storage object path) or clears (undefined) the Client
 * photo reference. Nothing else of the Client changes.
 */
export function setClientPhotoPath(
  db: SourisDatabase,
  clientId: string,
  photoPath: string | undefined,
): void {
  runInTransaction(db, () => {
    const result = db.runSync('UPDATE clients SET photo_path = ? WHERE id = ?', [
      toSqlOptional(photoPath),
      clientId,
    ]);
    if (result.changes !== 1) {
      throw new Error(`setClientPhotoPath: Client "${clientId}" not found`);
    }
    markAggregateUpserted(db, 'CLIENT', clientId);
  });
}

export function archiveClient(db: SourisDatabase, clientId: string, archivedAt: Date): void {
  runInTransaction(db, () => {
    const result = db.runSync('UPDATE clients SET archived_at = ? WHERE id = ?', [
      toSqlInstant(archivedAt),
      clientId,
    ]);
    if (result.changes !== 1) {
      throw new Error(`archiveClient: Client "${clientId}" not found`);
    }
    markAggregateUpserted(db, 'CLIENT', clientId);
  });
}

export function restoreClient(db: SourisDatabase, clientId: string): void {
  runInTransaction(db, () => {
    const result = db.runSync('UPDATE clients SET archived_at = NULL WHERE id = ?', [clientId]);
    if (result.changes !== 1) {
      throw new Error(`restoreClient: Client "${clientId}" not found`);
    }
    markAggregateUpserted(db, 'CLIENT', clientId);
  });
}

/** Counts the stored Appointments and Sales referencing the Client, whatever their status. */
export function countClientReferences(db: SourisDatabase, clientId: string): ClientReferences {
  const appointmentCount =
    db.getFirstSync<CountRow>('SELECT COUNT(*) AS count FROM appointments WHERE client_id = ?', [
      clientId,
    ])?.count ?? 0;
  const saleCount =
    db.getFirstSync<CountRow>('SELECT COUNT(*) AS count FROM sales WHERE client_id = ?', [
      clientId,
    ])?.count ?? 0;
  return { appointmentCount, saleCount };
}

/**
 * Permanently deletes a Client in ONE transaction:
 *
 *   count Appointment refs → count Sale refs
 *   → any reference: ClientDeleteConflictError, nothing written
 *   → otherwise DELETE the Client row + CLIENT DELETE outbox entry
 *
 * Never cascades, never nulls `client_id`, never anonymizes.
 */
export function deleteClientPermanently(db: SourisDatabase, clientId: string): void {
  runInTransaction(db, () => {
    const references = countClientReferences(db, clientId);
    if (!canDeleteClientPermanently(references)) {
      throw new ClientDeleteConflictError(clientId, references);
    }
    const result = db.runSync('DELETE FROM clients WHERE id = ?', [clientId]);
    if (result.changes !== 1) {
      throw new Error(`deleteClientPermanently: Client "${clientId}" not found`);
    }
    markAggregateDeleted(db, 'CLIENT', clientId);
  });
}
