// BeautIzzy — BeautIzzy Plus Phase 6.5A: the RevenueCat webhook Edge Function
//
// RevenueCat POSTs every subscription event here (docs/architecture/
// SUBSCRIPTIONS.md). One invocation records one event in the server-side
// entitlement mirror (20261004120000_create_subscription_entitlements.sql) and,
// when the secret API key is configured, reconciles the subscriber's current
// state with RevenueCat's REST API afterwards.
//
// Authentication — RevenueCat is a THIRD-PARTY caller: it can send one
// configurable Authorization header and, optionally, an HMAC signature; it
// cannot send a Supabase API key. The function therefore authenticates the
// request ITSELF (core/webhook-auth.ts): the exact Authorization value held
// in REVENUECAT_WEBHOOK_AUTHORIZATION, compared in constant time, and the
// `X-RevenueCat-Webhook-Signature` HMAC when REVENUECAT_WEBHOOK_SIGNING_SECRET
// is set. `withSupabase({ auth: 'none' })` lets the request reach the handler
// and still hands over `ctx.supabaseAdmin`, the privileged server client that
// resolves to the Postgres service_role role — the only role holding EXECUTE
// on the subscription_* functions. Because the gateway cannot validate a
// RevenueCat header, THIS function is deployed with JWT verification OFF
// (`npx supabase functions deploy revenuecat-webhook --no-verify-jwt`) — the
// one deliberate exception to the worker's rule, documented in
// supabase/README.md. Nothing here is reachable without the shared secret.
//
// Configuration is read first: a deployment without the Authorization value
// answers 500 and reads nothing. Secrets live in Edge Function secrets only —
// never in the app bundle, Expo public env, SQLite or a public table — and
// are never logged; answers carry the event id, type, environment, outcome
// and counts only.

import { withSupabase } from 'npm:@supabase/server';
import { describeWebhookConfiguration, readWebhookConfiguration, WebhookConfigurationError } from './core/configuration.ts';
import { handleRevenueCatWebhook } from './core/handler.ts';
import { createSupabaseSubscriptionMirror } from './core/mirror.ts';
import { createRevenueCatSubscriberApi, createSubscriberReconciler } from './core/reconciliation.ts';

export default {
  fetch: withSupabase({ auth: 'none' }, async (request, ctx) => {
    let configuration;
    try {
      configuration = readWebhookConfiguration((name) => Deno.env.get(name));
    } catch (error) {
      if (error instanceof WebhookConfigurationError) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: false, error: 'configuration failed' }, { status: 500 });
    }

    const mirror = createSupabaseSubscriptionMirror(ctx.supabaseAdmin);
    const reconciler =
      configuration.secretApiKey === undefined
        ? undefined
        : createSubscriberReconciler({ api: createRevenueCatSubscriberApi({ apiKey: configuration.secretApiKey }), mirror });

    return handleRevenueCatWebhook(request, {
      authorization: configuration.authorization,
      signingSecret: configuration.signingSecret,
      allowedAppIds: configuration.allowedAppIds,
      mirror,
      reconciler,
      log: (entry) => {
        // Vocabularies and counts only; booleans say what THIS instance has configured.
        console.info(JSON.stringify({ ...entry, ...describeWebhookConfiguration(configuration) }));
      },
    });
  }),
};
