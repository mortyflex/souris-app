import {
  describeSyncRefreshFeedback,
  describeSyncRefreshOutcome,
  SYNC_REFRESH_FAILED_COPY,
  SYNC_REFRESH_OFFLINE_COPY,
  SYNC_REFRESH_UNAVAILABLE_COPY,
} from '../refresh-outcome';

const pushed = { status: 'PUSHED', bootstrap: 'ALREADY_SYNCED', initialUploadEnqueued: 0, pushed: 0, failed: 0, conflicts: [] } as const;
const pulled = { status: 'PULLED', fetched: 0, applied: 0, deleted: 0, skipped: 0, failed: 0, conflicts: [], cursorAdvanced: false } as const;

describe('describeSyncRefreshOutcome', () => {
  it('says SYNCED only when the remote was reached and the exchange went through', () => {
    expect(describeSyncRefreshOutcome({ status: 'RESTORED', restored: {} as never })).toBe('SYNCED');
    expect(describeSyncRefreshOutcome({ ...pushed, pull: pulled })).toBe('SYNCED');
    // The remote was just counted empty: nothing to exchange, still an answer.
    expect(describeSyncRefreshOutcome({ ...pushed, bootstrap: 'EMPTY' })).toBe('SYNCED');
    // A refusal or a conflict is the record's story, not the gesture's: the exchange happened.
    expect(
      describeSyncRefreshOutcome({
        ...pushed,
        failed: 1,
        adjustmentConflicts: [{ aggregateType: 'SALE_ADJUSTMENT', aggregateId: 'r', saleId: 's', reason: 'CEILING' as never }],
        pull: { ...pulled, fetched: 1, applied: 1, cursorAdvanced: true },
      }),
    ).toBe('SYNCED');
  });

  it('is OFFLINE when the remote could not be reached, FAILED when it answered badly — never success', () => {
    expect(describeSyncRefreshOutcome({ status: 'FAILED', reason: 'NETWORK' })).toBe('OFFLINE');
    expect(describeSyncRefreshOutcome({ ...pushed, failed: 1, stoppedBy: 'NETWORK' })).toBe('OFFLINE');
    expect(describeSyncRefreshOutcome({ ...pushed, pushed: 1, pull: { status: 'FAILED', reason: 'NETWORK' } })).toBe('OFFLINE');
    expect(describeSyncRefreshOutcome({ status: 'FAILED', reason: 'UNKNOWN' })).toBe('FAILED');
    expect(describeSyncRefreshOutcome({ ...pushed, failed: 1, stoppedBy: 'FORBIDDEN' })).toBe('FAILED');
    expect(describeSyncRefreshOutcome({ ...pushed, pull: { status: 'FAILED', reason: 'INVALID_REMOTE_DATA' } })).toBe('FAILED');
  });

  it('is UNAVAILABLE when no exchange is possible on this device', () => {
    expect(describeSyncRefreshOutcome(undefined)).toBe('UNAVAILABLE');
    expect(describeSyncRefreshOutcome({ status: 'SKIPPED', reason: 'NOT_BOUND' })).toBe('UNAVAILABLE');
    expect(describeSyncRefreshOutcome({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' })).toBe('UNAVAILABLE');
  });

  it('has one line per failure, none for success', () => {
    expect(describeSyncRefreshFeedback('SYNCED')).toBeUndefined();
    expect(describeSyncRefreshFeedback('OFFLINE')).toBe(SYNC_REFRESH_OFFLINE_COPY);
    expect(describeSyncRefreshFeedback('FAILED')).toBe(SYNC_REFRESH_FAILED_COPY);
    expect(describeSyncRefreshFeedback('UNAVAILABLE')).toBe(SYNC_REFRESH_UNAVAILABLE_COPY);
    expect(SYNC_REFRESH_OFFLINE_COPY).toBe('Actualisation impossible. Vérifiez votre connexion.');
    expect(SYNC_REFRESH_FAILED_COPY).toBe('Actualisation impossible. Réessayez.');
  });
});
