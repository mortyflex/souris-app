// Souris — Communication Core (Lot B hardening): the reconciliation retry pass

import { COMMUNICATION_RETRY_POLICY } from '../retry-policy';
import {
  runReconciliationRetries,
  sanitizeReconciliationError,
} from '../reconciliation';
import { FakeReconciliationRetryQueue } from '../testing/fake-reconciliation';
import { createFakeTransportRegistry } from '../fake-transport';
import { FakeCommunicationQueue } from '../testing/fake-queue';
import { runCommunicationsWorker } from '../worker';

describe('the retry pass', () => {
  it('re-runs the authoritative reconciliation and completes the job on success', async () => {
    const queue = new FakeReconciliationRetryQueue();
    queue.addJob({ id: 'job-1', scopeType: 'APPOINTMENT', sourceId: 'apt-1' });
    queue.addJob({ id: 'job-2', scopeType: 'BUSINESS', sourceId: '' });

    const summary = await runReconciliationRetries(queue);

    expect(summary).toEqual({ claimed: 2, reconciled: 2, retried: 0, parked: 0 });
    expect(queue.runs.map((job) => [job.scopeType, job.sourceId])).toEqual([
      ['APPOINTMENT', 'apt-1'],
      ['BUSINESS', ''],
    ]);
    expect(queue.settlements).toEqual([
      { id: 'job-1', outcome: 'COMPLETED', claimedUpdatedAt: 'claim-job-1' },
      { id: 'job-2', outcome: 'COMPLETED', claimedUpdatedAt: 'claim-job-2' },
    ]);
  });

  it('a failing reconciliation backs off under the CENTRAL policy', async () => {
    const queue = new FakeReconciliationRetryQueue();
    queue.addJob({ id: 'job-1', attemptCount: 1 });
    queue.scriptFailure('job-1', new Error('still broken'));

    const summary = await runReconciliationRetries(queue);

    expect(summary).toEqual({ claimed: 1, reconciled: 0, retried: 1, parked: 0 });
    expect(queue.settlements[0]).toMatchObject({
      id: 'job-1',
      outcome: 'RETRY',
      delaySeconds: COMMUNICATION_RETRY_POLICY.delaysSeconds[0],
      claimedUpdatedAt: 'claim-job-1',
    });
  });

  it('an exhausted job is PARKED (durable trace), never retried forever', async () => {
    const queue = new FakeReconciliationRetryQueue();
    queue.addJob({ id: 'job-1', attemptCount: COMMUNICATION_RETRY_POLICY.maxAttempts });
    queue.scriptFailure('job-1', new Error('permanently broken'));

    const summary = await runReconciliationRetries(queue);

    expect(summary).toEqual({ claimed: 1, reconciled: 0, retried: 0, parked: 1 });
    expect(queue.settlements[0]).toMatchObject({ id: 'job-1', outcome: 'PARKED' });
    expect(queue.settlements[0].error).toContain('retry attempts exhausted');
  });

  it('one failing job never blocks the others', async () => {
    const queue = new FakeReconciliationRetryQueue();
    queue.addJob({ id: 'job-1', attemptCount: 1 });
    queue.addJob({ id: 'job-2', attemptCount: 1 });
    queue.scriptFailure('job-1', new Error('boom'));

    const summary = await runReconciliationRetries(queue);

    expect(summary).toEqual({ claimed: 2, reconciled: 1, retried: 1, parked: 0 });
    expect(queue.settlements.map((s) => s.outcome)).toEqual(['RETRY', 'COMPLETED']);
  });

  it('sanitizes internal errors: emails redacted, bounded length', () => {
    expect(sanitizeReconciliationError(new Error('failed for lea@example.test today'))).toBe(
      'failed for [email] today',
    );
    expect(sanitizeReconciliationError('not-an-error')).toBe('unknown reconciliation error');
    expect(sanitizeReconciliationError(new Error('x'.repeat(1000)))).toHaveLength(300);
    const recorded = new FakeReconciliationRetryQueue();
    recorded.addJob({ id: 'job-1', attemptCount: 1 });
    recorded.scriptFailure('job-1', new Error('cannot reach lea@example.test'));
    return runReconciliationRetries(recorded).then(() => {
      expect(recorded.settlements[0].error).not.toContain('lea@example.test');
      expect(recorded.settlements[0].error).toContain('[email]');
    });
  });
});

describe('inside the worker pass', () => {
  it('runs the reconciliation retries BEFORE claiming due communications', async () => {
    const order: string[] = [];
    const reconciliation = new FakeReconciliationRetryQueue();
    reconciliation.addJob({ id: 'job-1' });
    const originalClaim = reconciliation.claimJobs.bind(reconciliation);
    reconciliation.claimJobs = async () => {
      order.push('reconciliation');
      return originalClaim();
    };
    const queue = new FakeCommunicationQueue();
    const originalClaimDue = queue.claimDue.bind(queue);
    queue.claimDue = async () => {
      order.push('send');
      return originalClaimDue();
    };
    const { registry } = createFakeTransportRegistry();

    const summary = await runCommunicationsWorker({ queue, transports: registry, reconciliation });

    expect(order).toEqual(['reconciliation', 'send']);
    expect(summary.reconciliation).toEqual({ claimed: 1, reconciled: 1, retried: 0, parked: 0 });
  });

  it('a worker without a reconciliation queue reports zeros and still sends', async () => {
    const queue = new FakeCommunicationQueue();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    const { registry } = createFakeTransportRegistry();

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary.reconciliation).toEqual({ claimed: 0, reconciled: 0, retried: 0, parked: 0 });
    expect(summary.sent).toBe(1);
  });
});
