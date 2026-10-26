// BeautIzzy — persisted entitlement evidence through the real provider over
// a real device database (Phase 6.5C, step 2): a verified entitlement is
// written, a restart without network starts from it and the domain's offline
// policy applies to it (full until its end, the 72-hour grace from THAT end,
// read-only after), a confirmed end erases it, an unavailable answer keeps
// it, nothing crosses accounts or test configurations, corrupt rows fail
// safe, and a late answer of a previous session writes nothing.
//
// Enforcement is ENABLED here so the access decision is observable; the
// production constant is untouched. A "restart" is a new provider over the
// SAME database with a source that cannot verify (offline).

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { OFFLINE_ACCESS_GRACE_PERIOD_MS, type SubscriptionStatus, type SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata, writeMetadata } from '@/persistence/metadata';
import { migrateDatabase } from '@/persistence/migrations';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { SUBSCRIPTION_ENFORCEMENT } from '../../enforcement';
import {
  createEntitlementEvidenceStore,
  ENTITLEMENT_EVIDENCE_KEY,
  type EntitlementEvidenceStore,
} from '../../evidence/entitlement-evidence-store';
import type { SubscriptionEvidenceProvenance, SubscriptionSource } from '../../subscription-source';
import { createFakeSubscriptionSource, UNAVAILABLE_VERIFICATION, type FakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '../BusinessAccessProvider';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const T0 = new Date('2026-10-15T09:00:00.000Z');
const EXPIRY = new Date('2026-11-15T09:00:00.000Z');
const LEA = fakeUser.id;
const NOA = 'user-noa';

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const ACTIVE = verified({ kind: 'active', plan: 'monthly', expiresAt: EXPIRY });
const CANCELLED = verified({ kind: 'cancelled-active', plan: 'annual', expiresAt: EXPIRY });
const COMPLIMENTARY = verified({ kind: 'complimentary' });
const COMPLIMENTARY_DATED = verified({ kind: 'complimentary', expiresAt: EXPIRY });
const EXPIRED = verified({ kind: 'expired' });
const NEVER = verified({ kind: 'never' });

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

/** The launch ends: unmounted inside act, so its last effects settle before the next launch. */
async function shutdown(view: RenderedView) {
  await act(async () => {
    view.unmount();
  });
}

const signedInAs = (id: string) => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: { id } }) });

/** A source whose answers are scripted, with the provenance of the configuration it stands for. */
function sourceAnswering(answer: SubscriptionVerification, provenance: SubscriptionEvidenceProvenance | 'none' = 'production'): FakeSubscriptionSource {
  const source = createFakeSubscriptionSource({ evidenceProvenance: provenance });
  source.respondWith(answer);
  return source;
}

/** Offline: the store cannot be reached, every verification is unavailable. */
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
  /** A launch without the store: the proof lives in memory only. */
  readonly withoutStore?: boolean;
}

/** One application launch: the provider over the device database, as the root layout mounts it. */
async function launch({ device, source, now, auth = signedInAs(LEA), enforcement = 'enabled', withoutStore = false }: Launch) {
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={now} evidenceStore={withoutStore ? undefined : device.store}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await settle();
  await settle();
  return view;
}

/** The device is restarted at `at`, offline: the previous launch is gone, the database remains. */
async function restartOffline(device: Device, at: Date, options: Omit<Launch, 'device' | 'source' | 'now'> & { provenance?: SubscriptionEvidenceProvenance | 'none' } = {}) {
  const { provenance = 'production', ...rest } = options;
  return launch({ device, source: offline(provenance), now: () => at, ...rest });
}

const appStateListeners = new Set<(state: AppStateStatus) => void>();

