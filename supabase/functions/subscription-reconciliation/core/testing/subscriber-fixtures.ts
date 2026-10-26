// BeautIzzy — Plus reconciliation: RevenueCat v1 subscriber answers for tests
//
// Realistic `GET /v1/subscribers/{id}` bodies (docs: api-v1/customer-info-model)
// built around fixed instants, and an in-memory SubscriberStateApi that
// answers from a script — no network, ever.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS } from '../../../revenuecat-webhook/core/entitlement-snapshot.ts';
import { DAY, MONTH, T0 } from '../../../revenuecat-webhook/core/testing/event-fixtures.ts';
import { RevenueCatApiError, type RevenueCatFailureKind, type SubscriberStateApi, type SubscriberStateRead } from '../revenuecat-api.ts';

export { DAY, MONTH, T0 };
export const REQUEST_DATE = T0 + 10 * DAY;
export const MONTHLY = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY;
export const ANNUAL = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL;
export const PROMO_LIFETIME = 'rc_promo_plus_lifetime';
export const PROMO_MONTHLY = 'rc_promo_plus_monthly';
export const TEST_PRODUCT = 'plus_monthly_test';

export const iso = (ms: number) => new Date(ms).toISOString();

export function subscriberBody(
  appUserId: string,
  subscriptions: Record<string, Record<string, unknown>>,
  options: { readonly summary?: Record<string, unknown>; readonly requestDateMs?: number; readonly originalAppUserId?: string } = {},
): Record<string, unknown> {
  const requestDateMs = options.requestDateMs ?? REQUEST_DATE;
  return {
    request_date: iso(requestDateMs),
    request_date_ms: requestDateMs,
    subscriber: {
      original_app_user_id: options.originalAppUserId ?? appUserId,
      first_seen: iso(T0),
      last_seen: iso(requestDateMs),
      management_url: null,
      entitlements: options.summary === undefined ? {} : { plus: options.summary },
      subscriptions,
      non_subscriptions: {},
      subscriber_attributes: { $email: { value: 'private@example.test', updated_at_ms: T0 } },
    },
  };
}

export const subscription = (overrides: Record<string, unknown> = {}) => ({
  expires_date: iso(T0 + MONTH),
  purchase_date: iso(T0),
  original_purchase_date: iso(T0),
  ownership_type: 'PURCHASED',
  period_type: 'normal',
  store: 'app_store',
  is_sandbox: false,
  unsubscribe_detected_at: null,
  billing_issues_detected_at: null,
  grace_period_expires_date: null,
  refunded_at: null,
  auto_resume_date: null,
  store_transaction_id: 700000123,
  ...overrides,
});

export const promotional = (overrides: Record<string, unknown> = {}) =>
  subscription({ expires_date: null, store: 'promotional', ownership_type: 'FAMILY_SHARED', store_transaction_id: 'abc123', period_type: 'promotional', ...overrides });

export const summaryOf = (productId: string, expiresDate: string | null = iso(T0 + MONTH)) => ({
  expires_date: expiresDate,
  grace_period_expires_date: null,
  product_identifier: productId,
  purchase_date: iso(T0),
});

/** What the fake API answers for one App User ID. */
export type ScriptedAnswer =
  | { readonly kind: 'found'; readonly body: unknown; readonly attempts?: number }
  | { readonly kind: 'created'; readonly attempts?: number }
  | { readonly kind: 'failure'; readonly failure: RevenueCatFailureKind; readonly status?: number | null; readonly attempts?: number }
  | { readonly kind: 'throw'; readonly error: Error };

export class FakeSubscriberStateApi implements SubscriberStateApi {
  readonly answers = new Map<string, ScriptedAnswer[]>();
  readonly calls: string[] = [];

  /** Queues answers for an id; the last one repeats once the queue is drained. */
  script(appUserId: string, ...answers: ScriptedAnswer[]): void {
    this.answers.set(appUserId, [...answers]);
  }

  async fetchSubscriberState(appUserId: string): Promise<SubscriberStateRead> {
    this.calls.push(appUserId);
    const queue = this.answers.get(appUserId);
    if (queue === undefined || queue.length === 0) throw new RevenueCatApiError('unavailable', 503, 1);
    const answer = queue.length > 1 ? queue.shift()! : queue[0];
    switch (answer.kind) {
      case 'found':
        return { created: false, body: answer.body, attempts: answer.attempts ?? 1 };
      case 'created':
        return { created: true, body: subscriberBody(appUserId, {}), attempts: answer.attempts ?? 1 };
      case 'failure':
        throw new RevenueCatApiError(answer.failure, answer.status ?? null, answer.attempts ?? 1);
      case 'throw':
        throw answer.error;
    }
  }
}
