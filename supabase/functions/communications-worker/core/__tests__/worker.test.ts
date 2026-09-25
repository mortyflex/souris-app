import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createFakeTransportRegistry, FakeCommunicationTransport } from '../fake-transport';
import { COMMUNICATION_RETRY_POLICY } from '../retry-policy';
import type { OutgoingCommunication, TransportResult } from '../transport';
import { runCommunicationsWorker } from '../worker';
import { FakeCommunicationQueue } from '../testing/fake-queue';

function createWorkerHarness() {
  const queue = new FakeCommunicationQueue();
  const { transport, registry } = createFakeTransportRegistry();
  return { queue, transport, registry };
}

describe('communications worker', () => {
  it('sends one due communication exactly once: scheduled → processing → sent', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
    const record = queue.read('c-1');
    expect(record.status).toBe('SENT');
    expect(record.attemptCount).toBe(1);
    expect(record.providerMessageId).toBe('fake:c-1');
    expect(record.retryDelaysSeconds).toEqual([]);
    expect(transport.deliveries).toHaveLength(1);
  });

  it('a second pass does not deliver a sent communication again', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    await runCommunicationsWorker({ queue, transports: registry });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary.claimed).toBe(0);
    expect(transport.deliveries).toHaveLength(1);
  });

  it('retries a retryable failure with the centralized delays, then fails at the last attempt', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({
      id: 'c-1',
      channel: 'EMAIL',
      payload: { fakeOutcome: 'RETRYABLE_FAILURE' },
    });

    for (let pass = 1; pass <= COMMUNICATION_RETRY_POLICY.maxAttempts; pass += 1) {
      await runCommunicationsWorker({ queue, transports: registry });
    }

    const record = queue.read('c-1');
    expect(record.status).toBe('FAILED');
    expect(record.attemptCount).toBe(COMMUNICATION_RETRY_POLICY.maxAttempts);
    expect(record.retryDelaysSeconds).toEqual([60, 300, 900]);
    expect(record.lastError).toContain('retry attempts exhausted');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('fails a permanent failure immediately, without any retry', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({
      id: 'c-1',
      channel: 'SMS',
      payload: { fakeOutcome: 'PERMANENT_FAILURE' },
    });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1, skipped: 0 });
    const record = queue.read('c-1');
    expect(record.status).toBe('FAILED');
    expect(record.attemptCount).toBe(1);
    expect(record.retryDelaysSeconds).toEqual([]);
    expect(transport.deliveries).toHaveLength(0);
  });

  it('treats a throwing transport as a retryable failure', async () => {
    const queue = new FakeCommunicationQueue();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    const throwing = {
      async send(): Promise<TransportResult> {
        throw new Error('socket closed');
      },
    };

    const summary = await runCommunicationsWorker({
      queue,
      transports: { EMAIL: throwing, SMS: throwing },
    });

    expect(summary.retried).toBe(1);
    const record = queue.read('c-1');
    expect(record.status).toBe('SCHEDULED');
    expect(record.lastError).toBe('socket closed');
    expect(record.retryDelaysSeconds).toEqual([60]);
  });

  it('never dispatches a communication cancelled between claim and dispatch', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    queue.onClaimed = (ids) => ids.forEach((id) => queue.cancel(id));

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 0, skipped: 1 });
    expect(queue.read('c-1').status).toBe('CANCELLED');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('records reality when cancellation lands after dispatch began (residual race)', async () => {
    const queue = new FakeCommunicationQueue();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    const racing = {
      async send(message: OutgoingCommunication): Promise<TransportResult> {
        // The cancellation arrives while the provider call is in flight —
        // after the worker's pre-dispatch re-check.
        queue.cancel(message.id);
        return { status: 'SENT', providerMessageId: 'prov-1' };
      },
    };

    await runCommunicationsWorker({ queue, transports: { EMAIL: racing, SMS: racing } });

    const record = queue.read('c-1');
    expect(record.status).toBe('CANCELLED');
    expect(record.providerMessageId).toBe('prov-1');
    expect(record.lastError).toBe('DISPATCHED_BEFORE_CANCELLATION');
  });

  it('bounds crash loops: a claim beyond the attempt maximum fails without dispatch', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({
      id: 'c-1',
      channel: 'EMAIL',
      attemptCount: COMMUNICATION_RETRY_POLICY.maxAttempts,
    });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary.failed).toBe(1);
    const record = queue.read('c-1');
    expect(record.status).toBe('FAILED');
    expect(record.lastError).toBe('retry attempts exhausted before dispatch');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('settles a mixed batch independently', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-sent', channel: 'EMAIL' });
    queue.addScheduled({
      id: 'c-retry',
      channel: 'EMAIL',
      payload: { fakeOutcome: 'RETRYABLE_FAILURE' },
    });
    queue.addScheduled({
      id: 'c-failed',
      channel: 'SMS',
      payload: { fakeOutcome: 'PERMANENT_FAILURE' },
    });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 3, sent: 1, retried: 1, failed: 1, skipped: 0 });
    expect(queue.read('c-sent').status).toBe('SENT');
    expect(queue.read('c-retry').status).toBe('SCHEDULED');
    expect(queue.read('c-failed').status).toBe('FAILED');
    expect(transport.deliveries).toHaveLength(1);
  });
});

describe('Lot A contains no real delivery path', () => {
  it('registers only the fake transport for every channel', () => {
    const { registry } = createFakeTransportRegistry();
    for (const transport of Object.values(registry)) {
      expect(transport).toBeInstanceOf(FakeCommunicationTransport);
    }
  });

  it('ships no provider SDK or provider endpoint in the worker sources', () => {
    const workerRoot = join(__dirname, '..', '..');
    const sources: string[] = [];
    const collect = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const entryPath = join(directory, name);
        if (!statSync(entryPath).isFile()) {
          // The guard covers the shipped worker sources; this test file
          // itself names the forbidden providers.
          if (name !== '__tests__') {
            collect(entryPath);
          }
        } else if (name.endsWith('.ts')) {
          sources.push(readFileSync(entryPath, 'utf8'));
        }
      }
    };
    collect(workerRoot);

    expect(sources.length).toBeGreaterThan(0);
    const forbidden = /resend|brevo|twilio|smsmode|sendgrid|mailgun|postmark|nodemailer/i;
    for (const source of sources) {
      expect(source).not.toMatch(forbidden);
      expect(source).not.toMatch(/fetch\s*\(/);
    }
  });
});
