// Souris — Communication Core (Lot B): the Resend EMAIL transport
//
// Every provider call is a mocked fetch: no test ever reaches the network,
// and the suite locks in the result mapping, the stable idempotency key and
// the privacy rules (no key, no recipient, no payload in any error).

import {
  ResendEmailTransport,
  resendIdempotencyKey,
  sanitizeSenderDisplayName,
} from '../resend-transport';
import { UnsupportedChannelTransport } from '../unsupported-transport';
import type { OutgoingCommunication } from '../transport';

const API_KEY = 'test-api-key-value';

const message: OutgoingCommunication = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
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
};

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function createFetchMock(
  responses: readonly (Response | Error)[],
): { fetchFn: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const remaining = [...responses];
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    const next = remaining.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchFn, requests };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function createTransport(responses: readonly (Response | Error)[]) {
  const { fetchFn, requests } = createFetchMock(responses);
  const transport = new ResendEmailTransport({
    apiKey: API_KEY,
    fromEmail: 'rappels@souris.test',
    fetchFn,
  });
  return { transport, requests };
}

describe('successful dispatch', () => {
  it('posts the composed email and captures the provider message id', async () => {
    const { transport, requests } = createTransport([json(200, { id: 'resend-msg-1' })]);

    const result = await transport.send(message);

    expect(result).toEqual({ status: 'SENT', providerMessageId: 'resend-msg-1' });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(requests[0].init.body));
    expect(body.from).toBe('"Salon Amélie via Souris" <rappels@souris.test>');
    expect(body.to).toEqual(['lea@example.test']);
    expect(body.reply_to).toEqual(['amelie@salon.test']);
    expect(body.subject).toBe('Rappel de votre rendez-vous chez Salon Amélie');
    expect(body.html).toContain('Bonjour Léa,');
    expect(body.text).toContain('Bonjour Léa,');
  });

  it('uses ONE stable idempotency key derived from the communication id, retry after retry', async () => {
    const { transport, requests } = createTransport([
      json(500, { name: 'internal_server_error' }),
      json(200, { id: 'resend-msg-2' }),
    ]);

    await transport.send(message);
    await transport.send(message);

    const keys = requests.map(
      (request) => (request.init.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toBe(resendIdempotencyKey(message.id));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toContain(message.id);
  });

  it('carries the configured footer logo through to the posted HTML', async () => {
    const { fetchFn, requests } = createFetchMock([json(200, { id: 'x' })]);
    const transport = new ResendEmailTransport({
      apiKey: API_KEY,
      fromEmail: 'rappels@souris.test',
      logoUrl: 'https://cdn.souris.test/brand/logo-mark.png',
      fetchFn,
    });
    await transport.send(message);
    const body = JSON.parse(String(requests[0].init.body));
    expect(body.html).toContain('<img src="https://cdn.souris.test/brand/logo-mark.png" width="120" height="40" alt="Souris"');
    expect(body.text).not.toContain('<img');
  });

  it('sends the text-only footer when no logo is configured', async () => {
    const { transport, requests } = createTransport([json(200, { id: 'x' })]);
    await transport.send(message);
    const body = JSON.parse(String(requests[0].init.body));
    expect(body.html).not.toContain('<img');
    expect(body.html).toContain('Envoyé avec Souris');
  });

  it('omits reply_to when the payload has none', async () => {
    const { transport, requests } = createTransport([json(200, { id: 'x' })]);
    await transport.send({ ...message, payload: { ...message.payload, reply_to: null } });
    expect('reply_to' in JSON.parse(String(requests[0].init.body))).toBe(false);
  });
});

describe('failure mapping', () => {
  it('a network exception is retryable', async () => {
    const { transport } = createTransport([new Error('socket hang up: lea@example.test')]);
    const result = await transport.send(message);
    expect(result.status).toBe('RETRYABLE_FAILURE');
    // The thrown message could quote anything: it never reaches the record.
    expect((result as { error: string }).error).toBe('resend: network failure');
  });

  it('HTTP 429 is retryable', async () => {
    const { transport } = createTransport([json(429, { name: 'rate_limit_exceeded' })]);
    const result = await transport.send(message);
    expect(result).toEqual({ status: 'RETRYABLE_FAILURE', error: 'resend: 429 rate_limit_exceeded' });
  });

  it('HTTP 5xx is retryable', async () => {
    const { transport } = createTransport([json(503, { name: 'application_error' })]);
    expect((await transport.send(message)).status).toBe('RETRYABLE_FAILURE');
  });

  it('an invalid request or recipient (other 4xx) fails permanently', async () => {
    const { transport } = createTransport([
      json(422, { name: 'validation_error', message: 'lea@example.test is invalid' }),
    ]);
    const result = await transport.send(message);
    expect(result).toEqual({ status: 'PERMANENT_FAILURE', error: 'resend: 422 validation_error' });
  });

  it('a malformed queue payload fails permanently without any provider call', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, payload: { nothing: true } });
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });

  it('an unusable recipient fails permanently without any provider call', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, recipient: 'not-an-address' });
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });

  it('a non-appointment kind fails permanently without any provider call', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, kind: 'INACTIVE_CLIENT_FOLLOWUP' });
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });
});

describe('privacy', () => {
  it('never puts the API key, the recipient or the payload into an error', async () => {
    const { transport } = createTransport([
      json(400, { name: 'invalid_from', message: `key ${API_KEY} for lea@example.test` }),
      new Error(API_KEY),
    ]);
    const first = await transport.send(message);
    const second = await transport.send(message);
    for (const result of [first, second]) {
      const error = (result as { error?: string }).error ?? '';
      expect(error).not.toContain(API_KEY);
      expect(error).not.toContain('lea@example.test');
      expect(error).not.toContain('Salon');
    }
  });

  it('sends the key only as the Authorization header', async () => {
    const { transport, requests } = createTransport([json(200, { id: 'x' })]);
    await transport.send(message);
    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(String(requests[0].init.body)).not.toContain(API_KEY);
    expect(requests[0].url).not.toContain(API_KEY);
  });
});

describe('sender display name safety', () => {
  it('strips header metacharacters from the business name', () => {
    expect(sanitizeSenderDisplayName('Salon "Léa" <evil@x.y>\r\nBcc: a@b.c')).toBe(
      'Salon Léa evil@x.y Bcc: a@b.c via Souris',
    );
    expect(sanitizeSenderDisplayName('   ')).toBe('Souris');
    expect(sanitizeSenderDisplayName('A'.repeat(200))).toHaveLength('A'.repeat(80).length + ' via Souris'.length);
  });
});

describe('SMS stays unsupported in production', () => {
  it('the Resend transport refuses a non-EMAIL channel', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, channel: 'SMS' });
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });

  it('the unsupported transport fails permanently and explicitly', async () => {
    const transport = new UnsupportedChannelTransport('SMS');
    const result = await transport.send({ ...message, channel: 'SMS' });
    expect(result).toEqual({
      status: 'PERMANENT_FAILURE',
      error: 'channel SMS has no production transport',
    });
  });
});
