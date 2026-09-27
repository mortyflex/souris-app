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

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1, skipped: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 0, skipped: 1, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
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

    expect(summary).toEqual({ claimed: 3, sent: 1, retried: 1, failed: 1, skipped: 0, reconciliation: { claimed: 0, reconciled: 0, retried: 0, parked: 0 } });
    expect(queue.read('c-sent').status).toBe('SENT');
    expect(queue.read('c-retry').status).toBe('SCHEDULED');
    expect(queue.read('c-failed').status).toBe('FAILED');
    expect(transport.deliveries).toHaveLength(1);
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
      'https://oxfqcgbtihczubisjyek.supabase.co/storage/v1/object/public/brand/logo-mark.png';
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
    expect(html).toContain('logo-mark.png');
    expect(html).toContain(`<img src="${PRODUCTION_LOGO}"`);
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
