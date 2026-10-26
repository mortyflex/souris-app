// BeautIzzy — the persisted proof: a strict, versioned wire form that round-
// trips every entitlement the domain knows with its observed mark, still
// reads the version-1 rows of earlier builds, fails safe on anything else,
// and a store that reads, replaces, observes and clears the named user's
// proof only.

import type { EntitlementEvidence, SubscriptionEntitlement } from '@/domain/access';
import { migrateDatabase } from '@/persistence/migrations';
import { readMetadata, writeMetadata } from '@/persistence/metadata';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { isEvidenceProvenanceTrusted, selectRestorableEntitlementEvidence } from '../entitlement-evidence-policy';
import {
  createEntitlementEvidenceStore,
  decodeEntitlementEvidence,
  encodeEntitlementEvidence,
  ENTITLEMENT_EVIDENCE_FORMAT_VERSION,
  ENTITLEMENT_EVIDENCE_KEY,
  LEGACY_ENTITLEMENT_EVIDENCE_FORMAT_VERSION,
  persistedObservedUntil,
  type PersistedEntitlementEvidence,
} from '../entitlement-evidence-store';

const VERIFIED_AT = new Date('2026-10-15T09:00:00.000Z');
const OBSERVED_AT = new Date('2026-10-18T09:00:00.000Z');
const EXPIRES_AT = new Date('2026-11-15T09:00:00.000Z');
const LEA = 'user-lea';
const NOA = 'user-noa';

const ENTITLEMENTS: readonly SubscriptionEntitlement[] = [
  { kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT },
  { kind: 'active', plan: 'unknown', expiresAt: EXPIRES_AT },
  { kind: 'trial', plan: 'annual', expiresAt: EXPIRES_AT },
  { kind: 'cancelled-active', plan: 'monthly', expiresAt: EXPIRES_AT },
  { kind: 'complimentary', expiresAt: EXPIRES_AT },
  { kind: 'complimentary' },
];

const record = (entitlement: SubscriptionEntitlement, overrides: Partial<PersistedEntitlementEvidence> = {}): PersistedEntitlementEvidence => ({
  userId: LEA,
  provenance: 'production',
  evidence: { verifiedAt: VERIFIED_AT, entitlement },
  observedAt: OBSERVED_AT,
  ...overrides,
});

const VALID_WIRE = {
  version: 2,
  userId: LEA,
  provenance: 'production',
  verifiedAt: VERIFIED_AT.toISOString(),
  observedAt: OBSERVED_AT.toISOString(),
  entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT.toISOString() },
};

/** The row a build before step 7 wrote: version 1, no observed mark. */
const LEGACY_WIRE = {
  version: 1,
  userId: LEA,
  provenance: 'production',
  verifiedAt: VERIFIED_AT.toISOString(),
  entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT.toISOString() },
};

