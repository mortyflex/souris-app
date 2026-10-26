// BeautIzzy — which persisted proof may be restored, and by whom — pure
//
// THE rule applied when a session starts (an app restart, a sign-in): a
// proof persisted earlier (`entitlement-evidence-store.ts`) is handed to the
// domain ONLY when every condition holds — otherwise the session starts
// without a proof, exactly as a fresh installation does:
//
//   account       the proof belongs to the signed-in user: another account's
//                 proof is never read, never deleted, never carried over;
//   provenance    the proof is trusted by the CURRENT source: a `production`
//                 proof always (a production-only source only ever confirmed
//                 production records, Phase 6.5C step 1); a
//                 `trusted-test-source` proof by a trusted test source only.
//                 A proof left by the Apple Sandbox bench — which shares the
//                 App Store bundle identifier, and therefore the device
//                 database, with a release — grants nothing to that release;
//   timestamps    the proof is reliable by the domain's own rule
//                 (`isReliableEntitlementEvidence`): a proof dated in the
//                 future, or an entitlement that ended before it was proven,
//                 is not restored at all rather than reported as unreliable —
//                 a persisted record that contradicts itself is corrupt.
//
// What the restored proof then GRANTS — full until its end, the 72-hour
// grace after it unless the entitlement was cancelled, read-only after —
// is decided by `resolveBusinessAccess` and nothing here: this module
// restores evidence, it never resolves access, and it reads no clock of its
// own.

import { isReliableEntitlementEvidence, type EntitlementEvidence } from '@/domain/access';

import type { SubscriptionEvidenceProvenance } from '../subscription-source';

import type { PersistedEntitlementEvidence } from './entitlement-evidence-store';

/** Whether a proof of `recorded` provenance may be honoured by a source of `current` provenance. */
export function isEvidenceProvenanceTrusted(
  recorded: SubscriptionEvidenceProvenance,
  current: SubscriptionEvidenceProvenance | undefined,
): boolean {
  if (recorded === 'production') return true;
  return current === 'trusted-test-source';
}

export interface RestoreEntitlementEvidenceInput {
  /** The persisted record, if any (already decoded and shape-valid). */
  readonly record: PersistedEntitlementEvidence | undefined;
  /** The signed-in user the session is starting for. */
  readonly userId: string;
  /** The provenance of the source the session will verify with; undefined for a source that confirms nothing. */
  readonly sourceProvenance: SubscriptionEvidenceProvenance | undefined;
  /** The instant the session is resolved for. */
  readonly now: Date;
}

/** The proof a starting session may rest on, or undefined: the session then starts without one. */
export function selectRestorableEntitlementEvidence({
  record,
  userId,
  sourceProvenance,
  now,
}: RestoreEntitlementEvidenceInput): EntitlementEvidence | undefined {
  if (record === undefined || record.userId !== userId) return undefined;
  if (!isEvidenceProvenanceTrusted(record.provenance, sourceProvenance)) return undefined;
  if (!isReliableEntitlementEvidence(record.evidence, now)) return undefined;
  return record.evidence;
}
