// BeautIzzy — client import staging model
//
// ONE import pipeline, whatever the source:
//
//   source → extraction → parsing → normalization → validation
//          → duplicate detection → review → confirmed import
//
// A ClientImportCandidate is REVIEW STATE ONLY: it lives in memory while the
// professional reviews a batch and is never persisted. It is not a Client —
// it may lack a first name, carry an invalid email or hold parsing warnings.
// Only a confirmed, valid candidate becomes a Client (`toImportedClient`).
//
// Allowed fields are the identity / contact ones of the import contract
// (docs/domain/CLIENTS.md §3): first name, last name, phone, email, birthday.
// Never notes, a photo, a lifecycle state, an external id or SMS consent: an
// imported Client's promotional SMS consent is UNKNOWN.

import type { ClientBirthday } from '../birthday';

/** Where a batch comes from. PASTE and CSV have an adapter; the others are future adapters. */
export type ClientImportSource = 'PASTE' | 'CSV' | 'CONTACTS' | 'OCR';

export type ClientImportIssueCode =
  // Blocking — the candidate cannot be imported until corrected.
  | 'MISSING_FIRST_NAME'
  | 'INVALID_EMAIL'
  // Warnings — the candidate stays importable.
  | 'UNRECOGNIZED_PHONE'
  | 'AMBIGUOUS_NAME_SPLIT'
  | 'AMBIGUOUS_BIRTHDAY'
  | 'BIRTHDAY_DROPPED'
  | 'EXTRA_PHONES'
  | 'EXTRA_EMAILS'
  | 'IGNORED_TEXT';

export interface ClientImportIssue {
  readonly code: ClientImportIssueCode;
  /** The source text concerned (ignored words, extra numbers…) — in memory only. */
  readonly detail?: string;
}

export interface ClientImportCandidate {
  /** Stable within the batch; survives edits. */
  readonly key: string;
  readonly source: ClientImportSource;
  /** Human reference in the source (« 3 », « 3-4 » for lines / rows). */
  readonly sourceRef?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  /** Raw trimmed value, exactly as found — never a canonical form. */
  readonly phone?: string;
  /** Raw trimmed value, kept even when invalid so it is corrected, never dropped. */
  readonly email?: string;
  readonly birthday?: ClientBirthday;
  /** The source text of the candidate — in memory only, shown for correction. */
  readonly raw?: string;
  /** Extraction issues found by the source adapter (validation issues are computed). */
  readonly issues: readonly ClientImportIssue[];
}

export const BLOCKING_CLIENT_IMPORT_ISSUES: readonly ClientImportIssueCode[] = [
  'MISSING_FIRST_NAME',
  'INVALID_EMAIL',
];

export function isBlockingClientImportIssue(issue: ClientImportIssue): boolean {
  return BLOCKING_CLIENT_IMPORT_ISSUES.includes(issue.code);
}
