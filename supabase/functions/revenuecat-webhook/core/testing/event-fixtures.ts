// BeautIzzy — Plus entitlement mirror: RevenueCat event fixtures for tests
//
// Realistic webhook bodies (docs: event types and fields), built around fixed
// instants so every expectation is deterministic. The user ids are random
// uuids that exist in the fake mirror only.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS } from '../entitlement-snapshot.ts';

export const USER_A = '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60';
export const USER_B = '0a9b8c7d-6e5f-4a4b-9c3d-2e1f0a9b8c7d';
export const APP_ID = 'app1a2b3c4d';

export const T0 = Date.UTC(2026, 9, 1, 10, 0, 0); // 2026-10-01T10:00:00Z
export const DAY = 24 * 60 * 60 * 1000;
export const MONTH = 30 * DAY;

export interface EventOverrides {
  readonly [key: string]: unknown;
}

let sequence = 0;

/** A lifecycle event body for USER_A on the monthly App Store product, PRODUCTION. */
export function lifecycleEvent(type: string, overrides: EventOverrides = {}): Record<string, unknown> {
  sequence += 1;
  return {
    api_version: '1.0',
    event: {
      type,
      id: `evt-${type.toLowerCase()}-${sequence}`,
      app_id: APP_ID,
      event_timestamp_ms: T0,
      app_user_id: USER_A,
      original_app_user_id: USER_A,
      aliases: [USER_A],
      product_id: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY,
      entitlement_ids: ['plus'],
      period_type: 'NORMAL',
      purchased_at_ms: T0,
      expiration_at_ms: T0 + MONTH,
      environment: 'PRODUCTION',
      store: 'APP_STORE',
      transaction_id: `tx-${sequence}`,
      original_transaction_id: 'tx-original',
      price: 12.99,
      currency: 'EUR',
      subscriber_attributes: { $email: { value: 'private@example.test', updated_at_ms: T0 } },
      ...overrides,
    },
  };
}

export function eventOf(body: Record<string, unknown>): Record<string, unknown> {
  return body.event as Record<string, unknown>;
}

export function resetEventSequence(): void {
  sequence = 0;
}
