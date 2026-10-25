// BeautIzzy — Plus entitlement mirror: the RevenueCat webhook body — pure
//
// Parses and validates the POST body RevenueCat sends
// (`{ api_version, event: { … } }`, docs: integrations/webhooks/event-types-
// and-fields) into ONE normalized record the projection reads. Nothing here
// decides anything about access: it only refuses what is malformed and
// scrubs what the mirror never stores (`subscriber_attributes`, business-
// private data).
//
// Instants stay Unix milliseconds. Identifiers are strings; a numeric
// transaction id (seen on some stores) becomes its decimal text.

import type { SubscriptionEnvironment } from './entitlement-snapshot.ts';

export const TRANSFER_EVENT_TYPE = 'TRANSFER';
export const TEST_EVENT_TYPE = 'TEST';

/** The subscription lifecycle events this phase interprets. Anything else is recorded as UNSUPPORTED. */
export const LIFECYCLE_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'NON_RENEWING_PURCHASE',
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export function isLifecycleEventType(type: string): type is LifecycleEventType {
  return (LIFECYCLE_EVENT_TYPES as readonly string[]).includes(type);
}

export interface RevenueCatEvent {
  readonly type: string;
  readonly id: string;
  readonly appId: string | null;
  readonly eventAtMs: number;
  readonly appUserId: string | null;
  readonly originalAppUserId: string | null;
  readonly aliases: readonly string[];
  readonly productId: string | null;
  readonly newProductId: string | null;
  /** null when RevenueCat sent none or the product maps to no entitlement. */
  readonly entitlementIds: readonly string[] | null;
  readonly periodType: string | null;
  readonly store: string | null;
  readonly environment: SubscriptionEnvironment | null;
  readonly purchasedAtMs: number | null;
  readonly expiresAtMs: number | null;
  readonly gracePeriodExpiresAtMs: number | null;
  readonly transactionId: string | null;
  readonly originalTransactionId: string | null;
  readonly cancelReason: string | null;
  readonly expirationReason: string | null;
  readonly isTrialConversion: boolean;
  readonly transferredFrom: readonly string[];
  readonly transferredTo: readonly string[];
  /** The `event` object as received, minus `subscriber_attributes`. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export type RevenueCatEventParseResult =
  | { readonly ok: true; readonly event: RevenueCatEvent }
  | { readonly ok: false; readonly reason: string };

const MAX_ID_LENGTH = 200;
const MAX_TYPE_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, max = MAX_ID_LENGTH): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0) return null;
  return text.length <= max ? text : undefined;
}

function optionalMs(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

function textList(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return undefined;
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return undefined;
    const text = item.trim();
    if (text.length === 0 || text.length > MAX_ID_LENGTH) return undefined;
    list.push(text);
  }
  return list;
}

/** The identifiers to match a subscriber with, most stable first, without duplicates. */
export function subscriberIdentifiers(event: Pick<RevenueCatEvent, 'originalAppUserId' | 'aliases' | 'appUserId'>): readonly string[] {
  const ordered = [event.originalAppUserId, ...event.aliases, event.appUserId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return [...new Set(ordered)];
}

export function parseRevenueCatWebhookBody(body: unknown): RevenueCatEventParseResult {
  if (!isRecord(body)) return { ok: false, reason: 'body is not a JSON object' };
  const raw = body.event;
  if (!isRecord(raw)) return { ok: false, reason: 'event is not a JSON object' };

  const type = optionalText(raw.type, MAX_TYPE_LENGTH);
  if (type === undefined || type === null) return { ok: false, reason: 'event.type is missing or invalid' };
  if (!/^[A-Z][A-Z0-9_]*$/.test(type)) return { ok: false, reason: 'event.type is not a RevenueCat event type' };

  const id = optionalText(raw.id);
  if (id === undefined || id === null) return { ok: false, reason: 'event.id is missing or invalid' };

  const eventAtMs = optionalMs(raw.event_timestamp_ms);
  if (eventAtMs === undefined || eventAtMs === null || eventAtMs === 0) {
    return { ok: false, reason: 'event.event_timestamp_ms is missing or invalid' };
  }

  let environment: SubscriptionEnvironment | null = null;
  if (raw.environment !== undefined && raw.environment !== null) {
    if (raw.environment !== 'PRODUCTION' && raw.environment !== 'SANDBOX') {
      return { ok: false, reason: 'event.environment is not PRODUCTION or SANDBOX' };
    }
    environment = raw.environment;
  }

  const appId = optionalText(raw.app_id);
  const appUserId = optionalText(raw.app_user_id);
  const originalAppUserId = optionalText(raw.original_app_user_id);
  const aliases = textList(raw.aliases);
  const productId = optionalText(raw.product_id);
  const newProductId = optionalText(raw.new_product_id);
  const periodType = optionalText(raw.period_type, MAX_TYPE_LENGTH);
  const store = optionalText(raw.store, MAX_TYPE_LENGTH);
  const purchasedAtMs = optionalMs(raw.purchased_at_ms);
  const expiresAtMs = optionalMs(raw.expiration_at_ms);
  const gracePeriodExpiresAtMs = optionalMs(raw.grace_period_expiration_at_ms);
  const transactionId = optionalText(raw.transaction_id);
  const originalTransactionId = optionalText(raw.original_transaction_id);
  const cancelReason = optionalText(raw.cancel_reason, MAX_TYPE_LENGTH);
  const expirationReason = optionalText(raw.expiration_reason, MAX_TYPE_LENGTH);
  const transferredFrom = textList(raw.transferred_from);
  const transferredTo = textList(raw.transferred_to);

  for (const [name, value] of Object.entries({
    app_id: appId,
    app_user_id: appUserId,
    original_app_user_id: originalAppUserId,
    aliases,
    product_id: productId,
    new_product_id: newProductId,
    period_type: periodType,
    store,
    purchased_at_ms: purchasedAtMs,
    expiration_at_ms: expiresAtMs,
    grace_period_expiration_at_ms: gracePeriodExpiresAtMs,
    transaction_id: transactionId,
    original_transaction_id: originalTransactionId,
    cancel_reason: cancelReason,
    expiration_reason: expirationReason,
    transferred_from: transferredFrom,
    transferred_to: transferredTo,
  })) {
    if (value === undefined) return { ok: false, reason: `event.${name} is invalid` };
  }

  let entitlementIds: readonly string[] | null = null;
  if (raw.entitlement_ids !== undefined && raw.entitlement_ids !== null) {
    const list = textList(raw.entitlement_ids);
    if (list === undefined) return { ok: false, reason: 'event.entitlement_ids is invalid' };
    entitlementIds = list;
  }

  const { subscriber_attributes: _attributes, ...payload } = raw;

  return {
    ok: true,
    event: {
      type,
      id,
      appId: appId ?? null,
      eventAtMs,
      appUserId: appUserId ?? null,
      originalAppUserId: originalAppUserId ?? null,
      aliases: aliases ?? [],
      productId: productId ?? null,
      newProductId: newProductId ?? null,
      entitlementIds,
      periodType: periodType ?? null,
      store: store ?? null,
      environment,
      purchasedAtMs: purchasedAtMs ?? null,
      expiresAtMs: expiresAtMs ?? null,
      gracePeriodExpiresAtMs: gracePeriodExpiresAtMs ?? null,
      transactionId: transactionId ?? null,
      originalTransactionId: originalTransactionId ?? null,
      cancelReason: cancelReason ?? null,
      expirationReason: expirationReason ?? null,
      isTrialConversion: raw.is_trial_conversion === true,
      transferredFrom: transferredFrom ?? [],
      transferredTo: transferredTo ?? [],
      payload,
    },
  };
}
