// The hardened RevenueCat client: the exact request, the get-or-create
// semantics (200 found / 201 created), bounded retries with backoff and
// Retry-After, timeouts, failure classes, and privacy of every message.

import { REVENUECAT_API_BASE_URL } from '../../../revenuecat-webhook/core/reconciliation';
import {
  createRevenueCatSubscriberStateApi,
  DEFAULT_MAX_ATTEMPTS,
  retryAfterMs,
  RevenueCatApiError,
  type RevenueCatFailureKind,
} from '../revenuecat-api';

const API_KEY = 'sk_TESTKEYVALUE';
const USER = '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60';
const SECRET_BODY = JSON.stringify({ message: 'secret details about the account', subscriber: { subscriber_attributes: { $email: 'x' } } });

type Step = Response | Error | 'hang';

function fetchScript(steps: Step[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    const step = steps.shift();
    if (step === undefined) throw new Error('script exhausted');
    if (step === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    if (step instanceof Error) throw step;
    return step;
  }) as typeof fetch;
  return { fetchFn, requests };
}

const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

function sleeper() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

async function failure(promise: Promise<unknown>): Promise<RevenueCatApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RevenueCatApiError) return error;
    throw error;
  }
  throw new Error('expected a failure');
}

describe('RevenueCat subscriber state client', () => {
  it('GETs /v1/subscribers/{app_user_id} with the Bearer secret, JSON accepted, the id encoded, and NO X-Platform header', async () => {
    const { fetchFn, requests } = fetchScript([ok({ request_date_ms: 1 })]);
    const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} });
    await expect(api.fetchSubscriberState('$RCAnonymousID:a/b')).resolves.toEqual({ created: false, body: { request_date_ms: 1 }, attempts: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent('$RCAnonymousID:a/b')}`);
    expect(requests[0].init.method).toBe('GET');
    const headers = new Headers(requests[0].init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Platform')).toBeNull();
    expect(requests[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('scenario 12: a 201 means RevenueCat held no customer and created an empty one — reported as created, never as a state', async () => {
    const { fetchFn } = fetchScript([ok({ request_date_ms: 1, subscriber: { subscriptions: {} } }, 201)]);
    const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} });
    await expect(api.fetchSubscriberState(USER)).resolves.toMatchObject({ created: true, attempts: 1 });
  });

  it('scenario 15: a 429 is retried after Retry-After (seconds, bounded), then succeeds', async () => {
    const { fetchFn, requests } = fetchScript([new Response(SECRET_BODY, { status: 429, headers: { 'Retry-After': '2' } }), ok({ request_date_ms: 2 })]);
    const { waits, sleep } = sleeper();
    const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep });
    await expect(api.fetchSubscriberState(USER)).resolves.toEqual({ created: false, body: { request_date_ms: 2 }, attempts: 2 });
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it('scenario 15: a Retry-After beyond the cap waits the cap; a malformed one falls back to the backoff', async () => {
    const { fetchFn } = fetchScript([
      new Response('', { status: 429, headers: { 'Retry-After': '600' } }),
      new Response('', { status: 429, headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' } }),
      ok({}),
    ]);
    const { waits, sleep } = sleeper();
    const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep, backoffMs: 500, maxBackoffMs: 4000 });
    await expect(api.fetchSubscriberState(USER)).resolves.toMatchObject({ attempts: 3 });
    expect(waits).toEqual([4000, 1000]);
    expect(retryAfterMs('2')).toBe(2000);
    expect(retryAfterMs('1.5')).toBe(1500);
    expect(retryAfterMs('-1')).toBeNull();
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it('scenario 15: a persistent rate limit gives up after the bounded attempts as rate_limited — never more requests than the bound', async () => {
    const steps: Step[] = Array.from({ length: 10 }, () => new Response('', { status: 429 }));
    const { fetchFn, requests } = fetchScript(steps);
    const { waits, sleep } = sleeper();
    const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep });
    const error = await failure(api.fetchSubscriberState(USER));
    expect(error).toMatchObject({ kind: 'rate_limited', status: 429, attempts: DEFAULT_MAX_ATTEMPTS });
    expect(requests).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(waits).toEqual([1000, 2000]);
  });

  it('scenario 15: 5xx answers and network failures are retried with doubling backoff, then classified', async () => {
    const { fetchFn: unavailable } = fetchScript([new Response('', { status: 503 }), new Response('', { status: 502 }), new Response('', { status: 500 })]);
    const first = sleeper();
    expect(await failure(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn: unavailable, sleep: first.sleep }).fetchSubscriberState(USER))).toMatchObject({ kind: 'unavailable', status: 500, attempts: 3 });
    expect(first.waits).toEqual([1000, 2000]);

    const { fetchFn: network } = fetchScript([new TypeError('fetch failed'), new TypeError('fetch failed'), ok({ fine: true })]);
    const second = sleeper();
    await expect(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn: network, sleep: second.sleep }).fetchSubscriberState(USER)).resolves.toMatchObject({ body: { fine: true }, attempts: 3 });

    const { fetchFn: networkOnly } = fetchScript([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')]);
    expect(await failure(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn: networkOnly, sleep: async () => {} }).fetchSubscriberState(USER))).toMatchObject({ kind: 'network', status: null, attempts: 3 });
  });

  it('scenario 15: a request past the timeout is aborted and counts as a timeout (retried, then classified)', async () => {
    jest.useFakeTimers();
    try {
      const { fetchFn, requests } = fetchScript(['hang', 'hang']);
      const api = createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {}, timeoutMs: 50, maxAttempts: 2 });
      const pending = api.fetchSubscriberState(USER);
      const settled = failure(pending);
      await jest.advanceTimersByTimeAsync(60);
      await jest.advanceTimersByTimeAsync(60);
      expect(await settled).toMatchObject({ kind: 'timeout', status: null, attempts: 2 });
      expect(requests).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('scenario 15: 401 and 403 are unauthorized and never retried; another 4xx is rejected and never retried', async () => {
    for (const [status, kind] of [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [400, 'rejected'],
      [404, 'rejected'],
    ] as [number, RevenueCatFailureKind][]) {
      const { fetchFn, requests } = fetchScript([new Response(SECRET_BODY, { status }), ok({})]);
      const error = await failure(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} }).fetchSubscriberState(USER));
      expect(error).toMatchObject({ kind, status, attempts: 1 });
      expect(requests).toHaveLength(1);
    }
  });

  it('scenario 13: a 2xx whose body is not JSON is malformed and never retried', async () => {
    const { fetchFn, requests } = fetchScript([new Response('<html>not json</html>', { status: 200 }), ok({})]);
    const error = await failure(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} }).fetchSubscriberState(USER));
    expect(error).toMatchObject({ kind: 'malformed', status: 200, attempts: 1 });
    expect(requests).toHaveLength(1);
  });

  it('every failure message carries the class and the status only: never the key, never the body', async () => {
    const { fetchFn } = fetchScript([new Response(SECRET_BODY, { status: 429 }), new Response(SECRET_BODY, { status: 429 }), new Response(SECRET_BODY, { status: 429 })]);
    const error = await failure(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} }).fetchSubscriberState(USER));
    expect(error.message).toBe('revenuecat api rate_limited (429)');
    expect(error.message).not.toContain(API_KEY);
    expect(error.message).not.toContain('secret details');
    expect(JSON.stringify(error)).not.toContain(API_KEY);
  });

  it('never uses the global fetch when one is injected (no real RevenueCat call in this suite)', async () => {
    const globalFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('real network use');
    });
    try {
      const { fetchFn } = fetchScript([ok({})]);
      await expect(createRevenueCatSubscriberStateApi({ apiKey: API_KEY, fetchFn, sleep: async () => {} }).fetchSubscriberState(USER)).resolves.toBeDefined();
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalFetch.mockRestore();
    }
  });
});
