// BeautIzzy — the persisted proof: a strict, versioned wire form that round-
// trips every entitlement the domain knows, fails safe on anything else, and
// a store that reads, replaces and clears the named user's proof only.

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
  type PersistedEntitlementEvidence,
} from '../entitlement-evidence-store';

const VERIFIED_AT = new Date('2026-10-15T09:00:00.000Z');
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
  ...overrides,
});

const VALID_WIRE = {
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

  it('writes the documented version-1 shape, instants as ISO 8601, and nothing else', () => {
    expect(JSON.parse(encodeEntitlementEvidence(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT })))).toEqual(VALID_WIRE);
    expect(JSON.parse(encodeEntitlementEvidence(record({ kind: 'complimentary' })))).toEqual({
      ...VALID_WIRE,
      entitlement: { kind: 'complimentary' },
    });
    expect(ENTITLEMENT_EVIDENCE_FORMAT_VERSION).toBe(1);
  });

  it('reads exactly the documented shape and nothing looser', () => {
    expect(decodeEntitlementEvidence(JSON.stringify(VALID_WIRE))).toEqual(record({ kind: 'active', plan: 'monthly', expiresAt: EXPIRES_AT }));
    // Unknown extra keys of the same version are tolerated (a forward-compatible addition).
    expect(decodeEntitlementEvidence(JSON.stringify({ ...VALID_WIRE, note: 'later' }))).toBeDefined();
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not JSON', '{not json'],
    ['a JSON string', '"active"'],
    ['an array', '[]'],
    ['null', 'null'],
    ['another version', JSON.stringify({ ...VALID_WIRE, version: 2 })],
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
    expect(JSON.parse(readMetadata(db, ENTITLEMENT_EVIDENCE_KEY)!)).toMatchObject({ version: 1, userId: LEA });
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

  it('reads a corrupt, outdated or foreign row as no proof', () => {
    const { db, store } = openStore();
    for (const raw of ['', 'null', '{"version":2}', JSON.stringify({ ...VALID_WIRE, userId: NOA })]) {
      writeMetadata(db, ENTITLEMENT_EVIDENCE_KEY, raw);
      expect(store.read(LEA)).toBeUndefined();
    }
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

  it('restores the signed-in user’s trusted, reliable proof and nothing else', () => {
    expect(selectRestorableEntitlementEvidence({ record: production, userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual(evidence);
    expect(selectRestorableEntitlementEvidence({ record: production, userId: LEA, sourceProvenance: undefined, now: NOW })).toEqual(evidence);
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: 'trusted-test-source', now: NOW })).toEqual(evidence);

    expect(selectRestorableEntitlementEvidence({ record: undefined, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: production, userId: NOA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    expect(selectRestorableEntitlementEvidence({ record: test, userId: LEA, sourceProvenance: undefined, now: NOW })).toBeUndefined();
  });

  it('does not restore a proof whose timestamps contradict themselves or the present', () => {
    const future = record(evidence.entitlement, { evidence: { ...evidence, verifiedAt: new Date(NOW.getTime() + 1) } });
    expect(selectRestorableEntitlementEvidence({ record: future, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    const endedBeforeProven = record({ kind: 'active', plan: 'monthly', expiresAt: new Date(VERIFIED_AT.getTime() - 1) });
    expect(selectRestorableEntitlementEvidence({ record: endedBeforeProven, userId: LEA, sourceProvenance: 'production', now: NOW })).toBeUndefined();
    // A proof whose entitlement ended since it was proven IS restored: the domain's offline policy judges what it still grants.
    const endedSince = record({ kind: 'active', plan: 'monthly', expiresAt: new Date(VERIFIED_AT.getTime() + 1) });
    expect(selectRestorableEntitlementEvidence({ record: endedSince, userId: LEA, sourceProvenance: 'production', now: NOW })).toEqual(endedSince.evidence);
  });
});
