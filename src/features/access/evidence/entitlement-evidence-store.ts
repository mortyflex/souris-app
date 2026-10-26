// BeautIzzy — the persisted entitlement proof (BeautIzzy Plus, Phase 6.5C step 2)
//
// ONE row of `souris_metadata` holds the last proof the store gave this
// device: at `verifiedAt`, a verification confirmed `entitlement` for
// `userId`, through a source of `provenance`. It is what keeps the app usable
// after a restart without network, and the ONLY thing that does — the
// domain's `EntitlementEvidence`, with the two facts the domain does not
// model: whose proof it is, and where it came from.
//
// Written by `BusinessAccessProvider` ONLY, and only from a verified answer:
// a confirmed entitlement replaces the row, a confirmed expiration or absence
// deletes it (the domain's `updateEntitlementEvidence` decides which), an
// `unavailable` answer — offline, store unreachable — touches nothing. One
// row for the device (a single-business device): the next user's proof
// replaces the previous one; `read`, `observe` and `clear` act on the named
// user's proof only, so no account ever reads, inherits or erases another's.
//
// Observed time (Phase 6.5C step 7). The row also carries `observedAt`: the
// latest instant this device OBSERVED on its clock while holding the proof —
// the high-water mark the domain judges the offline policy at, so a clock set
// back wins back nothing (`resolve-business-access.ts`). It is LOCAL time,
// never the store's: `verifiedAt` is the instant a verification succeeded,
// `observedAt` the furthest the clock has been seen since. `observe` advances
// it (never back) without touching the proof; a verified answer writes the
// whole row anew, with the mark reset to its own instant (the store just
// agreed on the time).
//
// Versioned, typed wire format (`ENTITLEMENT_EVIDENCE_FORMAT_VERSION`):
//
//   { "version": 2, "userId", "provenance", "verifiedAt": ISO, "observedAt": ISO,
//     "entitlement": { "kind": "active" | "trial" | "cancelled-active",
//                      "plan": "monthly" | "annual" | "unknown", "expiresAt": ISO }
//                  | { "kind": "complimentary", "expiresAt"?: ISO } }
//
// Version 1 — the same row without `observedAt`, written by builds before
// step 7 — is still read, as a proof whose mark is unknown
// (`observedAt: undefined`; the domain then starts the mark at the proof's
// own instant): an upgrade loses no proof. The next write rewrites the row as
// version 2. A build before step 7 reads a version-2 row as no proof, by its
// own rule (a later version is not read): a downgrade starts without a proof,
// never with a misread one.
//
// Decoding is strict and fails safe: anything that is not exactly one of
// these — not JSON, another version, a missing or malformed field, an
// unknown kind, an invalid instant — reads as NO proof, never as a partial
// one, never as a crash. `clear` removes an unreadable row too (it is
// nobody's proof).
//
// This is not a security boundary: SQLite is readable on a jailbroken
// device. A forged proof buys at most the domain's 72-hour offline grace of
// local-only access, a forged mark buys at most what a clock set back would
// have; nothing it says ever reaches the server, whose mirror decides every
// write (`docs/architecture/SUBSCRIPTIONS.md`).

import type { EntitlementEvidence, EntitlementPlan, SubscriptionEntitlement } from '@/domain/access';
import type { SourisDatabase } from '@/persistence/database';
import { deleteMetadata, readMetadata, writeMetadata } from '@/persistence/metadata';

import type { SubscriptionEvidenceProvenance } from '../subscription-source';

export const ENTITLEMENT_EVIDENCE_KEY = 'business_access_evidence';

export const ENTITLEMENT_EVIDENCE_FORMAT_VERSION = 2;

/** The format of the rows written before Phase 6.5C step 7: still read, never written. */
export const LEGACY_ENTITLEMENT_EVIDENCE_FORMAT_VERSION = 1;

export interface PersistedEntitlementEvidence {
  readonly userId: string;
  readonly provenance: SubscriptionEvidenceProvenance;
  readonly evidence: EntitlementEvidence;
  /**
   * The latest instant this device observed on its clock while holding this
   * proof (local time, never the store's); `undefined` for a version-1 row.
   */
  readonly observedAt: Date | undefined;
}

export interface EntitlementEvidenceStore {
  /** The persisted proof of `userId`: undefined when none, when it is another user's, or when it is unreadable. */
  read(userId: string): PersistedEntitlementEvidence | undefined;
  /** Replaces the device's proof with `record`. */
  write(record: PersistedEntitlementEvidence): void;
  /**
   * Advances the observed mark of `userId`'s proof to `at` when later, and
   * nothing else; a proof of another user, an unreadable row or no row is
   * left exactly as it is.
   */
  observe(userId: string, at: Date): void;
  /** Removes the proof when it belongs to `userId` or is unreadable; another user's proof is left as it is. */
  clear(userId: string): void;
}

