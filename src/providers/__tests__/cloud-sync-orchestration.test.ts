import type { SyncRunResult } from '@/persistence/sync/push-worker';

import { createSyncOrchestration, createSyncOrchestrationLock } from '../cloud-sync-orchestration';

const pushed: SyncRunResult = { status: 'PUSHED', bootstrap: 'ALREADY_SYNCED', initialUploadEnqueued: 0, pushed: 0, failed: 0, conflicts: [] };

function deferredRun() {
  let resolve!: (result: SyncRunResult) => void;
  const result = new Promise<SyncRunResult>((done) => {
    resolve = done;
  });
  const run = jest.fn(() => result);
  return { run, resolve };
}

describe('sync orchestration', () => {
  it('runOnce is single-flight: a second call during a run answers ALREADY_RUNNING, the next call runs again', async () => {
    const { run, resolve } = deferredRun();
    const orchestration = createSyncOrchestration(createSyncOrchestrationLock(), run);
    const first = orchestration.runOnce();
    await expect(orchestration.runOnce()).resolves.toEqual({ status: 'SKIPPED', reason: 'ALREADY_RUNNING' });
    resolve(pushed);
    expect(await first).toBe(pushed);
    expect(run).toHaveBeenCalledTimes(1);
    resolve(pushed);
    await orchestration.runOnce();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('refreshNow joins the run in flight and resolves with its result; alone, it runs', async () => {
    const { run, resolve } = deferredRun();
    const orchestration = createSyncOrchestration(createSyncOrchestrationLock(), run);
    const first = orchestration.runOnce();
    const joined = orchestration.refreshNow();
    const joinedAgain = orchestration.refreshNow();
    expect(run).toHaveBeenCalledTimes(1);
    resolve(pushed);
    expect(await Promise.all([first, joined, joinedAgain])).toEqual([pushed, pushed, pushed]);

    await orchestration.refreshNow();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('the lock outlives the orchestration: a run started under previous conditions is still in flight for the next', async () => {
    const lock = createSyncOrchestrationLock();
    const { run, resolve } = deferredRun();
    const previous = createSyncOrchestration(lock, run);
    const started = previous.runOnce();
    const next = createSyncOrchestration(lock, jest.fn());
    await expect(next.runOnce()).resolves.toEqual({ status: 'SKIPPED', reason: 'ALREADY_RUNNING' });
    const joined = next.refreshNow();
    resolve(pushed);
    expect(await started).toBe(pushed);
    expect(await joined).toBe(pushed);
    expect(lock).toEqual({ running: false, inFlight: undefined });
  });

  it('releases the lock even when the run throws', async () => {
    const lock = createSyncOrchestrationLock();
    const orchestration = createSyncOrchestration(lock, async () => {
      throw new Error('boom');
    });
    await expect(orchestration.runOnce()).rejects.toThrow('boom');
    expect(lock).toEqual({ running: false, inFlight: undefined });
  });
});
