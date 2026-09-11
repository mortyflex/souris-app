// Souris — Client store
//
// birth_date is a civil YYYY-MM-DD string and stays a string end to end:
// it is never turned into a Date or a timestamp (docs/domain/CLIENTS.md).

import type { Client } from '@/domain/clients';

import type { SourisDatabase } from '../database';
import { fromSqlOptional, toSqlOptional } from '../values';

interface ClientRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birth_date: string | null;
}

function toClient(row: ClientRow): Client {
  const lastName = fromSqlOptional(row.last_name);
  const phone = fromSqlOptional(row.phone);
  const email = fromSqlOptional(row.email);
  const birthDate = fromSqlOptional(row.birth_date);
  return {
    id: row.id,
    firstName: row.first_name,
    ...(lastName !== undefined ? { lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(birthDate !== undefined ? { birthDate } : {}),
  };
}

export function loadClients(db: SourisDatabase): readonly Client[] {
  return db
    .getAllSync<ClientRow>(
      'SELECT id, first_name, last_name, phone, email, birth_date FROM clients ORDER BY rowid',
    )
    .map(toClient);
}

export function insertClient(db: SourisDatabase, client: Client): void {
  db.runSync(
    'INSERT INTO clients (id, first_name, last_name, phone, email, birth_date) VALUES (?, ?, ?, ?, ?, ?)',
    [
      client.id,
      client.firstName,
      toSqlOptional(client.lastName),
      toSqlOptional(client.phone),
      toSqlOptional(client.email),
      toSqlOptional(client.birthDate),
    ],
  );
}

/** Replaces every identity field of the Client with the same id. */
export function updateClient(db: SourisDatabase, client: Client): void {
  const result = db.runSync(
    'UPDATE clients SET first_name = ?, last_name = ?, phone = ?, email = ?, birth_date = ? WHERE id = ?',
    [
      client.firstName,
      toSqlOptional(client.lastName),
      toSqlOptional(client.phone),
      toSqlOptional(client.email),
      toSqlOptional(client.birthDate),
      client.id,
    ],
  );
  if (result.changes !== 1) {
    throw new Error(`updateClient: Client "${client.id}" not found`);
  }
}
