// Souris — Legacy clients import boundary
//
// Source: src/features/clients/data/legacy-clients.ts
// Target: canonical Souris Client (src/domain/clients)
//
// The STRICT import rule (docs/domain/CLIENTS.md §Legacy import contract):
//
//   _id       → id
//   firstName → firstName
//   lastName  → lastName
//   telephone → phone
//   email     → email
//   birthdate → birthday  (day + month of a well-formed YYYY-MM-DD value only;
//                         the year is discarded; null, missing, and
//                         non-conforming values are dropped — never
//                         converted or invented)
//
// EVERYTHING ELSE is discarded. Legacy commercial history (visits, spend,
// average basket, last visit, no-show history), notes, imported visit notes,
// age, address and other bookkeeping fields never cross this boundary.
// Souris commercial and appointment history starts from zero.

import { birthdayFromCivilDate, type Client, type ClientBirthday } from '@/domain/clients';

/** Minimal shape of a legacy record; extra fields are simply ignored. */
export interface LegacyClientRecord {
  readonly _id: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly telephone?: string;
  readonly email?: string;
  readonly birthdate?: string | null;
}

function mapBirthday(value: string | null | undefined): ClientBirthday | undefined {
  if (typeof value !== 'string') return undefined;
  return birthdayFromCivilDate(value);
}

/** Maps one legacy record to canonical identity/contact only. */
export function mapLegacyClient(record: LegacyClientRecord): Client {
  const birthday = mapBirthday(record.birthdate);

  return {
    id: record._id,
    firstName: record.firstName,
    lastName: record.lastName?.trim() || undefined,
    phone: record.telephone?.trim() || undefined,
    email: record.email?.trim() || undefined,
    ...(birthday !== undefined ? { birthday } : {}),
  };
}

/** Maps a batch of legacy records without inventing or merging anything. */
export function mapLegacyClients(
  records: readonly LegacyClientRecord[],
): readonly Client[] {
  return records.map(mapLegacyClient);
}
