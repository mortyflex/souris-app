// Souris — Communication Core: the scheduled worker Edge Function (Lot A)
//
// Invoked by the scheduler (pg_cron + pg_net, about once per minute — see
// docs/architecture/COMMUNICATIONS.md §7). One invocation runs one worker
// pass: claim due records, dispatch, settle. Dueness, leases and retry
// instants use DATABASE time only; this function trusts no other clock.
//
// Authentication — the current Supabase secret-key model, not the legacy
// service_role JWT: `withSupabase` accepts ONLY the dedicated server-side
// secret key named `communications-worker` (an `sb_secret_…` key created in
// the Dashboard, sent on the `apikey` header). Publishable keys, user JWTs
// and unauthenticated calls are refused by the wrapper before this handler
// runs. `verify_jwt` must be disabled for this function (secret keys are not
// JWTs); the secret-key check replaces it. `ctx.supabaseAdmin` is the
// privileged server client — it still resolves to the Postgres service_role
// role, which is the only role holding EXECUTE on the communications_* RPCs.
//
// Lot A safety: the only transport wired here is the fake one. A deployed
// Lot A worker that finds a due record "sends" it nowhere — no network call,
// no provider SDK, no credential — marks it SENT with a fake:<id> provider
// message id, and answers with counts. Real email is Lot B, SMS is Lot C;
// their secrets will live in Edge Function secrets only (never in the app
// bundle, Expo public env, SQLite or a public table).

import { withSupabase } from 'npm:@supabase/server';
import { createFakeTransportRegistry } from './core/fake-transport.ts';
import { createSupabaseCommunicationQueue } from './core/supabase-queue.ts';
import { runCommunicationsWorker } from './core/worker.ts';

export default {
  fetch: withSupabase({ auth: 'secret:communications-worker' }, async (_request, ctx) => {
    const queue = createSupabaseCommunicationQueue(ctx.supabaseAdmin);
    const { registry } = createFakeTransportRegistry();

    try {
      const summary = await runCommunicationsWorker({ queue, transports: registry });
      // Counts only: payloads and recipients are business-private (never logged).
      return Response.json({ ok: true, ...summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'worker pass failed';
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }),
};