describe('encode / decode', () => {
  it.each(ENTITLEMENTS.map((entitlement) => [entitlement.kind + ('expiresAt' in entitlement ? '' : ' (no end)'), entitlement] as const))(
    'round-trips a %s proof with its user, provenance and instants',
    (_label, entitlement) => {
      for (const provenance of ['production', 'trusted-test-source'] as const) {
        const original = record(entitlement, { provenance });
        expect(decodeEntitlementEvidence(encodeEntitlementEvidence(original))).toEqual(original);
      }
    },
  );

  it('writes the documented version-2 shape, instants as ISO 8601, and nothing else', () => {
    expect(JSON.parse(encodeEntitlementEvidence(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT })))).toEqual(VALID_WIRE);
    expect(JSON.parse(encodeEntitlementEvidence(record({ kind: 'complimentary' })))).toEqual({
      ...VALID_WIRE,
      entitlement: { kind: 'complimentary' },
    });
    expect(ENTITLEMENT_EVIDENCE_FORMAT_VERSION).toBe(2);
    expect(LEGACY_ENTITLEMENT_EVIDENCE_FORMAT_VERSION).toBe(1);
  });

  it('reads exactly the documented shape and nothing looser', () => {
    expect(decodeEntitlementEvidence(JSON.stringify(VALID_WIRE))).toEqual(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }));
    // Unknown extra keys of the same version are tolerated (a forward-compatible addition).
    expect(decodeEntitlementEvidence(JSON.stringify({ ...VALID_WIRE, note: 'later' }))).toBeDefined();
  });

  it('version 1 → 2: a legacy row is still read, as a proof without a mark, and is written back as version 2', () => {
    const legacy = decodeEntitlementEvidence(JSON.stringify(LEGACY_WIRE));
    expect(legacy).toEqual(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }, { observedAt: undefined }));
    // A legacy row keeps its own strictness: a malformed field still reads as no proof; an observedAt it never had is ignored.
    expect(decodeEntitlementEvidence(JSON.stringify({ ...LEGACY_WIRE, entitlement: { kind: 'lifetime' } }))).toBeUndefined();
    expect(decodeEntitlementEvidence(JSON.stringify({ ...LEGACY_WIRE, observedAt: 'yesterday' }))).toEqual(legacy);
    // Written back, the mark starts at the verification instant — the one instant a version-1 row proves was observed.
    expect(JSON.parse(encodeEntitlementEvidence(legacy!))).toEqual({ ...VALID_WIRE, observedAt: VERIFIED_AT.toISOString() });
  });

  it('the mark a record stands for is never behind its verification', () => {
    expect(persistedObservedUntil(record({ kind: 'complimentary' }))).toEqual(OBSERVED_AT);
    expect(persistedObservedUntil(record({ kind: 'complimentary' }, { observedAt: undefined }))).toEqual(VERIFIED_AT);
    expect(persistedObservedUntil(record({ kind: 'complimentary' }, { observedAt: new Date(VERIFIED_AT.getTime() - 1) }))).toEqual(VERIFIED_AT);
    // A fresh Date, never the record's own instance.
    const original = record({ kind: 'complimentary' });
    expect(persistedObservedUntil(original)).not.toBe(original.observedAt);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not JSON', '{not json'],
    ['a JSON string', '"active"'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a later version', JSON.stringify({ ...VALID_WIRE, version: 3 })],
    ['version 2 without a mark', JSON.stringify({ ...VALID_WIRE, observedAt: undefined })],
    ['version 2 with an invalid mark', JSON.stringify({ ...VALID_WIRE, observedAt: 'yesterday' })],
    ['version 2 with a numeric mark', JSON.stringify({ ...VALID_WIRE, observedAt: OBSERVED_AT.getTime() })],
    ['a version written as text', JSON.stringify({ ...VALID_WIRE, version: '1' })],
    ['no version', JSON.stringify({ ...VALID_WIRE, version: undefined })],
    ['no user', JSON.stringify({ ...VALID_WIRE, userId: undefined })],
    ['an empty user', JSON.stringify({ ...VALID_WIRE, userId: '' })],
    ['a numeric user', JSON.stringify({ ...VALID_WIRE, userId: 42 })],
    ['an unknown provenance', JSON.stringify({ ...VALID_WIRE, provenance: 'sandbox' })],
    ['no provenance', JSON.stringify({ ...VALID_WIRE, provenance: undefined })],
    ['an invalid verifiedAt', JSON.stringify({ ...VALID_WIRE, verifiedAt: 'yesterday' })],
    ['a numeric verifiedAt', JSON.stringify({ ...VALID_WIRE, verifiedAt: VERIFIED_AT.getTime() })],
    ['no entitlement', JSON.stringify({ ...VALID_WIRE, entitlement: undefined })],
    ['an entitlement that is a string', JSON.stringify({ ...VALID_WIRE, entitlement: 'active' })],
    ['an unknown kind', JSON.stringify({ ...VALID_WIRE, entitlement: { kind: 'lifetime', plan: 'monthly', expiresAt: EXPIRES_AT.toISOString() } })],
    ['an expired kind (never a proof)', JSON.stringify({ ...VALID_WIRE, entitlement: { kind: 'expired' } })],
    ['an unknown plan', JSON.stringify({ ...VALID_WIRE, entitlement: { ...VALID_WIRE.entitlement, plan: 'weekly' } })],
    ['no plan', JSON.stringify({ ...VALID_WIRE, entitlement: { kind: 'active', expiresAt: EXPIRES_AT.toISOString() } })],
    ['no end on a paid entitlement', JSON.stringify({ ...VALID_WIRE, entitlement: { kind: 'active', plan: 'monthly' } })],
    ['an invalid end', JSON.stringify({ ...VALID_WIRE, entitlement: { ...VALID_WIRE.entitlement, expiresAt: 'soon' } })],
    ['an invalid end on a complimentary grant', JSON.stringify({ ...VALID_WIRE, entitlement: { kind: 'complimentary', expiresAt: 'soon' } })],
  ])('reads %s as no proof, without throwing', (_label, raw) => {
    expect(decodeEntitlementEvidence(raw)).toBeUndefined();
  });
});

