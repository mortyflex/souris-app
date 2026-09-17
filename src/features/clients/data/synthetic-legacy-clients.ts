// Souris — Synthetic legacy address book (development and tests only)
//
// 100 % FICTIONAL. No record describes a real person: names are combined
// mechanically from two fixed lists, phone numbers come from the ranges
// reserved for fiction (ARCEP 06 39 98 xx xx; Ofcom +44 7700 900xxx), and
// every email uses the reserved example.com domain (RFC 2606).
//
// A real client address book must NEVER be tracked in this repository. A
// real import belongs outside the source tree and goes through the import
// boundary (../adapters/legacy-clients-adapter.ts) at runtime.
//
// The records deliberately keep the SHAPE of a legacy export — including the
// commercial-history and bookkeeping fields the adapter must discard and the
// edge cases observed in such exports (empty last name, missing / empty
// phone and email, padded values, null birthdate, inconsistent casing) — so
// the import boundary, search, sorting, and a directory of realistic size
// stay exercised. Generation is index-based and deterministic.

import type { LegacyClientRecord } from '../adapters/legacy-clients-adapter';

/** A legacy-shaped record: identity/contact plus fields the import must ignore. */
export type SyntheticLegacyClientRecord = LegacyClientRecord & {
  readonly [discardedLegacyField: string]: unknown;
};

const SYNTHETIC_CLIENT_COUNT = 640;

// 32 × 21 (coprime) → every first/last name pair is unique across 640 records.
// Neither list reuses a name of the Agenda development clients.
const FIRST_NAMES = [
  'Adèle', 'Agathe', 'Albane', 'Amandine', 'Anne-Sophie', 'Apolline', 'Aurélie', 'Bérénice',
  'Capucine', 'Céleste', 'Clémence', 'Constance', 'Domitille', 'Éloïse', 'Faustine', 'Gabrielle',
  'Héloïse', 'Jean-Baptiste', 'Joséphine', 'Lou', 'Maëlle', 'Marie-Claire', 'Mathilde', 'Noémie',
  'Océane', 'Pauline', 'Romane', 'Solène', 'Théo', 'Valentine', 'Victoire', 'Zoé',
] as const;

const LAST_NAMES = [
  'Le Gall', "D'Angelo", "N'Diaye", 'Benali', 'Nguyen', 'Da Silva', 'Haddad',
  'Rousseau', 'Fontaine', 'Marchand', 'Lemoine', 'Perrin', 'Chevalier', 'Bonnet',
  'Gauthier', 'Lambert', 'Renard', 'Mercier', 'Blanchard', 'Masson', 'Vidal',
] as const;

const EMPTY_LAST_NAME_INDEXES: ReadonlySet<number> = new Set([7, 203, 377, 512]);
const LOWERCASE_LAST_NAME_INDEX = 19;
const UPPERCASE_LAST_NAME_INDEX = 42;
const PADDED_VALUES_INDEX = 64;
const NULL_BIRTHDATE_INDEX = 88;
const FOREIGN_PHONE_INDEX = 130;
// A few names containing "martin", so searching a development client's
// surname (Léa Martin) also returns a handful of other active clients.
const MARTINE_INDEXES: ReadonlySet<number> = new Set([23, 310]);

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function lastNameAt(index: number): string {
  if (EMPTY_LAST_NAME_INDEXES.has(index)) return '';
  const lastName = LAST_NAMES[index % LAST_NAMES.length];
  if (index === LOWERCASE_LAST_NAME_INDEX) return lastName.toLowerCase();
  if (index === UPPERCASE_LAST_NAME_INDEX) return lastName.toUpperCase();
  return lastName;
}

/** Present on every second record, empty on some, absent otherwise. */
function telephoneAt(index: number): string | undefined {
  if (index === FOREIGN_PHONE_INDEX) return `+447700900${pad(index, 3)}`;
  if (index % 2 === 0) return `+3363998${pad(index, 4)}`;
  if (index % 5 === 1) return '';
  return undefined;
}

/** Present on every third record, empty on some, absent otherwise. */
function emailAt(index: number, firstName: string): string | undefined {
  if (index % 3 === 1) {
    const lastName = LAST_NAMES[index % LAST_NAMES.length];
    return `${slug(firstName)}.${slug(lastName)}@example.com`;
  }
  if (index % 7 === 0) return '';
  return undefined;
}

/** Fields a legacy export carries and the import boundary must discard. */
function discardedLegacyFields(index: number): Record<string, unknown> {
  const month = pad((index % 12) + 1, 2);
  const bookkeeping = {
    shopID: 'synthetic-shop',
    createdAt: `2020-${month}-15T09:00:00.000Z`,
    updatedAt: `2023-${month}-15T09:00:00.000Z`,
    __v: 0,
  };
  if (index % 3 !== 0) return bookkeeping;

  return {
    ...bookkeeping,
    gender: 'unknown',
    onlineBooking: index % 2 === 0,
    pictures: [],
    tmp: false,
    stats: {
      totalSpent: (index % 9) * 45,
      ticketAverage: 45,
      visitNb: index % 9,
      lastVisitDate: `2023-${month}-10T10:00:00.000Z`,
      lastVisitIsNoShow: false,
    },
    ...(index % 50 === 0
      ? { notes: 'note fictive', importedVisitNotes: [{ text: 'note de visite fictive' }] }
      : {}),
  };
}

function createSyntheticLegacyClient(index: number): SyntheticLegacyClientRecord {
  const firstName = MARTINE_INDEXES.has(index) ? 'Martine' : FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = lastNameAt(index);
  const telephone = telephoneAt(index);
  const email = emailAt(index, firstName);
  const padded = index === PADDED_VALUES_INDEX;

  return {
    _id: `synthetic-client-${pad(index + 1, 4)}`,
    firstName,
    lastName: padded ? `  ${lastName} ` : lastName,
    ...(telephone !== undefined ? { telephone: padded ? ` ${telephone}  ` : telephone } : {}),
    ...(email !== undefined ? { email: padded ? ` ${email} ` : email } : {}),
    ...(index === NULL_BIRTHDATE_INDEX ? { birthdate: null } : {}),
    ...discardedLegacyFields(index),
  };
}

export const syntheticLegacyClients: readonly SyntheticLegacyClientRecord[] = Array.from(
  { length: SYNTHETIC_CLIENT_COUNT },
  (_, index) => createSyntheticLegacyClient(index),
);
