// BeautIzzy — client import candidate edits and confirmation
//
// A review edit replaces the candidate's field values and marks it REVIEWED:
// the extraction issues (name split, ignored text, extra numbers…) described
// the source text the professional has now checked, so they are dropped. The
// validation issues and the duplicate classification are recomputed from the
// new values (classification.ts) — nothing is stored.
//
// Confirmation turns a valid candidate into a Client with the identity /
// contact fields only: no notes, no photo, no lifecycle state, no SMS
// consent (UNKNOWN). The phone and email stay exactly what was typed or
// pasted (trimmed); the id comes from the application boundary.

import type { ClientBirthday } from '../birthday';
import type { Client } from '../types';

import { validateClientImportCandidate } from './classification';
import { isBlockingClientImportIssue, type ClientImportCandidate } from './types';

export interface ClientImportCandidateValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  readonly birthday: ClientBirthday | undefined;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** The editable values of a candidate (blank strings for absent fields). */
export function toClientImportCandidateValues(
  candidate: ClientImportCandidate,
): ClientImportCandidateValues {
  return {
    firstName: candidate.firstName ?? '',
    lastName: candidate.lastName ?? '',
    phone: candidate.phone ?? '',
    email: candidate.email ?? '',
    birthday: candidate.birthday,
  };
}

/** The reviewed candidate: new values, same key / source / raw text, extraction issues cleared. */
export function editClientImportCandidate(
  candidate: ClientImportCandidate,
  values: ClientImportCandidateValues,
): ClientImportCandidate {
  const firstName = optional(values.firstName);
  const lastName = optional(values.lastName);
  const phone = optional(values.phone);
  const email = optional(values.email);
  return {
    key: candidate.key,
    source: candidate.source,
    ...(candidate.sourceRef !== undefined ? { sourceRef: candidate.sourceRef } : {}),
    ...(firstName !== undefined ? { firstName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(values.birthday !== undefined ? { birthday: values.birthday } : {}),
    ...(candidate.raw !== undefined ? { raw: candidate.raw } : {}),
    issues: [],
  };
}

/** The Client a confirmed candidate becomes. Throws on a blocking issue. */
export function toImportedClient(candidate: ClientImportCandidate, id: string): Client {
  if (validateClientImportCandidate(candidate).some(isBlockingClientImportIssue)) {
    throw new RangeError(`Client import candidate "${candidate.key}" is not importable`);
  }
  const lastName = optional(candidate.lastName ?? '');
  const phone = optional(candidate.phone ?? '');
  const email = optional(candidate.email ?? '');
  return {
    id,
    firstName: (candidate.firstName ?? '').trim(),
    ...(lastName !== undefined ? { lastName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(candidate.birthday !== undefined ? { birthday: candidate.birthday } : {}),
  };
}
