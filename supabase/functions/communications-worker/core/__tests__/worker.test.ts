import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createFakeTransportRegistry, FakeCommunicationTransport } from '../fake-transport';
import {
  createProductionTransportRegistry,
  isEmailLogoConfigured,
  isSmsConfigured,
  WorkerConfigurationError,
} from '../production-transports';
import { ResendEmailTransport } from '../resend-transport';
import { TwilioSmsTransport } from '../twilio-transport';
import { UnsupportedChannelTransport } from '../unsupported-transport';
import { COMMUNICATION_RETRY_POLICY } from '../retry-policy';
import type { OutgoingCommunication, TransportResult } from '../transport';
import { runCommunicationsWorker, WorkerCompatibilityError } from '../worker';
import { FakeCommunicationQueue } from '../testing/fake-queue';
import { FakeReconciliationRetryQueue } from '../testing/fake-reconciliation';

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

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0, suspended: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1, skipped: 0, suspended: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 0, skipped: 1, suspended: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 3, sent: 1, retried: 1, failed: 1, skipped: 0, suspended: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
    expect(queue.read('c-sent').status).toBe('SENT');
    expect(queue.read('c-retry').status).toBe('SCHEDULED');
    expect(queue.read('c-failed').status).toBe('FAILED');
    expect(transport.deliveries).toHaveLength(1);
  });
});

