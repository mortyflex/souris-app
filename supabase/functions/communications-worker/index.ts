// Souris — Communication Core: the scheduled worker Edge Function (Lot B)
//
// Invoked by the scheduler (pg_cron + pg_net, about once per minute — see
// docs/architecture/COMMUNICATIONS.md §7). One invocation runs one worker
// pass: claim due records, dispatch, settle. Dueness, leases and retry
// instants use DATABASE time only; this function trusts no other clock.
//
// Authentication — the current Supabase secret-key model, not the legacy
// service_role JWT: `withSupabase` accepts ONLY the dedicated server-side
// secret key named `communications_worker` (an `sb_secret_…` key created in
// the Dashboard, sent on the `apikey` header). Publishable keys, user JWTs
// and unauthenticated calls are refused by the wrapper before this handler
// runs. `verify_jwt` must be disabled for this function (secret keys are not
// JWTs); the secret-key check replaces it. `ctx.supabaseAdmin` is the
// privileged server client — it still resolves to the Postgres service_role
// role, which is the only role holding EXECUTE on the communications_* RPCs.
//
// Pass order: failed trigger reconciliations are re-run FIRST (durable
// retry jobs — docs/architecture/COMMUNICATIONS.md §14b), then due records
// are claimed and sent. EMAIL is real (Resend); SMS remains unsupported and
// fails permanently — the reusable SMS transport is deliberately unbound
// until the client-lifecycle SMS phase. The registry is built BEFORE
// anything is claimed, so a deployment missing RESEND_API_KEY /
// RESEND_FROM_EMAIL answers 500 and touches no record. Provider secrets
// live in Edge Function secrets only —
// never in the app bundle, Expo public env, SQLite or a public table — and
// are never logged; summaries carry counts only (payloads and recipients are
// business-private).

import { withSupabase } from 'npm:@supabase/server';
import {
  createProductionTransportRegistry,
  isEmailLogoConfigured,
  WorkerConfigurationError,
} from './core/production-transports.ts';
import {
  createSupabaseCommunicationQueue,
  createSupabaseReconciliationRetryQueue,
} from './core/supabase-queue.ts';
import { runCommunicationsWorker } from './core/worker.ts';

export default {
  fetch: withSupabase({ auth: 'secret:communications_worker' }, async (_request, ctx) => {
    try {
      // Configuration first: a misconfigured worker refuses the pass before
      // claiming, so no record is marked PROCESSING for nothing.
      const transports = createProductionTransportRegistry((name) => Deno.env.get(name));
      const queue = createSupabaseCommunicationQueue(ctx.supabaseAdmin);
      const reconciliation = createSupabaseReconciliationRetryQueue(ctx.supabaseAdmin);
      const summary = await runCommunicationsWorker({ queue, transports, reconciliation });
      // Counts and booleans only: payloads, recipients and secret VALUES are
      // never logged. `emailLogoConfigured` says whether SOURIS_EMAIL_LOGO_URL
      // is present and valid in THIS running instance. No SMS capability
      // indicator exists yet: production SMS is deliberately unbound until
      // the client-lifecycle SMS phase.
      return Response.json({
        ok: true,
        emailLogoConfigured: isEmailLogoConfigured((name) => Deno.env.get(name)),
        ...summary,
      });
    } catch (error) {
      if (error instanceof WorkerConfigurationError) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      const message = error instanceof Error ? error.message : 'worker pass failed';
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }),
};
