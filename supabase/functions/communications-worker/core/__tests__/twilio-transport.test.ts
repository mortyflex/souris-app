// Souris — Communication Core (SMS pivot Phase 1): the Twilio SMS transport
//
// Reusable provider infrastructure, tested with a DETERMINISTIC FAKE
// renderer (no production SMS content exists in Phase 1). Every provider
// call is a mocked fetch: no test ever reaches api.twilio.com, and the
// suite locks in the request shape, the result mapping (SENT only with a
// valid Message SID), the HTTP-class retry classification and the privacy
// rules (no phone number, no body, no credential in any error).
// Credentials below are OBVIOUSLY fake.

import {
  isTwilioMessageSid,
  TwilioSmsTransport,
  type SmsContentRenderer,
} from '../twilio-transport';
import type { OutgoingCommunication } from '../transport';

const ACCOUNT_SID = 'AC-fake-account-sid';
const AUTH_TOKEN = 'fake-auth-token';
const FROM_NUMBER = '+15005550006';
const FAKE_SID = `SM${'0'.repeat(32)}`;
const FAKE_BODY = 'Bonjour de Souris (contenu de test).';

/** Deterministic test renderer: refuses one marker kind, renders the rest. */
const fakeRenderer: SmsContentRenderer = (communication) =>
  communication.kind === 'KIND_WITHOUT_CONTENT' ? undefined : FAKE_BODY;

const message: OutgoingCommunication = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  businessId: 'biz-1',
  kind: 'TEST_KIND',
  channel: 'SMS',
  recipient: '+33612345678',
  payload: {},
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

function createTransport(
  responses: readonly (Response | Error)[],
  renderBody: SmsContentRenderer = fakeRenderer,
) {
  const { fetchFn, requests } = createFetchMock(responses);
  const transport = new TwilioSmsTransport({
    accountSid: ACCOUNT_SID,
    authToken: AUTH_TOKEN,
    fromNumber: FROM_NUMBER,
    renderBody,
    fetchFn,
  });
  return { transport, requests };
}

describe('the Twilio request', () => {
  it('POSTs the classic Messages resource as a form with To, From, Body and Basic auth', async () => {
    const { transport, requests } = createTransport([json(201, { sid: FAKE_SID, status: 'queued' })]);

    const result = await transport.send(message);

    expect(result).toEqual({ status: 'SENT', providerMessageId: FAKE_SID });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
    expect(requests[0].init.method).toBe('POST');
    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Basic auth exists and decodes to the fake pair — the real value is
    // never snapshotted anywhere.
    expect(headers.Authorization?.startsWith('Basic ')).toBe(true);
    expect(atob(headers.Authorization.slice('Basic '.length))).toBe(
      `${ACCOUNT_SID}:${AUTH_TOKEN}`,
    );
    const form = new URLSearchParams(String(requests[0].init.body));
    expect(form.get('To')).toBe('+33612345678');
    expect(form.get('From')).toBe(FROM_NUMBER);
    expect(form.get('Body')).toBe(FAKE_BODY);
    expect([...form.keys()].sort()).toEqual(['Body', 'From', 'To']);
  });

  it('a `queued` Twilio status is a transport success (SENT = accepted, never delivered)', async () => {
    const { transport } = createTransport([json(201, { sid: FAKE_SID, status: 'queued' })]);
    const result = await transport.send(message);
    expect(result.status).toBe('SENT');
  });

  it('sends exactly what the injected renderer produced — the transport knows no content', async () => {
    const { transport, requests } = createTransport(
      [json(201, { sid: FAKE_SID })],
      () => 'Un autre contenu rendu.',
    );
    await transport.send(message);
    expect(new URLSearchParams(String(requests[0].init.body)).get('Body')).toBe(
      'Un autre contenu rendu.',
    );
  });
});

