# Souris — Supabase

Remote scope today: **Auth identity + `businesses`** (Account & Onboarding V1), the **operational
schema** of Cloud Sync V1A (`clients`, `services`, `service_phases`, `appointments`,
`appointment_items`, `appointment_phases`, `products`, `sales`, `sale_items`, `calendar_blocks`
for personal unavailability — CLOUD_SYNC.md §20 — and `appointment_deposits` — CLOUD_SYNC.md §21), since Cloud Sync
V1C the two **push functions** the mobile app uploads through (`sync_push_aggregate`,
`sync_count_business_aggregates`) and, since Cloud Sync V1D, the **pull function** it restores and
downloads through (`sync_pull_business_aggregates`, plus its formatting helper `sync_instant_text`).
The app never reads or writes an operational table directly. Contract:
`docs/architecture/CLOUD_SYNC.md` (§15 for V1C, §16 for V1D).

## Applying the migrations

Naming rule for NEW migrations: use a timestamp strictly greater than the highest existing
migration timestamp in the repository, regardless of the current wall-clock date. Filename order
is dependency order, and this holds even if an older migration was accidentally future-dated.

The repository is not linked to a Supabase project (no `supabase/config.toml`, no project ref).
Apply, in order:

```text
migrations/20260912120000_create_businesses.sql                 (already applied on the project)
migrations/20260914120000_create_operational_sync_schema.sql    (Cloud Sync V1A)
migrations/20260917120000_create_sync_push_functions.sql        (Cloud Sync V1C — must be applied BY HAND;
                                                                 nothing applies it automatically)
migrations/20260917200000_create_sync_pull_function.sql         (Cloud Sync V1D — must be applied BY HAND,
                                                                 after the V1C one)
migrations/20260921120000_add_client_notes.sql                  (Client notes — BY HAND; replaces both sync
                                                                 RPCs in place, CLOUD_SYNC.md §18)
migrations/20260922120000_add_appointment_discount.sql          (Appointment discount — BY HAND, after the
                                                                 notes one; replaces both sync RPCs in place,
                                                                 CLOUD_SYNC.md §19. Apply BEFORE shipping the
                                                                 build that writes discounts)
migrations/20260923120000_create_calendar_blocks.sql            (Calendar Blocks — BY HAND, after the discount
                                                                 one; creates ONE new table with its RLS, trigger
                                                                 and grants, and replaces the three sync RPCs in
                                                                 place, CLOUD_SYNC.md §20. Apply BEFORE shipping
                                                                 the build that writes Calendar Blocks)
migrations/20260924120000_create_appointment_deposits.sql       (Appointment deposits — BY HAND, after the
                                                                 Calendar Blocks one; creates ONE new table with
                                                                 its RLS, trigger, grants and a composite FK to
                                                                 appointments, three read-only helper functions,
                                                                 and replaces the three sync RPCs in place —
                                                                 the push one also enforces the deposit
                                                                 invariant, CLOUD_SYNC.md §21 / §21.2. Apply
                                                                 BEFORE shipping the build that records deposits)
migrations/20260925120000_add_client_photos.sql                 (Client photos — BY HAND, after the deposits
                                                                 one; adds clients.photo_path, creates the
                                                                 private `business-media` Storage bucket, its
                                                                 owner-only storage.objects policies and the
                                                                 is_business_media_owner helper, and replaces
                                                                 the two Client-listing sync RPCs in place,
                                                                 CLOUD_SYNC.md §22. Apply BEFORE shipping the
                                                                 build that sets Client photos)
migrations/20260926120000_add_product_photos.sql                (Product photos — BY HAND, after the Client
                                                                 photos one; adds products.photo_path, lets the
                                                                 EXISTING business-media bucket accept image/png
                                                                 (no new bucket, no policy change), and replaces
                                                                 the two Product-listing sync RPCs in place,
                                                                 CLOUD_SYNC.md §23. Apply BEFORE shipping the
                                                                 build that sets Product photos)
migrations/20260926130000_create_communication_core.sql         (Communication Core Lot A — BY HAND, after the
                                                                 Product photos one; creates ONE new server-owned
                                                                 table, scheduled_communications (RLS on, ZERO
                                                                 policies, NO anon/authenticated grant), its
                                                                 lifecycle trigger and the eight service_role-only
                                                                 communications_* functions. Touches NO existing
                                                                 object and NO sync RPC; nothing enqueues records
                                                                 yet, so there is no shipping deadline. SQL Editor
                                                                 application is sufficient; no extension needed.
                                                                 docs/architecture/COMMUNICATIONS.md)
migrations/20260927120000_add_appointment_email_reminders.sql   (Appointment email reminders Lot B — BY HAND,
                                                                 after the Lot A one; adds the nullable
                                                                 appointments.client_reminder_enabled, creates
                                                                 business_communication_preferences (OFF by
                                                                 default, RLS on, ZERO policies, no table grant)
                                                                 with three owner RPCs, the server-side
                                                                 reconciliation triggers into the Lot A queue,
                                                                 and replaces the two sync RPCs in place.
                                                                 Applying it alone sends NOTHING: no Business is
                                                                 opted in and reconciliation exits while the
                                                                 preference is off. Apply BEFORE shipping the
                                                                 build that shows the reminder settings.
                                                                 docs/architecture/COMMUNICATIONS.md §Lot B)
migrations/20260928120000_add_communication_reconciliation_retry.sql
                                                                (Lot B hardening — BY HAND, after the Lot B one;
                                                                 creates the server-only
                                                                 communication_reconciliation_jobs table (RLS on,
                                                                 ZERO policies, no table grant), replaces the four
                                                                 reconciliation trigger functions in place so a
                                                                 swallowed failure records a durable retry, adds
                                                                 the service_role-only claim/run/settle RPCs, and
                                                                 adds the temporal guards on post-send emails.
                                                                 Touches NO sync RPC and NO app surface; applying
                                                                 it alone sends and enqueues NOTHING.
                                                                 docs/architecture/COMMUNICATIONS.md §14b, §16)
migrations/20260929120000_grant_worker_table_privileges.sql     (Worker table privileges — BY HAND, after the
                                                                 hardening one; REQUIRED BEFORE the worker can
                                                                 run: the communications_* functions are SECURITY
                                                                 INVOKER and service_role holds no implicit
                                                                 privileges on their tables, so the first smoke
                                                                 test failed with 42501. Grants ONLY
                                                                 select/insert/update on scheduled_communications
                                                                 and select/update/delete on
                                                                 communication_reconciliation_jobs to
                                                                 service_role. No policy, no anon/authenticated
                                                                 change, no row touched; idempotent)
migrations/20260930120000_revoke_worker_extra_privileges.sql    (Least-privilege cleanup — BY HAND, after the
                                                                 grants one; revokes the platform residue
                                                                 (TRUNCATE, REFERENCES, TRIGGER) service_role
                                                                 held on the two communications tables since
                                                                 their creation, and reasserts the exact narrow
                                                                 worker set. No policy, no anon/authenticated
                                                                 change, no row touched; idempotent)
migrations/20261001120000_add_sms_reminder_architecture.sql     (SMS reminder architecture C1 — ALREADY APPLIED;
                                                                 superseded by the retirement below, kept as the
                                                                 historical record)
migrations/20261002120000_retire_appointment_sms.sql            (SMS pivot Phase 1 — ALREADY APPLIED; appointment
                                                                 reminders are EMAIL-only, the channel
                                                                 infrastructure and phone rules remain)
migrations/20261003120000_add_client_lifecycle_sms.sql          (Client lifecycle SMS Phase 2 — BY HAND, after the
                                                                 retirement one; adds the three clients consent
                                                                 columns (NULL = UNKNOWN, nothing backfilled),
                                                                 the CLIENT_BIRTHDAY_OFFER kind, the
                                                                 business_lifecycle_sms_preferences table (both
                                                                 automations OFF, RLS on, ZERO policies, no
                                                                 grant) with two owner RPCs, the daily lifecycle
                                                                 reconciliation functions, the trigger
                                                                 cancellations, and replaces the two sync RPCs
                                                                 in place. Applying it alone enables ZERO
                                                                 automations, changes ZERO consent and enqueues
                                                                 ZERO rows. Apply BEFORE shipping the build that
                                                                 writes the consent — against the previous
                                                                 functions a pushed consent would be silently
                                                                 dropped. docs/architecture/COMMUNICATIONS.md
                                                                 §34–§44)
```

