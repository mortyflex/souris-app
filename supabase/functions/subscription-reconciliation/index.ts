// BeautIzzy — BeautIzzy Plus Phase 6.5C, step 6: the subscription
// reconciliation Edge Function — the periodic sweep and the operator backfill
//
// One invocation = ONE bounded pass (docs/architecture/SUBSCRIPTIONS.md §13):
// the body names what to reconcile and whether to write, the database selects
// and leases the batch, every account is re-read from RevenueCat's REST API
// and applied through the SAME `subscription_apply_reconciliation` the
// webhook uses, and the answer reports what happened to each account — what
// WOULD happen, in DRY_RUN, which is the default when the body says nothing.
//
//   {}                                                   dry-run sweep of the mirrored accounts
//   { "kind": "SWEEP", "mode": "APPLY", "limit": 20,
//     "minAgeSeconds": 72000 }                           the scheduled sweep (one batch, least recently attempted first)
//   { "users": ["<uuid>"] }                              dry-run backfill of ONE account
//   { "users": ["<uuid>", …], "mode": "APPLY" }         backfill of an explicit list
//   { "source": "businesses", "kind": "BACKFILL",
//     "mode": "APPLY", "limit": 25, "after": "<uuid>" }  backfill of every Business owner, batch by batch
//
// Authentication — the current Supabase secret-key model, like the
// communications worker, not the legacy service_role JWT: `withSupabase`
// accepts ONLY the dedicated server-side secret key named
// `subscription_reconciliation` (an `sb_secret_…` key created in the
// Dashboard, sent on the `apikey` header). Publishable keys, user JWTs and
// unauthenticated calls are refused by the wrapper before this handler runs.
// `verify_jwt` stays ENABLED (the deploy default; never `--no-verify-jwt`).
// `ctx.supabaseAdmin` is the privileged server client — it resolves to the
// Postgres service_role role, the only role holding EXECUTE on the
// subscription_* and subscription_reconciliation_* functions. There is no
// public endpoint: an operator calls it with that key, or the pg_cron job an
// operator creates by hand does (supabase/README.md). Nothing schedules it.
//
// Configuration is read first: a deployment without the dedicated RevenueCat
// secret key answers 500 and claims nothing. The key lives in Edge Function
// secrets only — never in the app bundle, Expo public env, SQLite or a public
// table — and is never logged: the log line carries counts and vocabularies;
// the answer carries, per account, the Supabase user id, the outcome and the
// product states — never an email, a transaction, a price or a header.

import { withSupabase } from 'npm:@supabase/server';
import { createSupabaseSubscriptionMirror } from '../revenuecat-webhook/core/mirror.ts';
import { readReconciliationConfiguration, ReconciliationConfigurationError } from './core/configuration.ts';
import { createRevenueCatSubscriberStateApi } from './core/revenuecat-api.ts';
import { describePassForLog, parseRunRequest, runReconciliationPass, sanitizeFailure } from './core/run.ts';
import { createSupabasePlusAccessReader, createSupabaseReconciliationControl } from './core/supabase-control.ts';

/** A request names at most 50 user ids: anything far beyond is not one. */
const MAX_BODY_BYTES = 16 * 1024;

export default {
  fetch: withSupabase({ auth: 'secret:subscription_reconciliation' }, async (request, ctx) => {
    if (request.method !== 'POST') return Response.json({ ok: false, error: 'method not allowed' }, { status: 405 });

    let configuration;
    try {
      configuration = readReconciliationConfiguration((name) => Deno.env.get(name));
    } catch (error) {
      if (error instanceof ReconciliationConfigurationError) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: false, error: 'configuration failed' }, { status: 500 });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return Response.json({ ok: false, error: 'body too large' }, { status: 413 });
    let body: unknown = {};
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return Response.json({ ok: false, error: 'body is not JSON' }, { status: 400 });
      }
    }
    const parsed = parseRunRequest(body);
    if (!parsed.ok) return Response.json({ ok: false, error: parsed.reason }, { status: 400 });

    try {
      const summary = await runReconciliationPass(parsed.request, {
        control: createSupabaseReconciliationControl(ctx.supabaseAdmin),
        api: createRevenueCatSubscriberStateApi({ apiKey: configuration.apiKey }),
        mirror: createSupabaseSubscriptionMirror(ctx.supabaseAdmin),
        access: createSupabasePlusAccessReader(ctx.supabaseAdmin),
      });
      console.info(JSON.stringify(describePassForLog(summary)));
      return Response.json({ ok: true, ...summary });
    } catch (error) {
      // The batch could not be claimed or the run could not be closed: nothing to repair, invoke again.
      const message = sanitizeFailure(error);
      console.error(`[subscription-reconciliation] pass failed: ${message}`);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }),
};