describe('BusinessAccessProvider — persisted entitlement evidence', () => {
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

  it('1. a verified active entitlement is persisted for the signed-in user, with the source’s provenance', async () => {
    const device = openDevice();
    const view = await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(device.store.read(LEA)).toEqual({
      userId: LEA,
      provenance: 'production',
      evidence: { verifiedAt: T0, entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY } },
      observedAt: T0,
    });
    await shutdown(view);
  });

  it('2. a restart without network restores full access from the persisted proof, without asking anything else', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));

    const source = offline();
    const view = await launch({ device, source, now: () => new Date(T0.getTime() + DAY_MS) });
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    expect(source.calls.verify).toEqual([LEA]);
    expect(device.store.read(LEA)).toBeDefined();
    await shutdown(view);
  });

  it('3. access stays full offline right up to the verified end, exclusive', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));

    const view = await restartOffline(device, new Date(EXPIRY.getTime() - 1));
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    await shutdown(view);
  });

  it('4. the offline grace runs from the verified end, not from the restart', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));

    const restartedAt = new Date(EXPIRY.getTime() + 10 * HOUR_MS);
    const view = await restartOffline(device, restartedAt);
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    expect(latest?.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: new Date(EXPIRY.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS) });
    await shutdown(view);

    // Restarting again later moves nothing: the deadline is a property of the proof.
    const later = await restartOffline(device, new Date(restartedAt.getTime() + 20 * HOUR_MS));
    expect(latest?.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: new Date(EXPIRY.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS) });
    await shutdown(later);
  });

  it('5. access is read-only once the 72-hour grace after the verified end has elapsed', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));

    const view = await restartOffline(device, new Date(EXPIRY.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS));
    expect(stateOf(view)).toBe('read-only:grace-elapsed:read:unavailable');
    // The proof itself is kept: a later verification, not time, is what replaces it.
    expect(device.store.read(LEA)).toBeDefined();
    await shutdown(view);
  });

  it('5b. a cancelled subscription gets no grace: read-only from its end, offline', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(CANCELLED), now: () => T0 }));

    const before = await restartOffline(device, new Date(EXPIRY.getTime() - 1));
    expect(stateOf(before)).toBe('full:entitled:write:unavailable');
    await shutdown(before);
    const after = await restartOffline(device, new Date(EXPIRY.getTime() + 1));
    expect(stateOf(after)).toBe('read-only:subscription-expired:read:unavailable');
    await shutdown(after);
  });

  it('6. a confirmed expiration or absence erases the persisted proof: the next offline restart has none', async () => {
    for (const confirmedEnd of [EXPIRED, NEVER]) {
      const device = openDevice();
      await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));
      expect(device.store.read(LEA)).toBeDefined();

      const ended = await launch({ device, source: sourceAnswering(confirmedEnd), now: () => new Date(T0.getTime() + DAY_MS) });
      expect(stateOf(ended)).toMatch(/^read-only:(subscription-expired|never-subscribed):read:verified$/);
      expect(device.store.read(LEA)).toBeUndefined();
      expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
      await shutdown(ended);

      const view = await restartOffline(device, new Date(T0.getTime() + 2 * DAY_MS));
      expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
      await shutdown(view);
    }
  });

  it('7. an unavailable verification — offline, store unreachable, a rejecting source — keeps the persisted proof exactly as it is (only the observed mark advances)', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0 }));
    const { observedAt: _initialMark, ...written } = device.store.read(LEA)!;

    const rejecting = createFakeSubscriptionSource({ verify: () => Promise.reject(new Error('store unreachable')) });
    const view = await launch({ device, source: rejecting, now: () => new Date(T0.getTime() + DAY_MS) });
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    // A foreground return that cannot verify either changes nothing.
    await act(async () => {
      for (const listener of [...appStateListeners]) listener('active');
    });
    await settle();
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    const { observedAt, ...kept } = device.store.read(LEA)!;
    expect(kept).toEqual(written);
    expect(observedAt).toEqual(new Date(T0.getTime() + DAY_MS));
    await shutdown(view);
  });

  it('8. a device without a persisted proof has no offline access', async () => {
    const device = openDevice();
    const view = await restartOffline(device, T0);
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    await shutdown(view);
  });

  it('9. switching accounts never transfers the proof: the other account starts without one, the owner finds hers again', async () => {
    const device = openDevice();
    const auth = signedInAs(LEA);
    const view = await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0, auth });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    await shutdown(view);

    // Noa signs in on the same device, offline: nothing of Léa's proof is hers, and nothing of it is erased.
    const noa = await launch({ device, source: offline(), now: () => new Date(T0.getTime() + HOUR_MS), auth: signedInAs(NOA) });
    expect(stateOf(noa)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(device.store.read(LEA)).toBeDefined();
    expect(device.store.read(NOA)).toBeUndefined();
    await shutdown(noa);

    // A verified absence for Noa erases nothing of Léa's either.
    const noaVerified = await launch({ device, source: sourceAnswering(NEVER), now: () => new Date(T0.getTime() + HOUR_MS), auth: signedInAs(NOA) });
    expect(stateOf(noaVerified)).toBe('read-only:never-subscribed:read:verified');
    expect(device.store.read(LEA)).toBeDefined();
    await shutdown(noaVerified);

    // Léa, back offline, rests on her proof.
    const lea = await restartOffline(device, new Date(T0.getTime() + 2 * HOUR_MS));
    expect(stateOf(lea)).toBe('full:entitled:write:unavailable');
    await shutdown(lea);
  });

  it('9b. within one launch, a sign-out and another sign-in read their own proof — never the previous session’s', async () => {
    const device = openDevice();
    device.store.write({ userId: NOA, provenance: 'production', evidence: { verifiedAt: T0, entitlement: { kind: 'trial', plan: 'annual', expiresAt: EXPIRY } }, observedAt: T0 });
    const auth = signedInAs(LEA);
    const source = offline();
    const view = await launch({ device, source, now: () => new Date(T0.getTime() + HOUR_MS), auth });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');

    await act(async () => auth.emitSession(null));
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');

    await act(async () => auth.emitSession({ id: NOA }));
    await settle();
    await settle();
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');
    expect(latest?.access).toEqual({ mode: 'full', reason: 'entitled' });

    await act(async () => auth.emitSession({ id: LEA }));
    await settle();
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(view);
  });

  it('10. a proof produced by a trusted test source never restores ordinary production access, and is not erased by that refusal', async () => {
    const device = openDevice();
    const bench = await launch({ device, source: sourceAnswering(ACTIVE, 'trusted-test-source'), now: () => T0 });
    expect(stateOf(bench)).toBe('full:entitled:write:verified');
    expect(device.store.read(LEA)).toMatchObject({ provenance: 'trusted-test-source' });
    await shutdown(bench);

    const release = await restartOffline(device, new Date(T0.getTime() + HOUR_MS), { provenance: 'production' });
    expect(stateOf(release)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(device.store.read(LEA)).toMatchObject({ provenance: 'trusted-test-source' });
    await shutdown(release);

    // A source that declares no provenance (the unconfigured one) does not trust it either.
    const unconfigured = await restartOffline(device, new Date(T0.getTime() + HOUR_MS), { provenance: 'none' });
    expect(stateOf(unconfigured)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(unconfigured);
  });

  it('11. a trusted test source restores its own proof — and a production proof too', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE, 'trusted-test-source'), now: () => T0 }));
    const bench = await restartOffline(device, new Date(T0.getTime() + HOUR_MS), { provenance: 'trusted-test-source' });
    expect(stateOf(bench)).toBe('full:entitled:write:unavailable');
    await shutdown(bench);

    await shutdown(await launch({ device, source: sourceAnswering(ACTIVE, 'production'), now: () => T0 }));
    const benchWithProduction = await restartOffline(device, new Date(T0.getTime() + HOUR_MS), { provenance: 'trusted-test-source' });
    expect(stateOf(benchWithProduction)).toBe('full:entitled:write:unavailable');
    await shutdown(benchWithProduction);
  });

  it('11b. a source without a declared provenance confirms a proof in memory but persists none', async () => {
    const device = openDevice();
    const view = await launch({ device, source: sourceAnswering(ACTIVE, 'none'), now: () => T0 });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    await shutdown(view);
  });

  it.each([
    ['not JSON', '{corrupt'],
    ['a later format version', JSON.stringify({ version: 3, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), observedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } })],
    ['an unknown entitlement kind', JSON.stringify({ version: 1, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), entitlement: { kind: 'lifetime' } })],
    ['a proof dated in the future', JSON.stringify({ version: 1, userId: LEA, provenance: 'production', verifiedAt: new Date(T0.getTime() + DAY_MS).toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: EXPIRY.toISOString() } })],
    ['an entitlement that ended before it was proven', JSON.stringify({ version: 1, userId: LEA, provenance: 'production', verifiedAt: T0.toISOString(), entitlement: { kind: 'active', plan: 'monthly', expiresAt: new Date(T0.getTime() - 1).toISOString() } })],
  ])('12. a persisted row that is %s fails safe: no proof, no crash, and a fresh verification replaces it', async (_label, raw) => {
    const device = openDevice();
    writeMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY, raw);
    const view = await restartOffline(device, new Date(T0.getTime() + HOUR_MS));
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(view);

    const verifiedAgain = await launch({ device, source: sourceAnswering(ACTIVE), now: () => new Date(T0.getTime() + 2 * HOUR_MS) });
    expect(stateOf(verifiedAgain)).toBe('full:entitled:write:verified');
    expect(device.store.read(LEA)).toBeDefined();
    await shutdown(verifiedAgain);
  });

  it('12b. a store that throws on read or write never fails the session', async () => {
    const device = openDevice();
    const broken: EntitlementEvidenceStore = {
      read: () => {
        throw new Error('disk');
      },
      write: () => {
        throw new Error('disk');
      },
      observe: () => {
        throw new Error('disk');
      },
      clear: () => {
        throw new Error('disk');
      },
    };
    const view = await render(
      <AuthProvider gateway={signedInAs(LEA)}>
        <BusinessAccessProvider enforcement="enabled" source={sourceAnswering(ACTIVE)} clock={() => T0} evidenceStore={broken}>
          <Probe />
        </BusinessAccessProvider>
      </AuthProvider>,
    );
    await settle();
    await settle();
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    await shutdown(view);
  });

  it('13. a complimentary grant without an end is restored indefinitely; a dated one follows the same offline policy as any entitlement', async () => {
    const device = openDevice();
    await shutdown(await launch({ device, source: sourceAnswering(COMPLIMENTARY), now: () => T0 }));
    const yearsLater = await restartOffline(device, new Date(T0.getTime() + 3 * 365 * DAY_MS));
    expect(stateOf(yearsLater)).toBe('full:entitled:write:unavailable');
    expect(device.store.read(LEA)).toEqual({ userId: LEA, provenance: 'production', evidence: { verifiedAt: T0, entitlement: { kind: 'complimentary' } }, observedAt: new Date(T0.getTime() + 3 * 365 * DAY_MS) });
    await shutdown(yearsLater);

    await shutdown(await launch({ device, source: sourceAnswering(COMPLIMENTARY_DATED), now: () => T0 }));
    const inGrace = await restartOffline(device, new Date(EXPIRY.getTime() + HOUR_MS));
    expect(stateOf(inGrace)).toBe('full:offline-grace:write:unavailable');
    await shutdown(inGrace);
    const afterGrace = await restartOffline(device, new Date(EXPIRY.getTime() + OFFLINE_ACCESS_GRACE_PERIOD_MS));
    expect(stateOf(afterGrace)).toBe('read-only:grace-elapsed:read:unavailable');
    await shutdown(afterGrace);
  });

  it('14. a verification of a previous account that lands after the account changed writes nothing and touches nobody', async () => {
    const device = openDevice();
    let answerLea: ((verification: SubscriptionVerification) => void) | undefined;
    const source = createFakeSubscriptionSource({
      verify: (userId) =>
        userId === LEA
          ? new Promise<SubscriptionVerification>((resolve) => {
              answerLea = resolve;
            })
          : Promise.resolve(UNAVAILABLE_VERIFICATION),
    });
    const auth = signedInAs(LEA);
    const view = await launch({ device, source, now: () => T0, auth });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');

    await act(async () => auth.emitSession({ id: NOA }));
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');

    await act(async () => answerLea?.(ACTIVE));
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    expect(device.store.read(LEA)).toBeUndefined();
    expect(device.store.read(NOA)).toBeUndefined();
    await shutdown(view);
  });

  it('a push from the store is persisted like a verification: a pushed expiration erases the proof', async () => {
    const device = openDevice();
    const source = sourceAnswering(ACTIVE);
    const view = await launch({ device, source, now: () => T0 });
    expect(device.store.read(LEA)).toBeDefined();
    await act(async () => source.emit(LEA, EXPIRED));
    await settle();
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(device.store.read(LEA)).toBeUndefined();
    await shutdown(view);
  });

  it('the proof is persisted with enforcement disabled too — nothing is restricted, the next build to enforce starts with it', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const device = openDevice();
    const view = await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0, enforcement: SUBSCRIPTION_ENFORCEMENT });
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    expect(device.store.read(LEA)).toBeDefined();
    await shutdown(view);

    const offlineDisabled = await restartOffline(device, new Date(T0.getTime() + DAY_MS), { enforcement: SUBSCRIPTION_ENFORCEMENT });
    expect(stateOf(offlineDisabled)).toBe('full:enforcement-disabled:write:unavailable');
    await shutdown(offlineDisabled);
  });

  it('without a store the proof lives in memory only, exactly as before', async () => {
    const device = openDevice();
    const view = await launch({ device, source: sourceAnswering(ACTIVE), now: () => T0, withoutStore: true });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(readMetadata(device.db, ENTITLEMENT_EVIDENCE_KEY)).toBeUndefined();
    await shutdown(view);
    const restarted = await restartOffline(device, new Date(T0.getTime() + HOUR_MS), { withoutStore: true });
    expect(stateOf(restarted)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    await shutdown(restarted);
  });
});
