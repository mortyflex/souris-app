// BeautIzzy — Plus reconciliation: the hardened RevenueCat REST client
//
// `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` — the same
// endpoint and the same answer the webhook's reconciliation reads
// (revenuecat-webhook/core/reconciliation.ts maps it), so one mapping serves
// both. Verified against the v1 reference (api-v1/customers):
//
//   - Bearer authentication with a SECRET key; the answer then also carries
//     `subscriber_attributes`, which nothing here reads or keeps;
//   - the endpoint GETS OR CREATES: 200 means the customer was found, 201
//     means it did not exist and was created — EMPTY — by this very read.
//     The client reports `created` so the caller never mistakes an account
//     RevenueCat had never seen for a verified absence of entitlement;
//   - `X-Platform` is NOT sent: it would rewrite the customer's `last_seen`,
//     and this is an informational read;
//   - rate limits: v1 answers 429 (RevenueCat's guidance for v1 is about one
//     request per second and a pause on 429; v2 documents `Retry-After`);
//     the client honours `Retry-After` when present, backs off otherwise,
//     and gives up after a bounded number of attempts.
//
// Failure classes, so the caller can tell a temporary failure from a
// configuration problem — and NEVER turn either into an expiration:
//
//   unauthorized   401 / 403: the key is wrong or lacks permission — stop the pass
//   rate_limited   429 after the bounded retries — stop the pass, retry later
//   unavailable    5xx after the bounded retries — this account is retried later
//   network        the request failed before any answer — retried later
//   timeout        no answer within the bound — retried later
//   malformed      a 2xx whose body is not JSON — nothing applied
//   rejected       another 4xx: the request itself is wrong for this account
//
// Messages carry the class and the status only: never the body (it describes
// the account), never the key.

import { REVENUECAT_API_BASE_URL } from '../../revenuecat-webhook/core/reconciliation.ts';

export type RevenueCatFailureKind =
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'malformed'
  | 'rejected';

export class RevenueCatApiError extends Error {
  readonly kind: RevenueCatFailureKind;
  readonly status: number | null;
  /** Requests actually sent for this read (retries included). */
  readonly attempts: number;

  constructor(kind: RevenueCatFailureKind, status: number | null, attempts: number) {
    super(status === null ? `revenuecat api ${kind}` : `revenuecat api ${kind} (${status})`);
    this.name = 'RevenueCatApiError';
    this.kind = kind;
    this.status = status;
    this.attempts = attempts;
  }
}

export interface SubscriberStateRead {
  /** True when RevenueCat held no customer for this id and created an empty one (201). */
  readonly created: boolean;
  /** The raw JSON answer, as the webhook's `mapSubscriberResponse` expects it. */
  readonly body: unknown;
  /** Requests actually sent for this read (retries included). */
  readonly attempts: number;
}

export interface SubscriberStateApi {
  fetchSubscriberState(appUserId: string): Promise<SubscriberStateRead>;
}

export interface RevenueCatSubscriberStateApiOptions {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  /** Per request; a request past it is aborted and counts as a timeout. */
  readonly timeoutMs?: number;
  /** Total attempts per read, retries included. */
  readonly maxAttempts?: number;
  /** The first wait before a retry; doubled at each retry. */
  readonly backoffMs?: number;
  /** The longest wait before a retry, `Retry-After` included. */
  readonly maxBackoffMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = 1_000;
export const DEFAULT_MAX_BACKOFF_MS = 10_000;

const RETRYABLE: ReadonlySet<RevenueCatFailureKind> = new Set(['rate_limited', 'unavailable', 'network', 'timeout']);

function classifyStatus(status: number): RevenueCatFailureKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'rejected';
}

/** `Retry-After` in seconds (the documented form); anything else reads as absent. */
export function retryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRevenueCatSubscriberStateApi({
  apiKey,
  fetchFn = fetch,
  baseUrl = REVENUECAT_API_BASE_URL,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  backoffMs = DEFAULT_BACKOFF_MS,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  sleep = defaultSleep,
}: RevenueCatSubscriberStateApiOptions): SubscriberStateApi {
  const attemptsBound = Math.max(1, Math.trunc(maxAttempts));
  const url = (appUserId: string) => `${baseUrl}/subscribers/${encodeURIComponent(appUserId)}`;

  async function attempt(
    appUserId: string,
    attempts: number,
  ): Promise<SubscriberStateRead | { failure: RevenueCatApiError; retryAfterMs: number | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(url(appUserId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return { failure: new RevenueCatApiError(controller.signal.aborted ? 'timeout' : 'network', null, attempts), retryAfterMs: null };
    }
    clearTimeout(timer);

    if (response.status === 200 || response.status === 201) {
      try {
        return { created: response.status === 201, body: await response.json(), attempts };
      } catch {
        return { failure: new RevenueCatApiError('malformed', response.status, attempts), retryAfterMs: null };
      }
    }
    // The body of a refusal may describe the account: it is never read.
    const kind = classifyStatus(response.status);
    return {
      failure: new RevenueCatApiError(kind, response.status, attempts),
      retryAfterMs: kind === 'rate_limited' ? retryAfterMs(response.headers.get('retry-after')) : null,
    };
  }

  return {
    async fetchSubscriberState(appUserId) {
      let wait = backoffMs;
      for (let attempts = 1; ; attempts += 1) {
        const outcome = await attempt(appUserId, attempts);
        if (!('failure' in outcome)) return outcome;
        const { failure } = outcome;
        if (!RETRYABLE.has(failure.kind) || attempts >= attemptsBound) throw failure;
        // Honour the server's wait when it gave one; otherwise double our own. Both are bounded.
        await sleep(Math.min(outcome.retryAfterMs ?? wait, maxBackoffMs));
        wait = Math.min(wait * 2, maxBackoffMs);
      }
    },
  };
}
