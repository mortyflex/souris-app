// BeautIzzy — Plus entitlement mirror: an in-memory mirror for tests
//
// Reproduces the contract of the SQL functions: user matching by uuid, one
// row per (user, environment, product), the UNIQUE event id, the optimistic
// guard on each row's `latest_event_id`, the reconciliation's "confirmed later
// wins" per row, and THE effective-access rule of `subscription_has_plus_access`.

import type { EntitlementSnapshot, SubscriptionEnvironment } from '../entitlement-snapshot.ts';
import type {
  ApplyEventResult,
  ApplyReconciliationResult,
  MirrorRead,
  SnapshotWrite,
  SubscriptionEventRecord,
  SubscriptionMirror,
} from '../mirror.ts';

export interface FakeUser {
  readonly id: string;
  readonly businessId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The production stores of `subscription_has_plus_access`, mirrored for tests. */
const PRODUCTION_ACCESS_STORES = ['APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE', 'PROMOTIONAL'];

export class FakeSubscriptionMirror implements SubscriptionMirror {
  readonly users = new Map<string, FakeUser>();
  readonly rows = new Map<string, EntitlementSnapshot>();
  readonly events: SubscriptionEventRecord[] = [];
  readonly reconciliations: { userId: string; environment: SubscriptionEnvironment; productId: string; snapshot: EntitlementSnapshot }[] = [];
  /** When set, the next `applyEvent` rejects with it (a database failure). */
  failNextApply: Error | undefined;

  addUser(user: FakeUser): void {
    this.users.set(user.id.toLowerCase(), user);
  }

  private key(userId: string, environment: SubscriptionEnvironment, productId: string): string {
    return `${userId.toLowerCase()}:${environment}:${productId}`;
  }

  setSnapshot(userId: string, environment: SubscriptionEnvironment, snapshot: EntitlementSnapshot): void {
    this.rows.set(this.key(userId, environment, snapshot.productId), snapshot);
  }

  snapshot(userId: string, environment: SubscriptionEnvironment, productId: string): EntitlementSnapshot | undefined {
    return this.rows.get(this.key(userId, environment, productId));
  }

  snapshots(userId: string, environment: SubscriptionEnvironment): EntitlementSnapshot[] {
    const prefix = `${userId.toLowerCase()}:${environment}:`;
    return [...this.rows.entries()].filter(([key]) => key.startsWith(prefix)).map(([, row]) => row).sort((a, b) => a.productId.localeCompare(b.productId));
  }

  /** THE rule of `subscription_has_plus_access`: any PRODUCTION row of a production store, not EXPIRED, end not reached. */
  hasPlusAccess(userId: string, atMs: number): boolean {
    return this.snapshots(userId, 'PRODUCTION').some(
      (row) =>
        row.store !== null &&
        PRODUCTION_ACCESS_STORES.includes(row.store) &&
        row.status !== 'EXPIRED' &&
        (row.entitledUntilMs === null || row.entitledUntilMs > atMs),
    );
  }

  async readMirror(appUserIds: readonly string[], environment: SubscriptionEnvironment): Promise<MirrorRead> {
    for (const candidate of appUserIds) {
      if (!UUID.test(candidate)) continue;
      const user = this.users.get(candidate.toLowerCase());
      if (user === undefined) continue;
      return {
        userId: user.id,
        businessId: user.businessId ?? null,
        matchedAppUserId: candidate,
        snapshots: this.snapshots(user.id, environment),
      };
    }
    return { userId: null, businessId: null, matchedAppUserId: null, snapshots: [] };
  }

  async applyEvent(record: SubscriptionEventRecord, writes: readonly SnapshotWrite[]): Promise<ApplyEventResult> {
    if (this.failNextApply !== undefined) {
      const error = this.failNextApply;
      this.failNextApply = undefined;
      throw error;
    }
    if (this.events.some((event) => event.eventId === record.eventId)) return { status: 'DUPLICATE' };
    // Guard first: a failed guard leaves NO history row (the SQL transaction rolls back).
    for (const write of writes) {
      const current = this.snapshot(write.userId, write.environment, write.productId);
      const currentLatest = current?.latestEventId ?? null;
      if ((current === undefined && write.expectedLatestEventId !== null) || (current !== undefined && currentLatest !== write.expectedLatestEventId)) {
        throw new Error('subscriptions: snapshot changed since it was read');
      }
    }
    this.events.push(record);
    for (const write of writes) this.setSnapshot(write.userId, write.environment, write.snapshot);
    return { status: record.outcome, applied: writes.length };
  }

  async applyReconciliation(
    userId: string,
    environment: SubscriptionEnvironment,
    productId: string,
    snapshot: EntitlementSnapshot,
  ): Promise<ApplyReconciliationResult> {
    const current = this.snapshot(userId, environment, productId);
    if (current !== undefined && current.verifiedAtMs > snapshot.verifiedAtMs) return 'STALE';
    const kept =
      current !== undefined && snapshot.latestEventId === null
        ? { latestEventId: current.latestEventId, latestEventType: current.latestEventType, latestEventAtMs: current.latestEventAtMs }
        : {};
    const written: EntitlementSnapshot = { ...snapshot, ...kept, productId, source: 'RECONCILIATION' };
    this.setSnapshot(userId, environment, written);
    this.reconciliations.push({ userId, environment, productId, snapshot: written });
    return 'APPLIED';
  }
}
