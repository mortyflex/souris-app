import { isLifecycleEventType, LIFECYCLE_EVENT_TYPES, parseRevenueCatWebhookBody, subscriberIdentifiers } from '../revenuecat-event';
import { lifecycleEvent, MONTH, T0, USER_A, USER_B } from '../testing/event-fixtures';

function parse(body: unknown) {
  const result = parseRevenueCatWebhookBody(body);
  if (!result.ok) throw new Error(result.reason);
  return result.event;
}

describe('RevenueCat webhook body parsing', () => {
  it('normalizes a lifecycle event and scrubs subscriber_attributes from the stored payload', () => {
    const body = lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', transaction_id: 1234567890 });
    const event = parse(body);
    expect(event).toMatchObject({
      type: 'INITIAL_PURCHASE',
      id: 'evt-1',
      appId: 'app1a2b3c4d',
      eventAtMs: T0,
      appUserId: USER_A,
      originalAppUserId: USER_A,
      aliases: [USER_A],
      productId: 'com.mortyflex.sourisapp.plus.monthly',
      newProductId: null,
      entitlementIds: ['plus'],
      periodType: 'NORMAL',
      store: 'APP_STORE',
      environment: 'PRODUCTION',
      purchasedAtMs: T0,
      expiresAtMs: T0 + MONTH,
      gracePeriodExpiresAtMs: null,
      transactionId: '1234567890',
      originalTransactionId: 'tx-original',
      cancelReason: null,
      expirationReason: null,
      isTrialConversion: false,
      transferredFrom: [],
      transferredTo: [],
    });
    expect(event.payload).not.toHaveProperty('subscriber_attributes');
    expect(event.payload).toMatchObject({ type: 'INITIAL_PURCHASE', price: 12.99 });
  });

  it('keeps null expiration (lifetime / promotional) and null entitlement_ids (unmapped product) as null', () => {
    const event = parse(lifecycleEvent('NON_RENEWING_PURCHASE', { expiration_at_ms: null, entitlement_ids: null }));
    expect(event.expiresAtMs).toBeNull();
    expect(event.entitlementIds).toBeNull();
  });

  it('accepts an event without environment, app_id or store (a promotional grant, a transfer)', () => {
    const event = parse(lifecycleEvent('TRANSFER', { environment: undefined, app_id: undefined, store: undefined, transferred_from: [USER_A], transferred_to: [USER_B] }));
    expect(event.environment).toBeNull();
    expect(event.appId).toBeNull();
    expect(event.store).toBeNull();
    expect(event.transferredFrom).toEqual([USER_A]);
    expect(event.transferredTo).toEqual([USER_B]);
  });

  it.each([
    ['not an object', 'body is not a JSON object'],
    [[], 'body is not a JSON object'],
    [{ api_version: '1.0' }, 'event is not a JSON object'],
    [{ event: 'x' }, 'event is not a JSON object'],
    [lifecycleEvent('INITIAL_PURCHASE', { type: '' }), 'event.type is missing or invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { type: 'drop table' }), 'event.type is not a RevenueCat event type'],
    [lifecycleEvent('INITIAL_PURCHASE', { id: null }), 'event.id is missing or invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { id: 'x'.repeat(201) }), 'event.id is missing or invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { event_timestamp_ms: '1700000000000' }), 'event.event_timestamp_ms is missing or invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { event_timestamp_ms: undefined }), 'event.event_timestamp_ms is missing or invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { environment: 'STAGING' }), 'event.environment is not PRODUCTION or SANDBOX'],
    [lifecycleEvent('INITIAL_PURCHASE', { environment: 'production' }), 'event.environment is not PRODUCTION or SANDBOX'],
    [lifecycleEvent('INITIAL_PURCHASE', { expiration_at_ms: 'tomorrow' }), 'event.expiration_at_ms is invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { expiration_at_ms: -1 }), 'event.expiration_at_ms is invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { aliases: 'not-a-list' }), 'event.aliases is invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { aliases: [1] }), 'event.aliases is invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { entitlement_ids: 'plus' }), 'event.entitlement_ids is invalid'],
    [lifecycleEvent('INITIAL_PURCHASE', { product_id: { id: 1 } }), 'event.product_id is invalid'],
  ])('refuses a malformed body %#: %s', (body, reason) => {
    expect(parseRevenueCatWebhookBody(body)).toEqual({ ok: false, reason });
  });

  it('lists the subscriber identifiers most stable first, without duplicates or blanks', () => {
    expect(subscriberIdentifiers({ originalAppUserId: 'orig', aliases: ['orig', 'alias-1', 'last'], appUserId: 'last' })).toEqual(['orig', 'alias-1', 'last']);
    expect(subscriberIdentifiers({ originalAppUserId: null, aliases: [], appUserId: 'only' })).toEqual(['only']);
    expect(subscriberIdentifiers({ originalAppUserId: null, aliases: [], appUserId: null })).toEqual([]);
  });

  it('knows exactly the lifecycle events this phase interprets', () => {
    expect([...LIFECYCLE_EVENT_TYPES]).toEqual([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'CANCELLATION',
      'UNCANCELLATION',
      'EXPIRATION',
      'BILLING_ISSUE',
      'PRODUCT_CHANGE',
      'SUBSCRIPTION_EXTENDED',
      'NON_RENEWING_PURCHASE',
    ]);
    expect(isLifecycleEventType('TRANSFER')).toBe(false);
    expect(isLifecycleEventType('TEST')).toBe(false);
    expect(isLifecycleEventType('SUBSCRIPTION_PAUSED')).toBe(false);
  });
});
