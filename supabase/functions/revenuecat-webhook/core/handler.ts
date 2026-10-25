// BeautIzzy — Plus entitlement mirror: the webhook request handler
//
// One delivery, in order: method and size → the shared Authorization value →
// the HMAC signature (when configured) → the body → the mirror reads of the
// event's environment → THE projection (project-event.ts) → ONE atomic
// database call (history + snapshots, idempotent on the event id) → the
// optional reconciliation → the answer.
//
// Answers, as RevenueCat reads them (anything but 200 is retried, up to five
// times over about 80 minutes):
//
//   200  recorded (APPLIED / STALE / IGNORED / UNMATCHED / UNSUPPORTED), or a DUPLICATE delivery
//   400  malformed body: retrying cannot help, and RevenueCat's own retries stop
//   401  the Authorization value or the signature does not match: refused before the body is read
//   405  not a POST
//   413  body over the limit
//   500  the mirror could not be written (a database failure, a concurrent delivery): retried in full
//
// Logs and answers carry the event id, its type, the environment and the
// outcome — counts and vocabularies, never an App User ID, a transaction, a
// price, a header or a secret.

import type { SubscriptionEnvironment } from './entitlement-snapshot.ts';
import type { SubscriptionEventRecord, SubscriptionMirror } from './mirror.ts';
import { projectRevenueCatEvent, type EventContext, type EventDecision } from './project-event.ts';
import type { ReconciliationOutcome, SubscriberReconciler } from './reconciliation.ts';
import { parseRevenueCatWebhookBody, subscriberIdentifiers, TRANSFER_EVENT_TYPE, type RevenueCatEvent } from './revenuecat-event.ts';
import { isAuthorizedRequest, REVENUECAT_SIGNATURE_HEADER, verifyRevenueCatSignature, type HmacSha256Hex } from './webhook-auth.ts';

/** RevenueCat events are a few kilobytes; anything far beyond is not one. */
export const MAX_BODY_BYTES = 256 * 1024;

export interface WebhookLogEntry {
  readonly eventId: string;
  readonly type: string;
  readonly environment: SubscriptionEnvironment | null;
  readonly outcome: string;
  readonly applied: number;
  readonly reconciliation: string;
}

export interface WebhookHandlerDependencies {
  readonly authorization: string;
  readonly signingSecret?: string;
  readonly allowedAppIds?: readonly string[];
  readonly mirror: SubscriptionMirror;
  /** Present when the secret API key is configured. */
  readonly reconciler?: SubscriberReconciler;
  readonly now?: () => number;
  readonly log?: (entry: WebhookLogEntry) => void;
  readonly hmac?: HmacSha256Hex;
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

async function readContext(
  event: RevenueCatEvent,
  mirror: SubscriptionMirror,
  allowedAppIds: readonly string[] | undefined,
): Promise<EventContext> {
  // Matching happens in the event's environment; PRODUCTION only serves the
  // user attribution of an event that names none (it is never applied).
  const environment = event.environment ?? 'PRODUCTION';
  if (event.type === TRANSFER_EVENT_TYPE) {
    const read = async (ids: readonly string[]) => (ids.length === 0 ? [] : [await mirror.readMirror(ids, environment)]);
    return {
      transferredFrom: await read(event.transferredFrom),
      transferredTo: await read(event.transferredTo),
      allowedAppIds,
    };
  }
  const identifiers = subscriberIdentifiers(event);
  return {
    subject: identifiers.length === 0 ? undefined : await mirror.readMirror(identifiers, environment),
    allowedAppIds,
  };
}

function toRecord(event: RevenueCatEvent, decision: EventDecision): SubscriptionEventRecord {
  return {
    eventId: event.id,
    eventType: event.type,
    appId: event.appId,
    environment: event.environment,
    store: event.store,
    appUserId: event.appUserId,
    originalAppUserId: event.originalAppUserId,
    aliases: event.aliases,
    userId: decision.userId,
    productId: event.productId,
    entitlementIds: event.entitlementIds,
    eventAtMs: event.eventAtMs,
    purchasedAtMs: event.purchasedAtMs,
    expiresAtMs: event.expiresAtMs,
    transactionId: event.transactionId,
    originalTransactionId: event.originalTransactionId,
    outcome: decision.outcome,
    outcomeDetail: decision.detail,
    payload: event.payload,
  };
}

function describeReconciliation(outcome: ReconciliationOutcome | undefined, configured: boolean): string {
  if (!configured) return 'not-configured';
  if (outcome === undefined) return 'skipped';
  return outcome.status;
}

export async function handleRevenueCatWebhook(request: Request, deps: WebhookHandlerDependencies): Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

  if (!isAuthorizedRequest(request.headers.get('authorization'), deps.authorization)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'body too large' });

  if (deps.signingSecret !== undefined) {
    const verification = await verifyRevenueCatSignature({
      header: request.headers.get(REVENUECAT_SIGNATURE_HEADER),
      rawBody,
      secret: deps.signingSecret,
      nowMs: now(),
      hmac: deps.hmac,
    });
    if (verification !== 'valid') return json(401, { ok: false, error: `signature ${verification}` });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: 'body is not JSON' });
  }
  const parsed = parseRevenueCatWebhookBody(body);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.reason });
  const { event } = parsed;

  let decision: EventDecision;
  let applied: { status: string; applied?: number };
  try {
    decision = projectRevenueCatEvent(event, await readContext(event, deps.mirror, deps.allowedAppIds));
    applied = await deps.mirror.applyEvent(toRecord(event, decision), decision.writes);
  } catch (error) {
    // The message names a function or a guard, never a payload or a key.
    console.error(`[revenuecat-webhook] mirror write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return json(500, { ok: false, error: 'mirror write failed' });
  }

  const outcome = applied.status;
  let reconciliation: ReconciliationOutcome | undefined;
  if (deps.reconciler !== undefined && outcome !== 'DUPLICATE' && decision.reconcile.length > 0) {
    reconciliation = await deps.reconciler.reconcile(decision.reconcile);
  }
  const reconciliationStatus = describeReconciliation(reconciliation, deps.reconciler !== undefined);

  deps.log?.({
    eventId: event.id,
    type: event.type,
    environment: event.environment,
    outcome,
    applied: applied.applied ?? 0,
    reconciliation: reconciliationStatus,
  });

  return json(200, {
    ok: true,
    eventId: event.id,
    type: event.type,
    environment: event.environment,
    outcome,
    applied: applied.applied ?? 0,
    reconciliation: reconciliationStatus,
  });
}
