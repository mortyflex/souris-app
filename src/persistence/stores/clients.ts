// Souris — Client store
//
// birthday (schema v4) is the civil `MM-DD` key of the Client birthday and
// stays a string end to end: it is parsed into the day + month domain value
// on load and never turned into a Date, a timestamp or a year
// (docs/domain/CLIENTS.md). The legacy `birth_date` column (schema ≤ v3) is
// retained but no longer read or written.
//
// archived_at (schema v2) is an ISO instant or NULL. NULL is the active
// state; the domain value is a Date, restored exactly. Permanent deletion
// verifies Appointment and Sale references INSIDE its transaction, so the
// stored rows — never in-memory arrays — decide whether it is allowed.
//
// Every mutation marks the CLIENT aggregate in the sync outbox within its own
// transaction (Cloud Sync V1B): identity edits, archive and restore are
// UPSERTs; permanent deletion is a DELETE that outlives the row.

import {
  canDeleteClientPermanently,
  formatBirthdayKey,
  parseBirthdayKey,
  type Client,
  type ClientReferences,
} from '@/domain/clients';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import { fromSqlInstant, fromSqlOptional, toSqlInstant, toSqlOptional } from '../values';

interface ClientRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birthday: string | null;
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

function toClient(row: ClientRow): Client {
  const lastName = fromSqlOptional(row.last_name);
  const phone = fromSqlOptional(row.phone);
  const email = fromSqlOptional(row.email);
  const birthday = row.birthday === null ? undefined : parseBirthdayKey(row.birthday);
  const archivedAt = row.archived_at === null ? undefined : fromSqlInstant(row.archived_at);
  return {
    id: row.id,
    firstName: row.first_name,
    ...(lastName !== undefined ? { lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(birthday !== undefined ? { birthday } : {}),
    ...(archivedAt !== undefined ? { archivedAt } : {}),
  };
}

function toBirthdayColumn(client: Client) {
  return toSqlOptional(client.birthday === undefined ? undefined : formatBirthdayKey(client.birthday));
}

export function loadClients(db: SourisDatabase): readonly Client[] {
  return db
    .getAllSync<ClientRow>(
      'SELECT id, first_name, last_name, phone, email, birthday, archived_at FROM clients ORDER BY rowid',
    )
    .map(toClient);
}

export function insertClient(db: SourisDatabase, client: Client): void {
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO clients (id, first_name, last_name, phone, email, birthday, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        client.id,
        client.firstName,
        toSqlOptional(client.lastName),
        toSqlOptional(client.phone),
        toSqlOptional(client.email),
        toBirthdayColumn(client),
        client.archivedAt === undefined ? null : toSqlInstant(client.archivedAt),
      ],
    );
    markAggregateUpserted(db, 'CLIENT', client.id);
  });
}

/**
 * Replaces every identity field of the Client with the same id. The
 * lifecycle column is untouched: identity edits never archive or restore.
 */
export function updateClient(db: SourisDatabase, client: Client): void {
  runInTransaction(db, () => {
    const result = db.runSync(
      'UPDATE clients SET first_name = ?, last_name = ?, phone = ?, email = ?, birthday = ? WHERE id = ?',
      [
        client.firstName,
        toSqlOptional(client.lastName),
        toSqlOptional(client.phone),
        toSqlOptional(client.email),
        toBirthdayColumn(client),
        client.id,
      ],
    );
    if (result.changes !== 1) {
      throw new Error(`updateClient: Client "${client.id}" not found`);
    }
    markAggregateUpserted(db, 'CLIENT', client.id);
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