describe('createEntitlementEvidenceStore', () => {
  function openStore() {
    const db = openTestDatabase();
    migrateDatabase(db);
    return { db, store: createEntitlementEvidenceStore(db) };
  }

  it('writes one metadata row and reads it back for its user only', () => {
    const { db, store } = openStore();
    expect(store.read(LEA)).toBeUndefined();
    const proof = record({ kind: 'trial', plan: 'annual', expiresAt: EXPIRES_AT });
    store.write(proof);
    expect(JSON.parse(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)!)).toMatchObject({ version: 2, userId: LEA, observedAt: OBSERVED_AT.toISOString() });
    expect(store.read(LEA)).toEqual(proof);
    expect(store.read(NOA)).toBeUndefined();
  });

  it('a later proof replaces the previous one, whoever it belonged to', () => {
    const { store } = openStore();
    store.write(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }));
    const noa = record({ kind: 'complimentary' }, { userId: NOA, provenance: 'trusted-test-source' });
    store.write(noa);
    expect(store.read(LEA)).toBeUndefined();
    expect(store.read(NOA)).toEqual(noa);
  });

  it('clears the named user’s proof, leaves another user’s proof alone, and removes an unreadable row', () => {
    const { db, store } = openStore();
    store.write(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }));
    store.clear(NOA);
    expect(store.read(LEA)).toBeDefined();
    store.clear(LEA);
    expect(store.read(LEA)).toBeUndefined();
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();

    writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, '{corrupt');
    expect(store.read(LEA)).toBeUndefined();
    store.clear(LEA);
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    // Clearing when nothing is stored is a no-op.
    store.clear(LEA);
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
  });

  it('reads a corrupt, later-versioned or foreign row as no proof', () => {
    const { db, store } = openStore();
    for (const raw of ['', 'null', '{"version":3}', '{"version":2}', JSON.stringify({ ...VALID_WIRE, userId: NOA })]) {
      writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, raw);
      expect(store.read(LEA)).toBeUndefined();
    }
  });

  it('observe advances the named user’s mark only, never back, and touches nothing else of the proof', () => {
    const { db, store } = openStore();
    const proof = record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT });
    store.write(proof);
    const later = new Date(OBSERVED_AT.getTime() + 60_000);
    store.observe(LEA, later);
    expect(store.read(LEA)).toEqual({ ...proof, observedAt: later });
    // Earlier or equal: nothing is rewritten.
    const written = readMetadata(db, ENTITLEMENT_EVIDENCE_KEY);
    store.observe(LEA, OBSERVED_AT);
    store.observe(LEA, later);
    store.observe(LEA, new Date(NaN));
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBe(written);
    // Another user's observation leaves the row alone.
    store.observe(NOA, new Date(later.getTime() + 60_000));
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBe(written);
    // No row, or an unreadable one: a no-op.
    writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, '{corrupt');
    store.observe(LEA, later);
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBe('{corrupt');
    store.clear(LEA);
    store.observe(LEA, later);
    expect(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
  });

  it('observe upgrades a version-1 row to version 2 on its first observation, keeping the proof', () => {
    const { db, store } = openStore();
    writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, JSON.stringify(LEGACY_WIRE));
    expect(store.read(LEA)).toMatchObject({ observedAt: undefined });
    // An observation behind the verification still upgrades the row, with the mark at the verification.
    store.observe(LEA, new Date(VERIFIED_AT.getTime() - 60_000));
    expect(JSON.parse(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)!)).toEqual({ ...VALID_WIRE, observedAt: VERIFIED_AT.toISOString() });
    store.observe(LEA, OBSERVED_AT);
    expect(store.read(LEA)).toEqual(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }));
  });
});

