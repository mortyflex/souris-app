// BeautIzzy — clock rollback protection through the real provider over a real
// device database (Phase 6.5C, step 7): the observed mark is persisted at every
// resolution and survives restarts, normal progression and small corrections
// change nothing, a significant rollback refuses the grace (read-only,
// `unreliable-evidence`) while a paid period stays usable until its trusted
// end, a confirmed end and a fresh verification are unaffected, a version-1
// row is upgraded without losing the proof, corrupt rows and a failing store
// never crash, nothing crosses accounts or test configurations, and a
// detection deletes nothing.
//
// Enforcement is ENABLED here so the access decision is observable; the
// production constant is untouched. A "restart" is a new provider over the
// SAME database with a source that cannot verify (offline), at a clock the
// test chooses — including one set back.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { CLOCK_ROLLBACK_TOLERANCE_MS, OFFLINE_ACCESS_GRACE_PERIOD_MS, type SubscriptionStatus, type SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata, writeMetadata } from '@/persistence/metadata';
import { migrateDatabase } from '@/persistence/migrations';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { SUBSCRIPTION_ENFORCEMENT } from '../../enforcement';
import { createEntitlementEvidenceStore, ENTITLEMENT_EVIDENCE_KEY, type EntitlementEvidenceStore } from '../../evidence/entitlement-evidence-store';
import type { SubscriptionEvidenceProvenance, SubscriptionSource } from '../../subscription-source';
import { createFakeSubscriptionSource, UNAVAILABLE_VERIFICATION, type FakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '../BusinessAccessProvider';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const T0 = new Date('2026-10-01T09:00:00.000Z');
const EXPIRY = new Date('2026-10-31T09:00:00.000Z');
const GRACE_END = new Date(EXPIRY.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS);
const LEA = fakeUser.id;
const NOA = 'user-noa';

const at = (base: Date, offsetMs: number) => new Date(base.getTime() + offsetMs);
const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const ACTIVE = verified({ kind: 'active', plan: 'monthly', expiresAt: EXPIRY });
const RENEWED = verified({ kind: 'active', plan: 'monthly', expiresAt: at(EXPIRY, 30 * DAY_MS) });
const CANCELLED = verified({ kind: 'cancelled-active', plan: 'annual', expiresAt: EXPIRY });
const COMPLIMENTARY = verified({ kind: 'complimentary' });
const EXPIRED = verified({ kind: 'expired' });

let latest: BusinessAccessValue | undefined;

function Probe() {
  const value = useBusinessAccess();
  useEffect(() => {
    latest = value;
  });
  const { access, canMutate, verification } = value;
  return (
    <Text testID="access-state">
      {`${access.mode}:${access.reason}:${canMutate ? 'write' : 'read'}:${verification?.kind ?? 'pending'}`}
    </Text>
  );
}

type RenderedView = Awaited<ReturnType<typeof render>>;
const stateOf = (view: RenderedView) => view.getByTestId('access-state').props.children;
const settle = () => act(async () => {});

async function shutdown(view: RenderedView) {
  await act(async () => {
    view.unmount();
  });
}

const signedInAs = (id: string) => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: { id } }) });

function sourceAnswering(answer: SubscriptionVerification, provenance: SubscriptionEvidenceProvenance | 'none' = 'production'): FakeSubscriptionSource {
  const source = createFakeSubscriptionSource({ evidenceProvenance: provenance });
  source.respondWith(answer);
  return source;
}

const offline = (provenance: SubscriptionEvidenceProvenance | 'none' = 'production') => sourceAnswering(UNAVAILABLE_VERIFICATION, provenance);

interface Device {
  readonly db: SourisDatabase;
  readonly store: EntitlementEvidenceStore;
}

function openDevice(): Device {
  const db = openTestDatabase();
  migrateDatabase(db);
  return { db, store: createEntitlementEvidenceStore(db) };
}

interface Launch {
  readonly device: Device;
  readonly source: SubscriptionSource;
  readonly now: () => Date;
  readonly auth?: FakeAuthGateway;
  readonly enforcement?: 'enabled' | 'disabled';
  readonly store?: EntitlementEvidenceStore;
}