const PLANS: readonly EntitlementPlan[] = ['monthly', 'annual', 'unknown'];
const PROVENANCES: readonly SubscriptionEvidenceProvenance[] = ['production', 'trusted-test-source'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidInstant(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** An ISO 8601 instant; undefined for anything else. */
function parseInstant(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const instant = new Date(value);
  return isValidInstant(instant) ? instant : undefined;
}

function isPlan(value: unknown): value is EntitlementPlan {
  return typeof value === 'string' && PLANS.includes(value as EntitlementPlan);
}

function isProvenance(value: unknown): value is SubscriptionEvidenceProvenance {
  return typeof value === 'string' && PROVENANCES.includes(value as SubscriptionEvidenceProvenance);
}

function decodeEntitlement(value: unknown): SubscriptionEntitlement | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'complimentary') {
    if (value.expiresAt === undefined) return { kind: 'complimentary' };
    const expiresAt = parseInstant(value.expiresAt);
    return expiresAt === undefined ? undefined : { kind: 'complimentary', expiresAt };
  }
  if (value.kind !== 'active' && value.kind !== 'trial' && value.kind !== 'cancelled-active') return undefined;
  if (!isPlan(value.plan)) return undefined;
  const expiresAt = parseInstant(value.expiresAt);
  if (expiresAt === undefined) return undefined;
  return { kind: value.kind, plan: value.plan, expiresAt };
}

function encodeEntitlement(entitlement: SubscriptionEntitlement): Record<string, unknown> {
  if (entitlement.kind === 'complimentary') {
    return entitlement.expiresAt === undefined
      ? { kind: 'complimentary' }
      : { kind: 'complimentary', expiresAt: entitlement.expiresAt.toISOString() };
  }
  return { kind: entitlement.kind, plan: entitlement.plan, expiresAt: entitlement.expiresAt.toISOString() };
}

/**
 * The observed mark a record stands for: its own, or — for a version-1 row,
 * which kept none — the instant of its verification, which this device did
 * observe. Never earlier than the verification.
 */
export function persistedObservedUntil(record: PersistedEntitlementEvidence): Date {
  const { verifiedAt } = record.evidence;
  if (record.observedAt === undefined || record.observedAt.getTime() < verifiedAt.getTime()) {
    return new Date(verifiedAt.getTime());
  }
  return new Date(record.observedAt.getTime());
}

/** The wire form of a proof (version 2). Throws only for an invalid instant, which the domain never produces. */
export function encodeEntitlementEvidence(record: PersistedEntitlementEvidence): string {
  return JSON.stringify({
    version: ENTITLEMENT_EVIDENCE_FORMAT_VERSION,
    userId: record.userId,
    provenance: record.provenance,
    verifiedAt: record.evidence.verifiedAt.toISOString(),
    observedAt: persistedObservedUntil(record).toISOString(),
    entitlement: encodeEntitlement(record.evidence.entitlement),
  });
}

/** The proof a wire form holds, or undefined for anything that is not exactly a version-2 (or legacy version-1) proof. Never throws. */
export function decodeEntitlementEvidence(raw: string | undefined): PersistedEntitlementEvidence | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const legacy = parsed.version === LEGACY_ENTITLEMENT_EVIDENCE_FORMAT_VERSION;
  if (!legacy && parsed.version !== ENTITLEMENT_EVIDENCE_FORMAT_VERSION) return undefined;
  if (typeof parsed.userId !== 'string' || parsed.userId.length === 0) return undefined;
  if (!isProvenance(parsed.provenance)) return undefined;
  const verifiedAt = parseInstant(parsed.verifiedAt);
  if (verifiedAt === undefined) return undefined;
  const entitlement = decodeEntitlement(parsed.entitlement);
  if (entitlement === undefined) return undefined;
  let observedAt: Date | undefined;
  if (!legacy) {
    observedAt = parseInstant(parsed.observedAt);
    if (observedAt === undefined) return undefined;
  }
  return { userId: parsed.userId, provenance: parsed.provenance, evidence: { verifiedAt, entitlement }, observedAt };
}

/** The store over the device database. Reads and writes are synchronous, like every metadata access. */
export function createEntitlementEvidenceStore(db: SourisDatabase): EntitlementEvidenceStore {
  const decode = () => decodeEntitlementEvidence(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY));
  const write = (record: PersistedEntitlementEvidence) => {
    writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, encodeEntitlementEvidence(record));
  };
  return {
    read: (userId) => {
      const record = decode();
      return record !== undefined && record.userId === userId ? record : undefined;
    },
    write,
    observe: (userId, at) => {
      if (Number.isNaN(at.getTime())) return;
      const record = decode();
      if (record === undefined || record.userId !== userId) return;
      // The mark only advances; a version-1 row is rewritten as version 2 on its first observation.
      if (record.observedAt !== undefined && record.observedAt.getTime() >= at.getTime()) return;
      write({ ...record, observedAt: new Date(Math.max(at.getTime(), persistedObservedUntil(record).getTime())) });
    },
    clear: (userId) => {
      const record = decode();
      if (record !== undefined && record.userId !== userId) return;
      deleteMetadata(db, ENTITLEMENT_EVIDENCE_KEY);
    },
  };
}