describe('THE restore rule', () => {
  const NOW = new Date('2026-10-20T09:00:00.000Z');
  const evidence: EntitlementEvidence = { verifiedAt: VERIFIED_AT, entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT } };
  const production = record(evidence.entitlement);
  const test = record(evidence.entitlement, { provenance: 'trusted-test-source' });

  it('a production proof is trusted by every source; a trusted-test-source proof by a trusted test source only', () => {
    expect(isEvidenceProvenanceTrusted('production', 'production')).toBe(true);
    expect(isEvidenceProvenanceTrusted('production', 'trusted-test-source')).toBe(true);
    expect(isEvidenceProvenanceTrusted('production', undefined)).toBe(true);
    expect(isEvidenceProvenanceTrusted('trusted-test-source', 'trusted-test-source')).toBe(true);
    expect(isEvidenceProvenanceTrusted('trusted-test-source', 'production')).toBe(false);
    expect(isEvidenceProvenanceTrusted('trusted-test-source', undefined)).toBe(false);
  });

  it('restores the signed-in user’s trusted, reliable proof with its mark advanced to now, and nothing else', () => {
    const restored = { evidence, observedUntil: NOW };
    expect(selectRestorableEntitlementEvidence({ record: production, userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual(restored);
    expect(selectRestorableEntitlementEvidence({ record: production, userId: LEA, sourceProvenance: undefined, now: NOW })).toEqual(restored);
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: 'trusted-test-source', now: NOW })).toEqual(restored);
    // A mark ahead of the clock is kept: the device observed it, and the domain judges the rollback.
    const ahead = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(selectRestorableEntitlementEvidence({ record: record(evidence.entitlement, { observedAt: ahead }), userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual({ evidence, observedUntil: ahead });
    // A version-1 record starts its mark at the verification.
    expect(selectRestorableEntitlementEvidence({ record: record(evidence.entitlement, { observedAt: undefined }), userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual(restored);

    expect(selectRestorableEntitlementEvidence({ record: undefined, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: production, userId: NOA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: undefined, now: NOW })).toBeUndefined();
  });

  it('does not restore a proof whose timestamps contradict themselves or the present, whatever mark it carries', () => {
    const future = record(evidence.entitlement, { evidence: { ...evidence, verifiedAt: new Date(NOW.getTime() + 1) } });
    expect(selectRestorableEntitlementEvidence({ record: future, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: { ...future, observedAt: new Date(NOW.getTime() + 60_000) }, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    const endedBeforeProven = record({ kind: 'active', plan: 'monthly', expiresAt: new Date(VERIFIED_AT.getTime() - 1) });
    expect(selectRestorableEntitlementEvidence({ record: endedBeforeProven, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    // A proof whose entitlement ended since it was proven IS restored: the domain's offline policy judges what it still grants.
    const endedSince = record({ kind: 'active', plan: 'monthly', expiresAt: new Date(VERIFIED_AT.getTime() + 1) });
    expect(selectRestorableEntitlementEvidence({ record: endedSince, userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual({ evidence: endedSince.evidence, observedUntil: NOW });
  });

  it('a clock behind the proof’s own verification restores nothing, legacy row or not: the existing read-only behaviour stands', () => {
    const behindVerification = new Date(VERIFIED_AT.getTime() - 60 * 60 * 1000);
    expect(selectRestorableEntitlementEvidence({ record: record(evidence.entitlement, { observedAt: undefined }), userId: LEA, sourceProvenance: 'production', now: behindVerification })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: production, userId: LEA, sourceProvenance: 'production', now: behindVerification })).toBeUndefined();
  });
});