async function launch({ device, source, now, auth = signedInAs(LEA), enforcement = 'enabled', store = device.store }: Launch) {
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={now} evidenceStore={store}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await settle();
  await settle();
  return view;
}

/** The device restarts offline at `clockAt` (a clock the test may have set back). */
async function restartOffline(device: Device, clockAt: Date, options: Omit<Launch, 'device' | 'source' | 'now'> & { provenance?: SubscriptionEvidenceProvenance | 'none' } = {}) {
  const { provenance = 'production', ...rest } = options;
  return launch({ device, source: offline(provenance), now: () => clockAt, ...rest });
}

/** The device verifies online at `verifiedAt`, then is used offline until `usedUntil` (the mark advances to it), then is shut down. */
async function verifiedThenUsedUntil(device: Device, answer: SubscriptionVerification, verifiedAt: Date, usedUntil: Date) {
  await shutdown(await launch({ device, source: sourceAnswering(answer), now: () => verifiedAt }));
  await shutdown(await restartOffline(device, usedUntil));
  expect(device.store.read(LEA)?.observedAt).toEqual(usedUntil);
}

const appStateListeners = new Set<(state: AppStateStatus) => void>();

async function foreground() {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener('active');
  });
  await settle();
}

const ROLLBACK = CLOCK_ROLLBACK_TOLERANCE_MS + MINUTE_MS;