describe('final pre-dispatch entitlement check (BeautIzzy Plus 6.5B)', () => {
  const reconciliationZeros = { claimed: 0, reconciled: 0, retried: 0, parked: 0 };

  it('enforcement DISABLED (the default): a Business without any entitlement is still sent — the pre-6.5B behavior', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    expect(queue.entitlementEnforcement).toBe(false);
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL', businessId: 'no-subscription' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0, suspended: 0, reconciliation: reconciliationZeros });
    expect(queue.read('c-1').status).toBe('SENT');
    expect(transport.deliveries).toHaveLength(1);
  });

  it('enforcement ENABLED: an entitled Business is sent exactly as before', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.setBusinessEntitled('plus-business', true);
    queue.addScheduled({ id: 'c-1', channel: 'SMS', businessId: 'plus-business', kind: 'CLIENT_BIRTHDAY_OFFER' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary.sent).toBe(1);
    expect(summary.suspended).toBe(0);
    expect(queue.read('c-1').status).toBe('SENT');
    expect(transport.deliveries).toHaveLength(1);
  });

  it('enforcement ENABLED: a Business that is not entitled is SUSPENDED by the database — never dispatched, never retried, never failed', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL', businessId: 'expired-business' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 0, skipped: 0, suspended: 1, reconciliation: reconciliationZeros });
    const record = queue.read('c-1');
    expect(record.status).toBe('CANCELLED');
    expect(record.lastError).toBe('ENTITLEMENT_SUSPENDED');
    expect(record.attemptCount).toBe(1);
    expect(record.retryDelaysSeconds).toEqual([]);
    expect(record.providerMessageId).toBeNull();
    expect(transport.deliveries).toHaveLength(0);
  });

  it('a suspended record is terminal: later passes never claim or send it (no duplicate, no replay)', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL', businessId: 'expired-business' });
    await runCommunicationsWorker({ queue, transports: registry });

    // Reactivation: the Business is entitled again — the suspended record stays history.
    queue.setBusinessEntitled('expired-business', true);
    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary.claimed).toBe(0);
    expect(queue.read('c-1').status).toBe('CANCELLED');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('reactivation: a NEW record scheduled after the Business is entitled again is sent normally', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.addScheduled({ id: 'c-old', channel: 'EMAIL', businessId: 'renewed-business' });
    await runCommunicationsWorker({ queue, transports: registry });
    expect(queue.read('c-old').status).toBe('CANCELLED');

    queue.setBusinessEntitled('renewed-business', true);
    queue.addScheduled({ id: 'c-new', channel: 'EMAIL', businessId: 'renewed-business' });
    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0, suspended: 0, reconciliation: reconciliationZeros });
    expect(queue.read('c-new').status).toBe('SENT');
    expect(queue.read('c-old').status).toBe('CANCELLED');
    expect(transport.deliveries).toHaveLength(1);
  });

  it('a mixed batch settles per Business: entitled sent, unentitled suspended, cancelled skipped', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.setBusinessEntitled('plus-business', true);
    queue.addScheduled({ id: 'c-plus', channel: 'EMAIL', businessId: 'plus-business' });
    queue.addScheduled({ id: 'c-expired', channel: 'SMS', businessId: 'expired-business', kind: 'INACTIVE_CLIENT_FOLLOWUP' });
    queue.addScheduled({ id: 'c-cancelled', channel: 'EMAIL', businessId: 'plus-business' });
    queue.onClaimed = () => queue.cancel('c-cancelled');

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(summary).toEqual({ claimed: 3, sent: 1, retried: 0, failed: 0, skipped: 1, suspended: 1, reconciliation: reconciliationZeros });
    expect(queue.read('c-plus').status).toBe('SENT');
    expect(queue.read('c-expired').status).toBe('CANCELLED');
    expect(queue.read('c-expired').lastError).toBe('ENTITLEMENT_SUSPENDED');
    expect(queue.read('c-cancelled').status).toBe('CANCELLED');
    expect(queue.read('c-cancelled').lastError).toBeNull();
    expect(transport.deliveries).toHaveLength(1);
  });

  it('an entitlement lost while the dispatch is in flight is recorded, never hidden (residual race)', async () => {
    const queue = new FakeCommunicationQueue();
    queue.entitlementEnforcement = true;
    queue.setBusinessEntitled('lapsing-business', true);
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL', businessId: 'lapsing-business' });
    const racing = {
      async send(message: OutgoingCommunication): Promise<TransportResult> {
        // The webhook's EXPIRATION lands (and the trigger suspends the row)
        // after the worker's authorization, while the provider call is in flight.
        queue.setBusinessEntitled('lapsing-business', false);
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

  it('the worker holds no entitlement rule: the authorization is asked once per claimed record and obeyed verbatim', async () => {
    const { transport, registry } = createWorkerHarness();
    const asked: string[] = [];
    const verdicts: Record<string, 'DISPATCH' | 'SUSPENDED' | 'SKIPPED'> = {
      'c-dispatch': 'DISPATCH',
      'c-suspended': 'SUSPENDED',
      'c-skipped': 'SKIPPED',
    };
    const settled: string[] = [];
    const queue = {
      async verifyDispatchAuthorization() {},
      async claimDue() {
        return Object.keys(verdicts).map((id) => ({
          id,
          businessId: 'b',
          kind: 'APPOINTMENT_REMINDER',
          channel: 'EMAIL' as const,
          recipient: 'client@example.test',
          payload: {},
          attemptCount: 1,
        }));
      },
      async authorizeDispatch(id: string) {
        asked.push(id);
        return verdicts[id];
      },
      async markSent(id: string) {
        settled.push(`sent:${id}`);
      },
      async markRetry(id: string) {
        settled.push(`retry:${id}`);
      },
      async markFailed(id: string) {
        settled.push(`failed:${id}`);
      },
    };

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(asked).toEqual(['c-dispatch', 'c-suspended', 'c-skipped']);
    expect(settled).toEqual(['sent:c-dispatch']);
    expect(transport.deliveries.map((d) => d.id)).toEqual(['c-dispatch']);
    expect(summary).toEqual({ claimed: 3, sent: 1, retried: 0, failed: 0, skipped: 1, suspended: 1, reconciliation: reconciliationZeros });
  });
});

describe('deployment-order compatibility: the pass is refused BEFORE anything is claimed (Phase 6.5B hardening)', () => {
  it('1. the updated worker against a database WITHOUT the authorization RPC refuses the pass with an operational error', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.dispatchAuthorizationAvailable = false;

    await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toBeInstanceOf(WorkerCompatibilityError);
    await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toThrow(
      /pre-dispatch authorization gate unavailable — apply migration 20261005120000_add_communication_entitlement_enforcement\.sql before deploying this worker \(communications: communications_authorize_dispatch failed: Could not find the function/,
    );
    expect(queue.claimCalls).toBe(0);
    expect(transport.deliveries).toHaveLength(0);
  });

  it('2. with due communications waiting: nothing is claimed, no status moves, no provider is called', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.dispatchAuthorizationAvailable = false;
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    queue.addScheduled({ id: 'c-2', channel: 'SMS', kind: 'CLIENT_BIRTHDAY_OFFER' });
    const reconciliation = new FakeReconciliationRetryQueue();
    reconciliation.addJob({ id: 'j-1' });

    await expect(runCommunicationsWorker({ queue, transports: registry, reconciliation })).rejects.toBeInstanceOf(WorkerCompatibilityError);

    expect(queue.claimCalls).toBe(0);
    for (const id of ['c-1', 'c-2']) {
      const record = queue.read(id);
      expect(record.status).toBe('SCHEDULED');
      expect(record.attemptCount).toBe(0);
      expect(record.lastError).toBeNull();
      expect(record.retryDelaysSeconds).toEqual([]);
    }
    // The reconciliation retry pass is refused too: no job claimed or run.
    expect(reconciliation.runs).toEqual([]);
    expect(reconciliation.settlements).toEqual([]);
    expect(transport.deliveries).toHaveLength(0);
  });

  it('3. RPC available, enforcement disabled: the compatibility check runs first and delivery is exactly the pre-6.5B behavior', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL', businessId: 'no-subscription' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    // One check, performed before the (single) claim.
    expect(queue.compatibilityChecks).toEqual([0]);
    expect(queue.claimCalls).toBe(1);
    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0, suspended: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
    expect(queue.read('c-1').status).toBe('SENT');
    expect(transport.deliveries).toHaveLength(1);
  });

  it('4. RPC available, enforcement enabled: entitled sent, unentitled suspended — the check changes nothing', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.entitlementEnforcement = true;
    queue.setBusinessEntitled('plus-business', true);
    queue.addScheduled({ id: 'c-plus', channel: 'EMAIL', businessId: 'plus-business' });
    queue.addScheduled({ id: 'c-expired', channel: 'EMAIL', businessId: 'expired-business' });

    const summary = await runCommunicationsWorker({ queue, transports: registry });

    expect(queue.compatibilityChecks).toEqual([0]);
    expect(summary).toEqual({ claimed: 2, sent: 1, retried: 0, failed: 0, skipped: 0, suspended: 1, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
    expect(queue.read('c-plus').status).toBe('SENT');
    expect(queue.read('c-expired').status).toBe('CANCELLED');
    expect(queue.read('c-expired').lastError).toBe('ENTITLEMENT_SUSPENDED');
    expect(transport.deliveries).toHaveLength(1);
  });

  it('5. no duplicate dispatch: a refused pass followed by a healthy pass delivers each record exactly once', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    queue.dispatchAuthorizationAvailable = false;
    await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toBeInstanceOf(WorkerCompatibilityError);
    await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toBeInstanceOf(WorkerCompatibilityError);

    // The migration lands.
    queue.dispatchAuthorizationAvailable = true;
    const first = await runCommunicationsWorker({ queue, transports: registry });
    const second = await runCommunicationsWorker({ queue, transports: registry });

    expect(first.sent).toBe(1);
    expect(second.claimed).toBe(0);
    expect(queue.read('c-1').status).toBe('SENT');
    expect(queue.read('c-1').attemptCount).toBe(1);
    expect(transport.deliveries.map((d) => d.id)).toEqual(['c-1']);
  });

  it('6. attempt counts never move while the compatibility check fails, however many passes run', async () => {
    const { queue, transport, registry } = createWorkerHarness();
    queue.dispatchAuthorizationAvailable = false;
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    queue.addScheduled({ id: 'c-2', channel: 'EMAIL', attemptCount: COMMUNICATION_RETRY_POLICY.maxAttempts - 1 });

    // Many more passes than the retry policy allows: the crash-loop bound at
    // dispatch time is never reached because nothing is ever claimed.
    for (let pass = 0; pass < COMMUNICATION_RETRY_POLICY.maxAttempts * 3; pass += 1) {
      await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toBeInstanceOf(WorkerCompatibilityError);
    }

    expect(queue.claimCalls).toBe(0);
    expect(queue.read('c-1').attemptCount).toBe(0);
    expect(queue.read('c-2').attemptCount).toBe(COMMUNICATION_RETRY_POLICY.maxAttempts - 1);
    expect(queue.read('c-1').status).toBe('SCHEDULED');
    expect(queue.read('c-2').status).toBe('SCHEDULED');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('never falls back to dispatching without authorization: a probe that answers anything but the contract refuses the pass too', async () => {
    const { transport, registry } = createWorkerHarness();
    const queue = new FakeCommunicationQueue();
    queue.addScheduled({ id: 'c-1', channel: 'EMAIL' });
    queue.verifyDispatchAuthorization = async () => {
      throw new Error('communications: communications_authorize_dispatch answered "DISPATCH" to the probe instead of ABSENT');
    };

    await expect(runCommunicationsWorker({ queue, transports: registry })).rejects.toThrow(/answered "DISPATCH" to the probe instead of ABSENT/);
    expect(queue.claimCalls).toBe(0);
    expect(queue.read('c-1').status).toBe('SCHEDULED');
    expect(transport.deliveries).toHaveLength(0);
  });
});

describe('the delivery surface stays contained (Lot B)', () => {
  it('the test registry holds only the fake transport for every channel', () => {
    const { registry } = createFakeTransportRegistry();
    for (const transport of Object.values(registry)) {
      expect(transport).toBeInstanceOf(FakeCommunicationTransport);
    }
  });

  // Obviously fake credentials only; nothing here may look like a real secret.
  const RESEND_ENV: Record<string, string> = {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'rappels@souris.test',
  };
  const TWILIO_ENV: Record<string, string> = {
    TWILIO_ACCOUNT_SID: 'AC-fake-account-sid',
    TWILIO_AUTH_TOKEN: 'fake-auth-token',
    TWILIO_FROM_NUMBER: '+15005550006',
  };

  it('without Twilio configuration the registry binds EMAIL to Resend and refuses SMS — never the fake', () => {
    const registry = createProductionTransportRegistry((name) => RESEND_ENV[name]);
    expect(registry.EMAIL).toBeInstanceOf(ResendEmailTransport);
    expect(registry.SMS).toBeInstanceOf(UnsupportedChannelTransport);
    expect(isSmsConfigured((name) => RESEND_ENV[name])).toBe(false);
    for (const transport of Object.values(registry)) {
      expect(transport).not.toBeInstanceOf(FakeCommunicationTransport);
    }
  });

  it('SMS PIVOT PHASE 2: a COMPLETE Twilio configuration binds the real SMS transport', () => {
    const env = { ...RESEND_ENV, ...TWILIO_ENV };
    const registry = createProductionTransportRegistry((name) => env[name]);
    expect(registry.EMAIL).toBeInstanceOf(ResendEmailTransport);
    expect(registry.SMS).toBeInstanceOf(TwilioSmsTransport);
    expect(isSmsConfigured((name) => env[name])).toBe(true);
    for (const transport of Object.values(registry)) {
      expect(transport).not.toBeInstanceOf(FakeCommunicationTransport);
    }
  });

  it.each([['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN'], ['TWILIO_FROM_NUMBER']])(
    'a PARTIAL Twilio configuration (missing %s) binds UnsupportedChannelTransport',
    (missing) => {
      const env: Record<string, string | undefined> = { ...RESEND_ENV, ...TWILIO_ENV, [missing]: undefined };
      const registry = createProductionTransportRegistry((name) => env[name]);
      expect(registry.SMS).toBeInstanceOf(UnsupportedChannelTransport);
      expect(registry.SMS).not.toBeInstanceOf(TwilioSmsTransport);
      expect(isSmsConfigured((name) => env[name])).toBe(false);
      // EMAIL stays independent and real.
      expect(registry.EMAIL).toBeInstanceOf(ResendEmailTransport);
    },
  );

  it('a non-canonical Twilio sender number reads as not configured', () => {
    const env: Record<string, string> = { ...RESEND_ENV, ...TWILIO_ENV, TWILIO_FROM_NUMBER: '06 12 34 56 78' };
    const registry = createProductionTransportRegistry((name) => env[name]);
    expect(registry.SMS).toBeInstanceOf(UnsupportedChannelTransport);
    expect(isSmsConfigured((name) => env[name])).toBe(false);
  });

  it('the smsConfigured indicator is a boolean that never leaks a value', () => {
    expect(isSmsConfigured(() => undefined)).toBe(false);
    expect(isSmsConfigured((name) => TWILIO_ENV[name])).toBe(true);
  });

  it('Twilio configuration never rescues a missing email configuration', () => {
    expect(() => createProductionTransportRegistry((name) => TWILIO_ENV[name])).toThrow(
      WorkerConfigurationError,
    );
  });

  it('PRODUCTION PATH: env → registry → EMAIL transport → mocked Resend body carries the logo', async () => {
    // The exact deployed chain: the same factory the Edge entry calls, fed by
    // the same secret names, down to the HTML posted to the (mocked) provider.
    const PRODUCTION_LOGO =
      'https://oxfqcgbtihczubisjyek.supabase.co/storage/v1/object/public/brand/beautizzy-email-symbol.png';
    const env: Record<string, string> = {
      RESEND_API_KEY: 'test-key',
      RESEND_FROM_EMAIL: 'rappels@souris.test',
      SOURIS_EMAIL_LOGO_URL: PRODUCTION_LOGO,
    };
    const requests: { body: string }[] = [];
    const fetchFn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ body: String(init?.body) });
      return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
    }) as typeof fetch;

    const registry = createProductionTransportRegistry((name) => env[name], fetchFn);
    expect(isEmailLogoConfigured((name) => env[name])).toBe(true);

    const result = await registry.EMAIL.send({
      id: 'c-logo',
      businessId: 'biz-1',
      kind: 'APPOINTMENT_REMINDER',
      channel: 'EMAIL',
      recipient: 'lea@example.test',
      payload: {
        business_name: 'Salon Amélie',
        client_first_name: 'Léa',
        appointment_start_at: '2027-03-26T13:30:00.000Z',
        services: ['Coloration'],
        reply_to: 'amelie@salon.test',
      },
    });

    expect(result.status).toBe('SENT');
    const html = (JSON.parse(requests[0].body) as { html: string }).html;
    expect(html).toContain('beautizzy-email-symbol.png');
    expect(html).toContain(`<img src="${PRODUCTION_LOGO}"`);
  });

  it('reads the email logo from the historical SOURIS_EMAIL_LOGO_URL secret, and from no other name', () => {
    const read: string[] = [];
    const reader = (name: string) => {
      read.push(name);
      return name === 'SOURIS_EMAIL_LOGO_URL' ? 'https://cdn.souris.test/logo.png' : undefined;
    };
    expect(isEmailLogoConfigured(reader)).toBe(true);
    expect(read).toEqual(['SOURIS_EMAIL_LOGO_URL']);
    expect(isEmailLogoConfigured((name) => (name === 'BEAUTIZZY_EMAIL_LOGO_URL' ? 'https://cdn.souris.test/logo.png' : undefined))).toBe(false);
  });

  it('the logo diagnostic is a boolean that never leaks the value', () => {
    expect(isEmailLogoConfigured(() => undefined)).toBe(false);
    expect(isEmailLogoConfigured(() => 'not-a-url')).toBe(false);
    expect(isEmailLogoConfigured(() => '"https://cdn.souris.test/logo.png"\n')).toBe(true);
  });

  it('a missing or invalid provider configuration refuses the pass before anything is claimed', () => {
    expect(() => createProductionTransportRegistry(() => undefined)).toThrow(
      WorkerConfigurationError,
    );
    expect(() =>
      createProductionTransportRegistry((name) =>
        name === 'RESEND_API_KEY' ? 'test-key' : undefined,
      ),
    ).toThrow(WorkerConfigurationError);
    expect(() =>
      createProductionTransportRegistry((name) =>
        name === 'RESEND_API_KEY' ? 'test-key' : 'not an address',
      ),
    ).toThrow(WorkerConfigurationError);
  });

  it('keeps every provider call inside the one Resend transport module', () => {
    const workerRoot = join(__dirname, '..', '..');
    const sources: { readonly name: string; readonly content: string }[] = [];
    const collect = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const entryPath = join(directory, name);
        if (!statSync(entryPath).isFile()) {
          // The guard covers the shipped worker sources; this test file
          // itself names the providers.
          if (name !== '__tests__') {
            collect(entryPath);
          }
        } else if (name.endsWith('.ts')) {
          sources.push({ name, content: readFileSync(entryPath, 'utf8') });
        }
      }
    };
    collect(workerRoot);

    expect(sources.length).toBeGreaterThan(0);
    // No provider other than Resend (EMAIL) and Twilio (SMS, Lot C2) exists
    // anywhere — no other SDK, brand or endpoint.
    const forbiddenProviders = /brevo|smsmode|sendgrid|mailgun|postmark|nodemailer|vonage|messagebird/i;
    // Each provider and its network call live ONLY in its own transport
    // module (and the registry/entry that name it).
    const resendAllowed = new Set(['resend-transport.ts', 'production-transports.ts']);
    // Phase 2: the registry names the Twilio transport to bind it; the
    // provider endpoint and every network call still live in the transport.
    const twilioAllowed = new Set(['twilio-transport.ts', 'production-transports.ts']);
    for (const source of sources) {
      expect(source.content).not.toMatch(forbiddenProviders);
      if (source.name !== 'resend-transport.ts') {
        expect(source.content).not.toMatch(/api\.resend\.com/i);
      }
      if (source.name !== 'twilio-transport.ts') {
        expect(source.content).not.toMatch(/api\.twilio\.com/i);
      }
      if (source.name !== 'resend-transport.ts' && source.name !== 'twilio-transport.ts') {
        expect(source.content).not.toMatch(/fetch\s*\(\s*['"`]/);
      }
      if (!resendAllowed.has(source.name) && source.name !== 'index.ts' && source.name !== 'deno.d.ts') {
        expect(source.content).not.toMatch(/resend/i);
      }
      if (!twilioAllowed.has(source.name) && source.name !== 'index.ts' && source.name !== 'deno.d.ts') {
        expect(source.content).not.toMatch(/twilio/i);
      }
      // No credential material anywhere in the sources (Supabase secret
      // keys, Resend API keys, Twilio Account SIDs / API keys).
      expect(source.content).not.toMatch(/sb_secret_[A-Za-z0-9]{8}|re_[A-Za-z0-9]{10,}/);
      expect(source.content).not.toMatch(/\bAC[0-9a-f]{32}\b|\bSK[0-9a-f]{32}\b/);
    }
  });
});
