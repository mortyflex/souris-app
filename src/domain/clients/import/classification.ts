// BeautIzzy — client import validation and duplicate classification
//
// Every candidate of a batch is classified from THREE inputs only — itself,
// the existing Clients (active AND archived) and the candidates before it in
// the batch — and the result is never stored: an edit simply re-runs it.
//
//   INVALID             a blocking issue: no first name, an invalid email
//   EXACT_DUPLICATE     a strong identifier matches — the canonical phone, or
//                       the email (trimmed, lowercased)
//   POSSIBLE_DUPLICATE  a weak or contradictory match — same first + last
//                       name; the same last nine digits where canonical forms
//                       cannot decide; the phone matching one record while the
//                       email matches another
//   NEW                 nothing matches
//
// A first name alone never makes a duplicate. Nothing here ever merges or
// fills anything: classification only decides what the review proposes.

import { clientEmailComparisonKey, isValidClientEmail } from '../email';
import { isClientArchived } from '../lifecycle';
import type { Client } from '../types';

import { clientImportPhoneKey } from './phone-key';
import {
  isBlockingClientImportIssue,
  type ClientImportCandidate,
  type ClientImportIssue,
} from './types';

export type ClientImportStatus = 'NEW' | 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'INVALID';

export type ClientImportMatchReason =
  | 'PHONE'
  | 'EMAIL'
  | 'NAME'
  | 'PHONE_LAST_DIGITS'
  | 'PHONE_EMAIL_CONFLICT';

export type ClientImportMatchTarget =
  | { readonly kind: 'CLIENT'; readonly clientId: string; readonly archived: boolean }
  | { readonly kind: 'CANDIDATE'; readonly candidateKey: string };

export interface ClientImportMatch {
  readonly reason: ClientImportMatchReason;
  readonly target: ClientImportMatchTarget;
}

export interface ClassifiedClientImportCandidate {
  readonly candidate: ClientImportCandidate;
  readonly status: ClientImportStatus;
  /** Extraction issues + current validation issues, blocking ones first. */
  readonly issues: readonly ClientImportIssue[];
  /** Why a duplicate is one (absent for NEW and INVALID). */
  readonly match?: ClientImportMatch;
}

/** Issues computed from the current field values — re-run after every edit. */
export function validateClientImportCandidate(
  candidate: ClientImportCandidate,
): readonly ClientImportIssue[] {
  const issues: ClientImportIssue[] = [];
  if ((candidate.firstName ?? '').trim().length === 0) issues.push({ code: 'MISSING_FIRST_NAME' });
  const email = candidate.email?.trim() ?? '';
  if (email.length > 0 && !isValidClientEmail(email)) issues.push({ code: 'INVALID_EMAIL' });
  const phone = candidate.phone?.trim() ?? '';
  if (phone.length > 0 && clientImportPhoneKey(phone).canonical === undefined) {
    issues.push({ code: 'UNRECOGNIZED_PHONE' });
  }
  return issues;
}

/** Accent-, case- and separator-insensitive first + last name; undefined without both. */
function nameKey(firstName: string | undefined, lastName: string | undefined): string | undefined {
  const normalize = (value: string | undefined) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[-'’.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const first = normalize(firstName);
  const last = normalize(lastName);
  return first && last ? `${first}|${last}` : undefined;
}

interface Identity {
  readonly phone?: string;
  readonly lastNine?: string;
  readonly email?: string;
  readonly name?: string;
}

function identityOf(record: {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
}): Identity {
  const phone = clientImportPhoneKey(record.phone);
  return {
    phone: phone.canonical,
    lastNine: phone.lastNine,
    email: clientEmailComparisonKey(record.email),
    name: nameKey(record.firstName, record.lastName),
  };
}

type IdentityKind = keyof Identity;

/** Existing records by comparison key; insertion order = precedence (Clients first). */
class IdentityIndex {
  private readonly maps: Record<IdentityKind, Map<string, ClientImportMatchTarget[]>> = {
    phone: new Map(),
    lastNine: new Map(),
    email: new Map(),
    name: new Map(),
  };

  add(identity: Identity, target: ClientImportMatchTarget): void {
    for (const kind of Object.keys(this.maps) as IdentityKind[]) {
      const key = identity[kind];
      if (key === undefined) continue;
      const targets = this.maps[kind].get(key);
      if (targets) targets.push(target);
      else this.maps[kind].set(key, [target]);
    }
  }

  find(kind: IdentityKind, identity: Identity): readonly ClientImportMatchTarget[] {
    const key = identity[kind];
    return key === undefined ? [] : (this.maps[kind].get(key) ?? []);
  }
}

function sameTarget(a: ClientImportMatchTarget, b: ClientImportMatchTarget): boolean {
  if (a.kind === 'CLIENT' && b.kind === 'CLIENT') return a.clientId === b.clientId;
  if (a.kind === 'CANDIDATE' && b.kind === 'CANDIDATE') return a.candidateKey === b.candidateKey;
  return false;
}

function findMatch(identity: Identity, index: IdentityIndex): {
  readonly status: ClientImportStatus;
  readonly match?: ClientImportMatch;
} {
  const byPhone = index.find('phone', identity);
  const byEmail = index.find('email', identity);

  if (byPhone.length > 0 && byEmail.length > 0) {
    const common = byPhone.find((target) => byEmail.some((other) => sameTarget(target, other)));
    return common
      ? { status: 'EXACT_DUPLICATE', match: { reason: 'PHONE', target: common } }
      : { status: 'POSSIBLE_DUPLICATE', match: { reason: 'PHONE_EMAIL_CONFLICT', target: byPhone[0]! } };
  }
  if (byPhone.length > 0) return { status: 'EXACT_DUPLICATE', match: { reason: 'PHONE', target: byPhone[0]! } };
  if (byEmail.length > 0) return { status: 'EXACT_DUPLICATE', match: { reason: 'EMAIL', target: byEmail[0]! } };

  // Canonical forms did not decide (one side unrecognized, or different
  // country codes): the same last nine digits is only a hint.
  const byLastNine = index.find('lastNine', identity);
  if (byLastNine.length > 0) {
    return { status: 'POSSIBLE_DUPLICATE', match: { reason: 'PHONE_LAST_DIGITS', target: byLastNine[0]! } };
  }
  const byName = index.find('name', identity);
  if (byName.length > 0) {
    return { status: 'POSSIBLE_DUPLICATE', match: { reason: 'NAME', target: byName[0]! } };
  }
  return { status: 'NEW' };
}

/**
 * Classifies a batch, in order, against the existing Clients (archived
 * included) and the earlier non-invalid candidates of the same batch.
 */
export function classifyClientImportCandidates(
  candidates: readonly ClientImportCandidate[],
  existingClients: readonly Client[],
): readonly ClassifiedClientImportCandidate[] {
  const index = new IdentityIndex();
  for (const client of existingClients) {
    index.add(identityOf(client), {
      kind: 'CLIENT',
      clientId: client.id,
      archived: isClientArchived(client),
    });
  }

  return candidates.map((candidate) => {
    const validation = validateClientImportCandidate(candidate);
    const issues = [...validation, ...candidate.issues].sort(
      (a, b) => Number(isBlockingClientImportIssue(b)) - Number(isBlockingClientImportIssue(a)),
    );
    if (validation.some(isBlockingClientImportIssue)) {
      return { candidate, status: 'INVALID', issues };
    }
    const identity = identityOf(candidate);
    const { status, match } = findMatch(identity, index);
    index.add(identity, { kind: 'CANDIDATE', candidateKey: candidate.key });
    return { candidate, status, issues, ...(match ? { match } : {}) };
  });
}