describe('BusinessAccessProvider — clock rollback protection', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
  });

  it('1. normal progression: the mark follows the clock at every resolution — verification, foreground return, restart — and the policy is the existing one', async () => {
    const device = openDevice();
    const view = await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 });
    expect(device.store.read(LEA)?.observedAt).toEqual(T0);
    await shutdown(view);

    let clock = at(T0, DAY_MS);
    const restarted = await restartOffline(device, clock);
    expect(stateOf(restarted)).toBe('full:entitled:write:unavailable');
    expect(device.store.read(LEA)?.observedAt).toEqual(clock);
    // A foreground return observes the clock too (the restart's clock is a closure: give it a later instant).
    await shutdown(restarted);
    clock = at(T0, 2 * DAY_MS);
    const later = await launch({ device, source: offline(), now: () => clock });
    clock = at(T0, 3 * DAY_MS);
    await foreground();
    expect(device.store.read(LEA)?.observedAt).toEqual(clock);
    await shutdown(later);

    // Right up to the end: entitled; in the grace: full; after the grace: read-only. Never more than 72 hours.
    for (const [instant, expected] of [
      [at(EXPIRY, -1), 'full:entitled:write:unavailable'],
      [at(EXPIRY, 10 * HOUR_MS), 'full:offline-grace:write:unavailable'],
      [at(GRACE_END, -1), 'full:offline-grace:write:unavailable'],
      [GRACE_END, 'read-only:grace-elapsed:read:unavailable'],
    ] as const) {
      const view = await restartOffline(device, instant);
      expect(stateOf(view)).toBe(expected);
      await shutdown(view);
    }
    expect(device.store.read(LEA)?.observedAt).toEqual(GRACE_END);
  });

  it('2. a small correction within the tolerance changes nothing: the mark stays, access is judged at it', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, -DAY_MS));
    const corrected = await restartOffline(device, at(EXPIRY, -DAY_MS - CLOCK_ROLLBACK_TOLERANCE_MS));
    expect(stateOf(corrected)).toBe('full:entitled:write:unavailable');
    expect(device.store.read(LEA)?.observedAt).toEqual(at(EXPIRY, -DAY_MS));
    await shutdown(corrected);

    // Corrected back across the grace end: judged at the mark, read-only — not one second won back.
    await shutdown(await restartOffline(device, GRACE_END));
    const acrossGraceEnd = await restartOffline(device, at(GRACE_END, -CLOCK_ROLLBACK_TOLERANCE_MS));
    expect(stateOf(acrossGraceEnd)).toBe('read-only:grace-elapsed:read:unavailable');
    await shutdown(acrossGraceEnd);
  });

  it('3. a significant rollback inside the paid period keeps the entitlement usable until its trusted end', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, -DAY_MS));
    const setBack = await restartOffline(device, at(T0, DAY_MS));
    expect(stateOf(setBack)).toBe('full:entitled:write:unavailable');
    // The proof and the mark are untouched by the detection.
    expect(device.store.read(LEA)).toMatchObject({ evidence: { verifiedAt: T0 }, observedAt: at(EXPIRY, -DAY_MS) });
    await shutdown(setBack);
  });

  it('4. a significant rollback once the mark is past the end refuses the grace: read-only as unreliable evidence, across restarts', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, HOUR_MS));
    // The clock is set back into the paid period, where a correct clock would read "entitled".
    const setBack = await restartOffline(device, at(EXPIRY, -10 * DAY_MS));
    expect(stateOf(setBack)).toBe('read-only:unreliable-evidence:read:unavailable');
    expect(latest?.writeRefusal).toBe('unreliable-evidence');
    await shutdown(setBack);

    // Restarting again, still set back: the same answer — the mark survived.
    const again = await restartOffline(device, at(EXPIRY, -9 * DAY_MS));
    expect(stateOf(again)).toBe('read-only:unreliable-evidence:read:unavailable');
    expect(device.store.read(LEA)?.observedAt).toEqual(at(EXPIRY, HOUR_MS));
    await shutdown(again);

    // Nothing was deleted: the proof row is intact, and a later honest clock inside the grace gets the grace.
    expect(device.store.read(LEA)).toMatchObject({ evidence: { verifiedAt: T0, entitlement: { kind: 'active', expiresAt: EXPIRY } } });
    const honest = await restartOffline(device, at(EXPIRY, 2 * HOUR_MS));
    expect(stateOf(honest)).toBe('full:offline-grace:write:unavailable');
    await shutdown(honest);
  });

  it('5. the grace already elapsed before the rollback: set back into the grace, or into the paid period, nothing is won back', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(GRACE_END, DAY_MS));
    for (const instant of [at(GRACE_END, -HOUR_MS), at(EXPIRY, -DAY_MS), at(T0, HOUR_MS)]) {
      const view = await restartOffline(device, instant);
      expect(stateOf(view)).toBe('read-only:unreliable-evidence:read:unavailable');
      await shutdown(view);
    }
    // A small correction after the grace elapsed reads as elapsed, as before.
    const corrected = await restartOffline(device, at(GRACE_END, DAY_MS - CLOCK_ROLLBACK_TOLERANCE_MS));
    expect(stateOf(corrected)).toBe('read-only:grace-elapsed:read:unavailable');
    await shutdown(corrected);
  });

  it('6. a rollback during a session: the foreground return re-resolves against the mark the session already observed', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, -DAY_MS));
    let clock = at(EXPIRY, HOUR_MS);
    const view = await launch({ device, source: offline(), now: () => clock });
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    clock = at(EXPIRY, -5 * DAY_MS);
    await foreground();
    expect(stateOf(view)).toBe('read-only:unreliable-evidence:read:unavailable');
    expect(device.store.read(LEA)?.observedAt).toEqual(at(EXPIRY, HOUR_MS));
    // The clock catches up with the mark: the grace is granted again, from its own end.
    clock = at(EXPIRY, HOUR_MS + MINUTE_MS);
    await foreground();
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    expect(latest?.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    await shutdown(view);
  });

  it('7. a cancelled subscription past its end stays expired, and a confirmed end stays read-only, whatever the clock', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, CANCELLED, T0, at(EXPIRY, HOUR_MS));
    const setBack = await restartOffline(device, at(EXPIRY, -DAY_MS));
    expect(stateOf(setBack)).toBe('read-only:subscription-expired:read:unavailable');
    await shutdown(setBack);

    const ended = await launch({ device, source: sourceAnswering(EXPIRED), now: () => at(T0, HOUR_MS) });
    expect(stateOf(ended)).toBe('read-only:subscription-expired:read:verified');
    expect(device.store.read(LEA)).toBeUndefined();
    await shutdown(ended);
    // No proof: no grace, and no mark to speak of — set back or not.
    const noProof = await restartOffline(device, at(T0, -DAY_MS));
    expect(stateOf(noProof)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    await shutdown(noProof);
  });

  it('8. an indefinite complimentary access is unaffected by any rollback', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, COMPLIMENTARY, T0, at(T0, 400 * DAY_MS));
    const setBack = await restartOffline(device, at(T0, DAY_MS));
    expect(stateOf(setBack)).toBe('full:entitled:write:unavailable');
    await shutdown(setBack);
  });

  it('9. a fresh verification after a rollback is authoritative: the proof and the mark are reset to its instant', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, HOUR_MS));
    const clock = at(EXPIRY, -10 * DAY_MS);
    const offlineSetBack = await restartOffline(device, clock);
    expect(stateOf(offlineSetBack)).toBe('read-only:unreliable-evidence:read:unavailable');
    await shutdown(offlineSetBack);

    // The store answers at that clock (the adapter only accepts an answer within minutes of the store's own instant).
    const online = await launch({ device, source: sourceAnswering(RENEWED), now: () => clock });
    expect(stateOf(online)).toBe('full:entitled:write:verified');
    expect(device.store.read(LEA)).toEqual({
      userId: LEA,
      provenance: 'production',
      evidence: { verifiedAt: clock, entitlement: { kind: 'active', plan: 'monthly', expiresAt: at(EXPIRY, 30 * DAY_MS) } },
      observedAt: clock,
    });
    await shutdown(online);
    // Offline again at a later clock: the new proof speaks, normally.
    const after = await restartOffline(device, at(clock, DAY_MS));
    expect(stateOf(after)).toBe('full:entitled:write:unavailable');
    await shutdown(after);
  });

  it('10. a version-1 row is upgraded without losing the proof: its mark starts at the verification and advances from there', async () => {
    const device = openDevice();
    writeMetadata(
      device.db,
      ENTITLEMENT_EVIDENCE_KEY,
      JSON.stringify({ version: 1, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } }),
    );
    const view = await restartOffline(device, at(T0, DAY_MS));
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    expect(JSON.parse(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)!)).toMatchObject({ version: 2, observedAt: at(T0, DAY_MS).toISOString() });
    expect(device.store.read(LEA)).toMatchObject({ evidence: { verifiedAt: T0, entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY } } });
    await shutdown(view);

    // A version-1 row read by a clock set back below its verification is not a proof, as before.
    writeMetadata(
      device.db,
      ENTITLEMENT_EVIDENCE_KEY,
      JSON.stringify({ version: 1, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } }),
    );
    const behind = await restartOffline(device, at(T0, -HOUR_MS));
    expect(stateOf(behind)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(behind);
  });

  it.each([
    ['not JSON', '{corrupt'],
    ['a version-2 row without a mark', JSON.stringify({ version: 2, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } })],
    ['a version-2 row with an invalid mark', JSON.stringify({ version: 2, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), observedAt: 'later', entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } })],
    ['a later version', JSON.stringify({ version: 3, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), observedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } })],
  ])('11. a persisted row that is %s fails safe: no proof, no crash, nothing written by an offline launch, replaced by a verification', async (_label, raw) => {
    const device = openDevice();
    writeMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY, raw);
    const view = await restartOffline(device, at(T0, HOUR_MS));
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBe(raw);
    await shutdown(view);
    const verifiedAgain = await launch({ device, source: sourceAnswering(ACTIVE), now: () => at(T0, 2 * HOUR_MS) });
    expect(stateOf(verifiedAgain)).toBe('full:entitled:write:verified');
    expect(device.store.read(LEA)?.observedAt).toEqual(at(T0, 2 * HOUR_MS));
    await shutdown(verifiedAgain);
  });

  it('12. a mark ahead of the verification itself (the row was written then the clock set back below it) is not a proof, as before', async () => {
    const device = openDevice();
    device.store.write({ userId: LEA, provenance: 'production', evidence: { verifiedAt: T0, entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY } }, observedAt: at(T0, DAY_MS) });
    const behind = await restartOffline(device, at(T0, -ROLLBACK));
    expect(stateOf(behind)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    // The row is left alone: nothing deleted, nothing rewritten.
    expect(device.store.read(LEA)).toMatchObject({ observedAt: at(T0, DAY_MS) });
    await shutdown(behind);
  });

  it('13. a store that fails on observe keeps the session going on its in-memory mark; a later launch simply has no mark', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, -DAY_MS));
    const flaky: EntitlementEvidenceStore = {
      ...device.store,
      observe: () => {
        throw new Error('disk');
      },
    };
    let clock = at(EXPIRY, HOUR_MS);
    const view = await launch({ device, source: offline(), now: () => clock, store: flaky });
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    clock = at(EXPIRY, -5 * DAY_MS);
    await foreground();
    // The session remembers what it observed even though the disk refused it.
    expect(stateOf(view)).toBe('read-only:unreliable-evidence:read:unavailable');
    expect(device.store.read(LEA)?.observedAt).toEqual(at(EXPIRY, -DAY_MS));
    await shutdown(view);
  });

  it('14. accounts are isolated: another account’s mark never judges the signed-in user, and the owner finds hers back', async () => {
    const device = openDevice();
    await verifiedThenUsedUntil(device, ACTIVE, T0, at(EXPIRY, HOUR_MS));
    // Noa signs in with a clock set back: no proof, no mark of Léa's — and Léa's row is untouched.
    const noa = await launch({ device, source: offline(), now: () => at(T0, DAY_MS), auth: signedInAs(NOA) });
    expect(stateOf(noa)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(device.store.read(LEA)).toMatchObject({ observedAt: at(EXPIRY, HOUR_MS) });
    await shutdown(noa);
    // Léa, at the set-back clock: her own mark refuses the grace.
    const lea = await restartOffline(device, at(T0, DAY_MS));
    expect(stateOf(lea)).toBe('read-only:unreliable-evidence:read:unavailable');
    await shutdown(lea);
    // Within one launch, switching to Noa and back: Noa's session carries none of Léa's mark.
    const auth = signedInAs(LEA);
    const clock = at(EXPIRY, -DAY_MS);
    const view = await launch({ device, source: offline(), now: () => clock, auth });
    expect(stateOf(view)).toBe('read-only:unreliable-evidence:read:unavailable');
    await act(async () => auth.emitSession({ id: NOA }));
    await settle();
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(view);
  });

  it('15. a trusted-test-source proof and its mark never authorize ordinary production access, set back or not', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE, 'trusted-test-source'), now: () => T0 }));
    await shutdown(await restartOffline(device, at(T0, DAY_MS), { provenance: 'trusted-test-source' }));
    expect(device.store.read(LEA)).toMatchObject({ provenance: 'trusted-test-source', observedAt: at(T0, DAY_MS) });
    for (const instant of [at(T0, 2 * DAY_MS), at(T0, HOUR_MS)]) {
      const release = await restartOffline(device, instant, { provenance: 'production' });
      expect(stateOf(release)).toBe('read-only:no-entitlement-evidence:read:unavailable');
      await shutdown(release);
    }
    // The bench itself is judged like any session: set back past the mark, inside the period, still entitled.
    const bench = await restartOffline(device, at(T0, HOUR_MS), { provenance: 'trusted-test-source' });
    expect(stateOf(bench)).toBe('full:entitled:write:unavailable');
    await shutdown(bench);
  });

  it('16. with enforcement disabled nothing is restricted, and the mark is still kept for the first build that enforces', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0, enforcement: SUBSCRIPTION_ENFORCEMENT }));
    await shutdown(await restartOffline(device, at(EXPIRY, HOUR_MS), { enforcement: SUBSCRIPTION_ENFORCEMENT }));
    expect(device.store.read(LEA)?.observedAt).toEqual(at(EXPIRY, HOUR_MS));
    const setBack = await restartOffline(device, at(EXPIRY, -10 * DAY_MS), { enforcement: SUBSCRIPTION_ENFORCEMENT });
    expect(stateOf(setBack)).toBe('full:enforcement-disabled:write:unavailable');
    expect(latest?.writeRefusal).toBeUndefined();
    await shutdown(setBack);
  });
});