The two `add_*` migrations are additive and safe to re-run (`add column if not exists`, `create or replace`);
they rewrite no row. `create_calendar_blocks` and `create_appointment_deposits` are additive and safe to re-run as well (`create table if not
exists`, `drop … if exists` on the NEW table's own trigger and policies only, `create or replace`): it touches
no existing table, row, policy or grant. Until it is applied, a build that knows Calendar Blocks keeps
working: a block push is refused (`22023`) and stays queued on the device, and every other aggregate
syncs normally. The same holds for `create_appointment_deposits`: until it is applied, a deposit push is
refused (`22023`) and stays queued; nothing is lost, but deposits reach neither the cloud nor another
device.

Check the dashboard (Database › Migrations, or the presence of the tables / functions) before
running a file: this list does not track what the project already has. Until the V1C migration is
applied the app keeps working locally; every sync run stops at its first request (`PGRST202`) and
all pending data stays queued on the device. Until the V1D migration is applied the V1C push keeps
working; the pull that follows it and any approved restore fail harmlessly (`PGRST202` → `UNKNOWN`):
nothing is written locally, a restore approval stays pending, and both succeed at the first run after
the migration is applied.

with one of:

1. **Dashboard** — open the project › SQL Editor › paste the file › Run.
2. **CLI** — `npx supabase login`, `npx supabase link --project-ref <ref>`, then
   `npx supabase db push`. Linking writes `supabase/config.toml`; review it before committing.

Each migration must run exactly once; re-running one fails on `create table` / `create function`
(by design — nothing is dropped). The V1C migration only creates two functions and their grants: it
touches no table, no row, no policy. The V1D migration likewise only creates two read-only functions
and their grants. The V1A migration requires `businesses` to exist and does not touch its rows; it only
revokes the default `delete / truncate / references / trigger` privileges `authenticated` still
held on `businesses`.

## Verifying ownership semantics

With RLS enabled and the policies above:

- an `anon` request (publishable key, no session) sees zero rows;
- an `authenticated` user reads / inserts / updates only rows where `owner_user_id = auth.uid()`;
- the `before update` trigger pins `owner_user_id` and `created_at`, so a client cannot reassign
  a Business;
- `owner_user_id` is `UNIQUE`: a second insert for the same owner fails with `23505`, which the app
  turns into "look up the existing Business and bind it locally".

Suggested manual check in the SQL Editor after applying:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'businesses';
select policyname, cmd, roles from pg_policies where tablename = 'businesses';
```

## Auth settings to review (Dashboard › Authentication)

- Email provider enabled (email + password sign-in).
- Decide whether **Confirm email** stays enabled. The app handles both: with confirmation on, the
  sign-up flow shows "Vérifiez votre boîte mail" and the owner signs in after clicking the link
  (the link opens in the browser; no deep link into the app is required for V1).
- No OAuth / magic link / SMS providers are used.

## Verifying the operational schema (Cloud Sync V1A)

After applying `20260914120000_create_operational_sync_schema.sql`, in the SQL Editor:

```sql
-- every public table has RLS on
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;

-- 3 policies on each aggregate table, 4 on each child table, all `{authenticated}`
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename, cmd;

-- anon holds nothing; authenticated holds select/insert/update (+ delete on children only)
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name order by grantee, table_name;
```

Behavior checks, as the signed-in owner (Dashboard › SQL Editor › "Run as role" or through the
API with a user session), using your Business id:

- inserting a row with another Business id fails with `42501`;
- updating `business_id` to another value leaves the row where it was (pinned by trigger);
- an update that changes nothing keeps `sync_version`; a real change increments it and refreshes
  `updated_at` regardless of the values sent;
- inserting or deleting a `service_phases` row increments the parent `services.sync_version`;
- setting `deleted_at` keeps the row selectable; `delete from public.clients …` fails with `42501`;
- with the publishable key and no session, every operational select fails with `42501`.

The same checks were executed against both migrations in an isolated in-process Postgres when
this migration was written (see `docs/architecture/CLOUD_SYNC.md` §13).

## Verifying the push functions (Cloud Sync V1C)

After applying `20260917120000_create_sync_push_functions.sql`, in the SQL Editor:

```sql
-- both functions: SECURITY INVOKER (prosecdef = false), search_path pinned, no anon execute
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('sync_push_aggregate', 'sync_count_business_aggregates');
```

Behavior checks as the signed-in owner, with your Business id (use a throwaway aggregate id):

- `select public.sync_count_business_aggregates('<business id>')` returns the row count; with another
  Business id it fails with `42501`;
- a first `sync_push_aggregate(…, 'CLIENT', 'check-1', 'UPSERT', null, '{"first_name":"Test"}')` returns
  `APPLIED` / `sync_version` 1; the identical call again returns the same version; the same call
  with another `first_name` and `p_expected_version` = null returns `CONFLICT` and changes nothing;
- `…, 'DELETE', 1, null` tombstones the row (`deleted_at` set, row still selectable); a DELETE of an
  id that never existed returns `ABSENT` and creates nothing;
- a SERVICE payload with two phases at the same `position` fails with `23505` and leaves NO
  `services` row behind.

The same checks (45, including cross-Business refusals and child-set atomicity) were executed
against the three migrations in an isolated in-process Postgres when this migration was written
(`docs/architecture/CLOUD_SYNC.md` §15.6).

## Verifying the pull function (Cloud Sync V1D)

After applying `20260917200000_create_sync_pull_function.sql`, in the SQL Editor:

```sql
-- both functions: SECURITY INVOKER (prosecdef = false), STABLE (provolatile = 's'), search_path pinned,
-- no anon execute
select p.proname, p.prosecdef, p.provolatile, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('sync_pull_business_aggregates', 'sync_instant_text');
```

Behavior checks as the signed-in owner, with your Business id:

- `select public.sync_pull_business_aggregates('<business id>', null)` returns `pulled_at` and the five
  families with every aggregate, tombstones included (`deleted_at` set, no children), each Service with
  its `phases`, each Appointment with its `items` (and their `phases`), each Sale with its `items`;
  instants look like `2026-09-11T09:15:00.000Z`; cents are integers; there is no image column;
- the same call with another Business id fails with `42501` — never an empty answer;
- with `p_since` = the `pulled_at` just returned, the answer is five empty arrays; after editing ONE
  phase of a Service through `sync_push_aggregate`, the same call returns that Service only;
- calling it changes no `sync_version` (it is read-only).

The same checks (41, including cross-Business refusals, the round trip of every pushed payload and
tombstones) were executed against the four migrations in an isolated in-process Postgres when this
migration was written (`docs/architecture/CLOUD_SYNC.md` §16.9).

## Communication Core (Lot A)

`20260926130000_create_communication_core.sql` creates the server-owned communications queue
(`docs/architecture/COMMUNICATIONS.md`). It is additive, touches no existing object, and is safe
to re-run. The mobile app has NO access to the queue (RLS enabled, zero policies, zero grants to
`anon` / `authenticated`); only `service_role` operates it, through the `communications_*`
functions. Nothing enqueues records in Lot A, so applying the migration changes nothing visible.

Suggested manual check in the SQL Editor after applying:

```sql
-- RLS on, zero policies, no anon/authenticated privilege
select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'scheduled_communications';
select count(*) from pg_policies where tablename = 'scheduled_communications';
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'scheduled_communications' and grantee in ('anon', 'authenticated');

-- the eight functions: SECURITY INVOKER, search_path pinned, service_role-only EXECUTE
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname like 'communications\_%';
```

## Appointment email reminders (Lot B)

`20260927120000_add_appointment_email_reminders.sql` builds the appointment integration on the
Lot A queue (`docs/architecture/COMMUNICATIONS.md`). Production safety of the migration alone:
`business_communication_preferences` starts EMPTY and defaults OFF, no row is rewritten, no
`sync_version` moves, and reconciliation exits immediately while the preference is off — zero
records are enqueued by applying it.

Suggested manual check in the SQL Editor after applying:

```sql
-- the preference table: RLS on, zero policies, no anon/authenticated privilege, zero rows
select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'business_communication_preferences';
select count(*) from pg_policies where tablename = 'business_communication_preferences';
select count(*) from public.business_communication_preferences;

-- nothing was enqueued by the migration
select count(*) from public.scheduled_communications;

-- the three owner RPCs exist and authenticated may execute them
select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('communications_read_preferences', 'communications_update_preferences',
                    'communications_appointment_reminder_status');
```

### Reconciliation retry (Lot B hardening)

`20260928120000_add_communication_reconciliation_retry.sql` makes a failed trigger
reconciliation durable: the domain write still succeeds, a coalesced retry job is recorded, and
the SAME worker re-runs the authoritative reconciliation on its next pass (before sending). No
new cron, function or secret is needed. Suggested check after applying:

```sql
-- the retry table: RLS on, zero policies, no anon/authenticated privilege, zero rows
select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'communication_reconciliation_jobs';
select count(*) from pg_policies where tablename = 'communication_reconciliation_jobs';
select count(*) from public.communication_reconciliation_jobs;

-- the retry RPCs: service_role only
select p.proname,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('communications_run_reconciliation', 'communications_claim_reconciliation_jobs',
                    'communications_complete_reconciliation_job', 'communications_fail_reconciliation_job');
```

After applying `20260929120000_grant_worker_table_privileges.sql` AND
`20260930120000_revoke_worker_extra_privileges.sql`, verify the worker's grants (the project's
default-privilege behavior leaves a TRUNCATE/REFERENCES/TRIGGER residue on new tables, which
the cleanup migration revokes):

```sql
-- exactly: scheduled_communications INSERT,SELECT,UPDATE — communication_reconciliation_jobs DELETE,SELECT,UPDATE
select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'service_role'
  and table_name in ('scheduled_communications', 'communication_reconciliation_jobs')
group by table_name order by table_name;
-- and still nothing for the API roles
select count(*) from information_schema.role_table_grants
 where grantee in ('anon', 'authenticated')
   and table_name in ('scheduled_communications', 'communication_reconciliation_jobs');
```

In production, a non-empty `communication_reconciliation_jobs` with `next_attempt_at =
'infinity'` is the durable trace of a reconciliation that kept failing (the worker parked it);
it revives automatically at the next change of the same appointment/Business, and its
`last_error` (sanitized) says why.

### Resend secrets (Lot B — required before the worker can send)

The EMAIL transport is Resend. Its configuration lives ONLY in Edge Function secrets:

```bash
npx supabase secrets set RESEND_API_KEY=<the Resend API key>
npx supabase secrets set RESEND_FROM_EMAIL=<the verified sender, e.g. rappels@votre-domaine.fr>
```

The sender domain must be added and VERIFIED in the Resend dashboard first (SPF + DKIM). The
worker refuses the pass (HTTP 500, nothing claimed) while either secret is missing or the sender
is not a valid address.

Optional footer branding — the footer reads « Envoyé avec [Souris wordmark] »: the visual
source of truth is `assets/brand/logo-wordmark.png` (the EMAIL footer never uses the small
`logo-mark.png`). Email clients only load public HTTPS assets (a bundled app asset, file path
or data URI never renders), so upload a public PNG copy of that exact wordmark (intrinsic
2172×724 = 3:1 — e.g. a 240×80 export for crisp 2× rendering at the 120×40 footer slot; the
full-resolution export also works, just heavier) to the PUBLIC Supabase Storage bucket
(`brand`), separate from the private `business-media` one, and point the SAME variable at it:

```bash
npx supabase secrets set SOURIS_EMAIL_LOGO_URL=https://<ref>.supabase.co/storage/v1/object/public/brand/logo-wordmark.png
```

The URL must be plain `https://`; surrounding whitespace, a trailing newline or ONE layer of
surrounding quotes (a manual Dashboard paste artifact) are stripped, anything else is ignored.
Without a usable value (or if the image fails to load) the footer stays text-only and clean —
sending is never affected. Each worker run answers with `emailLogoConfigured: true|false` — a
boolean only, never the value — so a smoke call shows at once whether the RUNNING instance
reads a usable logo URL; `false` means the secret is absent from that instance's environment
(re-set it and redeploy/restart the function) or its value fails validation. The API key must never exist in Expo env, the app bundle, SQLite, public
database rows or source control. The From displays « <business name> via Souris »; replies go to
the professional's configured Reply-To.

### Worker deployment and scheduling (required for Lot B sending)

The scheduled worker is `supabase/functions/communications-worker` (Lot B: real Resend EMAIL
transport; SMS fails permanently). To put it in service:

Authentication uses the CURRENT secret-key model (`sb_secret_…`, sent on the `apikey` header) —
NEVER the legacy `service_role` JWT key, which Supabase is deprecating. The Postgres
`service_role` ROLE keeps the EXECUTE grants (that is the database layer and is unchanged); the
secret key is only the HTTP credential that resolves to it.

1. Dashboard › Settings › API Keys: create a DEDICATED secret key named exactly
   `communications_worker` (named Secret Keys allow lowercase letters, digits and underscore
   only). The worker (`withSupabase({ auth: 'secret:communications_worker' })`)
   accepts only that named key and refuses publishable keys, user JWTs and unauthenticated
   calls. If one component ever leaks its key, only that key is rotated.
2. `npx supabase login` and `npx supabase link --project-ref <ref>` (writes `supabase/config.toml`;
   review before committing). In `supabase/config.toml`, disable JWT verification for this
   function — secret keys are not JWTs; the named-secret-key check replaces it:

   ```toml
   [functions.communications-worker]
   verify_jwt = false
   ```

   Then set the two Resend secrets (section above) and
   `npx supabase functions deploy communications-worker`.
3. Enable the `pg_cron` and `pg_net` extensions (Dashboard › Database › Extensions). They cannot
   be enabled from a migration on every plan, and the cron job needs project-specific values, so
   this stays manual.
4. Store the `communications_worker` secret key in Vault and schedule the invocation
   (SQL Editor), about once per minute. Never inline the key in the cron command or a migration:

   ```sql
   select vault.create_secret('<the sb_secret_… communications_worker key>', 'communications_worker_secret_key');
   select cron.schedule('communications-worker', '* * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/communications-worker',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'apikey', (select decrypted_secret from vault.decrypted_secrets
                     where name = 'communications_worker_secret_key')),
       body := '{}'::jsonb);
   $$);
   ```

The secret key must never exist in Expo env, the app bundle, SQLite, public database rows or
source control. A worker run answers with counts only
(`claimed / sent / retried / failed / skipped`); payloads and recipients are never logged.
Verify these instructions against the current Supabase docs when actually deploying — the
cron → Edge Function invocation pattern is the piece most likely to have evolved.

### Client lifecycle SMS (Phase 2) — Twilio secrets and the daily cron (NOT installed yet)

`20261003120000_add_client_lifecycle_sms.sql` prepares the engine; nothing sends until every
controlled step below is taken deliberately. The SMS transport binds ONLY when ALL THREE
Twilio values are valid — anything less keeps SMS unsupported (records fail permanently and
explicitly), and each worker run answers `smsConfigured: true|false` (a boolean only, never a
value):

```bash
npx supabase secrets set TWILIO_ACCOUNT_SID=<AC…>
npx supabase secrets set TWILIO_AUTH_TOKEN=<the auth token>
npx supabase secrets set TWILIO_FROM_NUMBER=<the E.164 sender, e.g. +33756000000>
```

The DAILY lifecycle reconciliation cron (separate from the per-minute worker cron) calls
`communications_reconcile_client_lifecycle_all()` as `service_role` at **08:30 UTC —
`30 8 * * *`** (09:30 Paris in winter, 10:30 in summer; the seasonal drift is accepted in V1).
It is deliberately NOT created by the migration. When the controlled deployment step comes
(pg_cron already enabled for the worker):

```sql
select cron.schedule('communications-client-lifecycle', '30 8 * * *', $$
  select public.communications_reconcile_client_lifecycle_all();
$$);
```

Controlled real-SMS test (developer test Business ONLY — the production Business keeps both
automations OFF and every real client stays UNKNOWN): one test client → OPTED_IN → the
developer's Twilio-verified phone → enable ONE automation on the test Business → force
eligibility → run the reconciliation (manually or via the cron) → the worker sends the real
SMS. Before ANY real client ever receives a lifecycle SMS, a production-appropriate opt-out
mechanism (STOP / unsubscribe) MUST ship first — COMMUNICATIONS.md §44.

### Complete Lot B production deployment order

Nothing below runs automatically; each step is deliberate, and real email becomes possible only
at step 9 — and only for a Business whose owner explicitly enabled reminders (step 11+):

```text
 1. Apply migrations/20260926130000_create_communication_core.sql        (Lot A — queue)
 2. Apply migrations/20260927120000_add_appointment_email_reminders.sql  (Lot B — sends nothing by itself)
 2b. Apply migrations/20260928120000_add_communication_reconciliation_retry.sql
                                                                         (Lot B hardening — sends nothing)
 2c. Apply migrations/20260929120000_grant_worker_table_privileges.sql   (worker table grants — required
                                                                          before any worker pass can run)
 2d. Apply migrations/20260930120000_revoke_worker_extra_privileges.sql  (least-privilege cleanup of the
                                                                          platform residue on those tables)
 3. Dashboard › API Keys: create the `communications_worker` secret key   (if not already created)
 4. Resend: create the account, add and VERIFY the sending domain (SPF + DKIM)
 5. npx supabase secrets set RESEND_API_KEY=…
 6. npx supabase secrets set RESEND_FROM_EMAIL=…
 7. Deploy the worker (verify_jwt = false) — deploying alone sends nothing without due records
 8. Enable pg_cron + pg_net (Dashboard › Extensions)
 9. Put the worker secret key in Vault and create the cron job (SQL above)
10. End-to-end test with a DEDICATED test Business and a test client email:
    enable reminders in its Settings, create an appointment > 24 h ahead,
    verify SCHEDULED in the status row, force one send (or wait), verify the email
11. Only then enable reminders for the real production Business (its Settings)
12. Ship / keep the app build that shows Rappels clientes
```