describe('response classification', () => {
  it.each([[429], [500], [502], [503]])('HTTP %i is retryable', async (status) => {
    const { transport } = createTransport([json(status, { code: 20429 })]);
    const result = await transport.send(message);
    expect(result.status).toBe('RETRYABLE_FAILURE');
  });

  it('a network exception is retryable', async () => {
    const { transport } = createTransport([new Error('socket closed')]);
    const result = await transport.send(message);
    expect(result).toEqual({ status: 'RETRYABLE_FAILURE', error: 'twilio: network failure' });
  });

  it.each([[400], [401], [403], [404]])('HTTP %i is permanent', async (status) => {
    const { transport } = createTransport([json(status, { code: 21608 })]);
    const result = await transport.send(message);
    expect(result.status).toBe('PERMANENT_FAILURE');
  });

  it('a permanent error carries only the HTTP status and the numeric Twilio code', async () => {
    const { transport } = createTransport([
      json(400, { code: 21608, message: 'The number +33612345678 is unverified', more_info: 'https://…' }),
    ]);
    const result = await transport.send(message);
    expect(result).toEqual({ status: 'PERMANENT_FAILURE', error: 'twilio: 400 (code 21608)' });
  });

  it('an HTTP success WITHOUT a valid Message SID is a safe protocol failure', async () => {
    const { transport } = createTransport([json(200, { status: 'queued' })]);
    const result = await transport.send(message);
    expect(result).toEqual({
      status: 'PERMANENT_FAILURE',
      error: 'twilio: accepted response without a usable message sid',
    });
  });

  it('never persists an arbitrary response value as the provider message id', async () => {
    const { transport } = createTransport([json(201, { sid: 'not-a-message-sid' })]);
    const result = await transport.send(message);
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect('providerMessageId' in result).toBe(false);
  });

  it('validates the Messages API SID shape', () => {
    expect(isTwilioMessageSid(FAKE_SID)).toBe(true);
    expect(isTwilioMessageSid(`SM${'f'.repeat(32)}`)).toBe(true);
    expect(isTwilioMessageSid(`SM${'0'.repeat(31)}`)).toBe(false);
    expect(isTwilioMessageSid(`MM${'0'.repeat(32)}`)).toBe(false);
    expect(isTwilioMessageSid(42)).toBe(false);
    expect(isTwilioMessageSid(undefined)).toBe(false);
  });
});

describe('input refusals (no provider call at all)', () => {
  it('refuses a non-SMS channel', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, channel: 'EMAIL' });
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });

  it('a renderer refusal is a permanent failure without any request', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, kind: 'KIND_WITHOUT_CONTENT' });
    expect(result).toEqual({
      status: 'PERMANENT_FAILURE',
      error: 'no sms content for this communication',
    });
    expect(requests).toHaveLength(0);
  });

  it('a blank rendered body is treated as a refusal', async () => {
    const { transport, requests } = createTransport([], () => '   ');
    const result = await transport.send(message);
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(requests).toHaveLength(0);
  });

  it('refuses a non-canonical recipient (the server owns normalization; nothing is re-normalized here)', async () => {
    const { transport, requests } = createTransport([]);
    const result = await transport.send({ ...message, recipient: '06 12 34 56 78' });
    expect(result).toEqual({
      status: 'PERMANENT_FAILURE',
      error: 'recipient is not a canonical sms destination',
    });
    expect(requests).toHaveLength(0);
  });
});

describe('privacy', () => {
  it('no error ever contains the recipient, the sender, the body or a credential', async () => {
    const outcomes = [];
    for (const responses of [
      [json(400, { code: 21608, message: `blocked ${message.recipient}` })],
      [json(401, { code: 20003 })],
      [json(500, {})],
      [json(200, { status: 'queued' })],
      [new Error(`ECONNRESET while posting to ${FROM_NUMBER}`)],
    ] as const) {
      const { transport } = createTransport(responses);
      outcomes.push(await transport.send(message));
    }
    const serialized = JSON.stringify(outcomes);
    expect(serialized).not.toContain('+33612345678');
    expect(serialized).not.toContain(FROM_NUMBER);
    expect(serialized).not.toContain(FAKE_BODY);
    expect(serialized).not.toContain(AUTH_TOKEN);
    expect(serialized).not.toContain(ACCOUNT_SID);
    expect(serialized).not.toMatch(/authorization|basic /i);
  });
});
