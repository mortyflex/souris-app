# BeautIzzy — Supabase

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
migrations/20261004120000_create_subscription_entitlements.sql (BeautIzzy Plus 6.5A — BY HAND, after the lifecycle
                                                                 SMS one; creates TWO new server-owned tables,
                                                                 subscription_entitlements (owner SELECT only) and
                                                                 subscription_events (zero policies), their triggers,
                                                                 the SECURITY DEFINER subscription_* functions
                                                                 (service_role-only EXECUTE) and ONE after-insert
                                                                 trigger on businesses. Touches NO sync RPC, NO
                                                                 communication object and NO row. Applying it alone
                                                                 mirrors nothing: the revenuecat-webhook function
                                                                 must be deployed and configured in RevenueCat.
                                                                 docs/architecture/SUBSCRIPTIONS.md)
migrations/20261005120000_add_communication_entitlement_enforcement.sql
                                                                (BeautIzzy Plus 6.5B — BY HAND, after the mirror
                                                                 one, and BEFORE the next communications-worker
                                                                 deployment (the worker now calls
                                                                 communications_authorize_dispatch); creates the
                                                                 server-owned server_feature_flags table with ONE
                                                                 DISABLED row, the communication entitlement rule,
                                                                 the suspension helper, the worker's pre-dispatch
                                                                 gate, the operator switch function (no EXECUTE
                                                                 grant), ONE after trigger on
                                                                 subscription_entitlements, and replaces the four
                                                                 reconciliation functions in place. Touches NO sync
                                                                 RPC and NO existing row; while the switch is
                                                                 disabled every Business behaves exactly as before.
                                                                 docs/architecture/COMMUNICATIONS.md §46)
migrations/20261006120000_add_business_mutation_entitlement_enforcement.sql
                                                                (BeautIzzy Plus 6.5C step 4 — BY HAND, after the
                                                                 6.5B one; inserts ONE more DISABLED row of
                                                                 server_feature_flags, creates the business-mutation
                                                                 rule business_mutation_is_entitled (granted to
                                                                 authenticated only), its flag reader and operator
                                                                 switch (no EXECUTE grant), and replaces
                                                                 sync_push_aggregate IN PLACE: under the switch an
                                                                 owner without verified production Plus access gets
                                                                 { "status": "ENTITLEMENT_REQUIRED" } and nothing is
                                                                 written. Touches NO policy, NO Storage object, NO
                                                                 communication object, NOT the pull RPC and NO row;
                                                                 while the switch is disabled every push behaves
                                                                 exactly as before. docs/architecture/CLOUD_SYNC.md §26)
migrations/20261007120000_complete_business_mutation_entitlement_enforcement.sql
                                                                (BeautIzzy Plus 6.5C step 5 — BY HAND, after step 4;
                                                                 replaces UNDER THEIR NAMES the INSERT / UPDATE policies
                                                                 of the eleven operational tables and the DELETE policies
                                                                 of the four child tables (ownership AND the step 4 rule),
                                                                 adds is_business_media_writable and replaces the
                                                                 business-media INSERT policy with it, and replaces the
                                                                 three communication preference RPCs in place (turning a
                                                                 switch ON needs Plus; OFF never). Inserts no flag, flips
                                                                 nothing, touches NO SELECT policy, NO grant, NO row;
                                                                 while the switch is disabled every write behaves exactly
                                                                 as before. docs/architecture/CLOUD_SYNC.md §26.2)
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

Optional footer branding — the footer reads « Envoyé avec [BeautIzzy symbol] »: the file to host is
`assets/brand/email/symbol-on-dark.png` (69×90, transparent: the email-specific BeautIzzy symbol
at 3× the 23×30 footer slot, readable on light and dark mail backgrounds; one image, no
light/dark swap; never the in-app `symbol.png`, never the wordmark). Email clients only load
public HTTPS assets (a bundled app asset, file path or data URI never renders), so upload that
exact file to the PUBLIC Supabase Storage bucket (`brand`), separate from the private
`business-media` one, under a NEW file name (mail clients cache the previous image by URL), and
point the variable at it:

```bash
npx supabase secrets set SOURIS_EMAIL_LOGO_URL=https://<ref>.supabase.co/storage/v1/object/public/brand/beautizzy-email-symbol.png
```

`SOURIS_EMAIL_LOGO_URL` is intentionally kept as the technical secret name; only its VALUE
changes, and it must point to the BeautIzzy email symbol. A value still pointing at a previous
image (the BeautIzzy mark, or the 360×138 BeautIzzy wordmark) would show that image, distorted, in
the 23×30 slot.

The URL must be plain `https://`; surrounding whitespace, a trailing newline or ONE layer of
surrounding quotes (a manual Dashboard paste artifact) are stripped, anything else is ignored.
Without a usable value (or if the image fails to load) the footer stays text-only and clean —
sending is never affected. Each worker run answers with `emailLogoConfigured: true|false` — a
boolean only, never the value — so a smoke call shows at once whether the RUNNING instance
reads a usable logo URL; `false` means the secret is absent from that instance's environment
(re-set it and redeploy/restart the function) or its value fails validation. The API key must never exist in Expo env, the app bundle, SQLite, public
database rows or source control. The From displays « <business name> via BeautIzzy »; replies go to
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
2. `npx supabase login` and `npx supabase link --project-ref <ref>`. Keep JWT verification
   ENABLED (the deploy default — no `supabase/config.toml` entry, never `--no-verify-jwt`): the
   gateway accepts the worker's `sb_secret_…` key on the `apikey` header in place of a JWT, and
   the named-secret-key check then narrows access to that one key. This is the configuration
   running in production (`verify_jwt: true`, scheduler calls answering 200).

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
 7. Deploy the worker (verify_jwt stays true) — deploying alone sends nothing without due records
 8. Enable pg_cron + pg_net (Dashboard › Extensions)
 9. Put the worker secret key in Vault and create the cron job (SQL above)
10. End-to-end test with a DEDICATED test Business and a test client email:
    enable reminders in its Settings, create an appointment > 24 h ahead,
    verify SCHEDULED in the status row, force one send (or wait), verify the email
11. Only then enable reminders for the real production Business (its Settings)
12. Ship / keep the app build that shows Rappels clientes
```

## Entitlement mirror (BeautIzzy Plus Phase 6.5A) — NOT deployed yet

`20261004120000_create_subscription_entitlements.sql` creates the server-side mirror of each
account's RevenueCat Plus entitlement — one row per granting PRODUCT (a paid subscription and a
promotional grant are two rows), effective access derived by `subscription_has_plus_access`
(`docs/architecture/SUBSCRIPTIONS.md`). Additive, creates
no row, safe to re-run. `SUBSCRIPTION_ENFORCEMENT` stays `disabled` in the app and nothing reads
the mirror yet. Suggested manual check in the SQL Editor after applying:

```sql
-- both tables: RLS on; ONE policy (owner SELECT on the snapshot); none on the history
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'subscription\_%';
select tablename, policyname, cmd, roles from pg_policies where tablename like 'subscription\_%';

-- API roles: authenticated SELECT on subscription_entitlements ONLY; service_role NOTHING direct
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'subscription\_%'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_name order by grantee, table_name;

-- the functions: SECURITY DEFINER for the five RPCs (read_mirror, write_snapshot, apply_revenuecat_event,
-- apply_reconciliation, has_plus_access), search_path pinned, service_role-only EXECUTE
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname like 'subscription\_%';

-- the binding trigger exists on businesses
select tgname from pg_trigger where tgrelid = 'public.businesses'::regclass and tgname = 'businesses_subscription_bind_after_insert';
```

Behavior checks as a signed-in owner: `select * from public.subscription_entitlements` returns
her rows only (empty until RevenueCat sends something); any `insert` / `update` / `delete` and
any `select` on `subscription_events` fail with `42501`; calling
`subscription_apply_revenuecat_event` or `subscription_has_plus_access` fails with `42501`. The
same checks (81, including the idempotent duplicate, the per-row `40001` guard with no history row
left behind, two concurrent sources as two rows — the Apple expiration leaving the complimentary
grant in force and the grant's revocation ending access only when no other source grants —,
Sandbox / Production separation and the production-only access rule (an active SANDBOX row and a
Test Store product labelled PRODUCTION grant nothing), the after-the-fact Business binding, the
per-product reconciliation's "confirmed later wins", the append-only history that still lets a
deleted user's FK set NULL, and the lockout of every direct access by `anon`, `authenticated` and
`service_role`) were executed against the full migration chain in an isolated in-process Postgres
when this migration was written.

### Webhook deployment (deliberate manual steps — none performed by the phase)

```text
1. Apply the migration above.
2. RevenueCat › Integrations › Webhooks › New: URL https://<ref>.supabase.co/functions/v1/revenuecat-webhook,
   Authorization header value = a long random value (≥ 32 chars, `Bearer <random>` recommended);
   optionally enable signing and keep the signing secret (shown once).
3. npx supabase secrets set REVENUECAT_WEBHOOK_AUTHORIZATION='<the exact header value>'
   npx supabase secrets set REVENUECAT_WEBHOOK_SIGNING_SECRET='<signing secret>'          (optional)
   npx supabase secrets set REVENUECAT_SECRET_API_KEY='<sk_… RevenueCat secret API key>'    (optional: enables the
                                                                                              REST reconciliation after each event)
   npx supabase secrets set REVENUECAT_ALLOWED_APP_IDS='<production app id>,<test store app id>' (recommended)
4. npx supabase functions deploy revenuecat-webhook --no-verify-jwt
   RevenueCat is a third-party caller that cannot send a Supabase API key: THIS function verifies
   the shared Authorization value (constant time) and the HMAC signature itself, so JWT
   verification is OFF for it — the one deliberate exception; communications-worker keeps it ON.
5. RevenueCat › the webhook › Send test event → 200, outcome IGNORED, one subscription_events row.
```

Secrets live in Edge Function secrets only — never in Expo env, the app bundle, SQLite, a public
row or source control. Answers and logs carry event ids, types, environments, outcomes and
configuration booleans only. Backfill of pre-existing accounts: `docs/architecture/SUBSCRIPTIONS.md`
§9 — validate it on a non-production project first; never run it against production as part of
this phase.

## Communication entitlement enforcement (BeautIzzy Plus Phase 6.5B) — NOT applied, switch DISABLED

`20261005120000_add_communication_entitlement_enforcement.sql` makes email and SMS communications a
Plus capability on the server, behind a SERVER-SIDE switch that ships DISABLED
(`docs/architecture/COMMUNICATIONS.md` §46). Additive, rewrites no row, safe to re-run (a re-run can
never flip the switch). Order: apply it BEFORE the next `communications-worker` deployment — the
worker's pre-dispatch check now calls `communications_authorize_dispatch`. The order is also
protected: the updated worker probes that function (nil UUID, side-effect free) BEFORE claiming
anything and refuses the whole pass (500, `compatibility: 'authorization-gate-unavailable'`) while it
is missing — nothing claimed, no attempt count moved, nothing sent, nothing able to expire into
FAILED. Suggested manual check in the SQL Editor after applying:

```sql
-- the switch: one row, disabled, never enabled; RLS on, zero policies, zero grants
select flag, enabled, enabled_at from public.server_feature_flags;
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'server_feature_flags';
select count(*) from pg_policies where tablename = 'server_feature_flags';                          -- 0
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'server_feature_flags'
   and grantee in ('anon', 'authenticated', 'service_role');                                       -- 0 rows
select public.communications_entitlement_enforcement_enabled();                                   -- false

-- the functions: search_path pinned, no API-role EXECUTE; service_role may call EXACTLY the gate and the
-- rule it asks — never the operator switch, suspend_pending, the flag reader or the trigger function
-- (every new function is revoked from PUBLIC, anon, authenticated and service_role; two grants exist)
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('communications_entitlement_enforcement_enabled', 'communications_is_entitled',
                     'communications_suspend_pending', 'communications_authorize_dispatch',
                     'communications_on_entitlement_change', 'communications_set_entitlement_enforcement');
-- expected: service_role_exec TRUE for communications_authorize_dispatch and communications_is_entitled ONLY,
-- authenticated_exec FALSE everywhere; proacl NOT NULL and without a "=X/" (PUBLIC) entry on all six:
select p.proname, p.proacl from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'communications\_%'
   and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X/');                                       -- 0 rows

-- the trigger on the mirror exists
select tgname from pg_trigger where tgrelid = 'public.subscription_entitlements'::regclass
   and tgname = 'subscription_entitlements_communications_reconcile';

-- while disabled: every Business is entitled, whatever its mirror says
select b.id, b.name, public.communications_is_entitled(b.id) from public.businesses b;             -- all true
```

Behavior checks as a signed-in owner: `select * from public.server_feature_flags`, any call of
`communications_set_entitlement_enforcement`, `communications_is_entitled`,
`communications_entitlement_enforcement_enabled` or `communications_authorize_dispatch` fail with
`42501`. As `service_role`, `communications_entitlement_enforcement_enabled()` and
`communications_suspend_pending(...)` fail with `42501` too. The same checks — plus the status grid (ACTIVE, TRIAL, CANCELLED_ACTIVE until its end,
BILLING_RETRY until its grace deadline, EXPIRED, dated and lifetime COMPLIMENTARY, no row, Sandbox-only,
a Test Store product labelled PRODUCTION, one second after an end), the disabled default for a
Business without any row, the idempotent re-run rewriting nothing, the enabling sweep (unentitled
Businesses suspended with the marker, entitled ones untouched, SENT history / preferences / consent
preserved), the scheduling boundaries (an unentitled Business schedules no reminder, no lifecycle SMS
and mints no rescheduled notice; the retry executor from CURRENT state), the worker gate (DISPATCH /
SUSPENDED cancelling in the same call / SKIPPED / ABSENT, a lapse by TIME without any event caught
before dispatch, the suspended record never claimable again, a late mark_sent recording reality), the
mirror trigger (a revocation suspending everything at once, a purchase re-deriving future reminders
with new keys but never the one whose H-24 passed, consumed lifecycle keys not replayed while new
facts schedule normally, Sandbox events changing nothing in either direction, an injected failure
leaving a durable BUSINESS retry job and the webhook write intact), the disable path restoring the
pre-enforcement state, the effective privileges (a grant-less role may execute none of the new
functions, every ACL is explicit without a PUBLIC entry, the replaced functions kept their original
privileges, the switch and the flag table share one owner — all under a WORST-CASE stub that grants
service_role EXECUTE on every new function by default), the nil-UUID probe touching zero rows, and
the lockout of every direct access — 144 checks — were executed against the full 20-migration chain
in an isolated in-process Postgres when this migration was written; the 6.5A mirror harness (81)
still passes with it appended.

### Enabling enforcement (deliberate manual step — NOT performed by the phase)

Preconditions: the 6.5A mirror is applied, the `revenuecat-webhook` is deployed and receiving
production events, every account that should keep communications has been backfilled
(`docs/architecture/SUBSCRIPTIONS.md` §10 — a Business whose owner has NO mirrored row reads as NOT
entitled under enforcement), and this migration plus the matching worker are deployed. Validate on
Staging (`iteufklnrsmazzvmzqxa`) first, never on production as part of this phase.

```sql
-- preview who would be suspended (read-only)
select b.id, b.name, public.subscription_has_plus_access(b.owner_user_id) as entitled,
       count(sc.*) filter (where sc.status in ('SCHEDULED', 'PROCESSING')) as pending
  from public.businesses b
  left join public.scheduled_communications sc on sc.business_id = b.id
 group by b.id, b.name, b.owner_user_id order by b.name;

-- flip + converge in ONE transaction (table owner only)
select public.communications_set_entitlement_enforcement(true);
--   → { "enabled": true, "businesses_suspended": n, "communications_suspended": m }

-- inspect suspensions (history is kept; nothing is deleted)
select business_id, kind, channel, count(*) from public.scheduled_communications
 where last_error = 'ENTITLEMENT_SUSPENDED' group by 1, 2, 3;

-- roll back: restores the pre-enforcement state (future reminders re-derived; suspended rows stay history)
select public.communications_set_entitlement_enforcement(false);
```

After enabling, the worker's smoke response carries a `suspended` count beside `sent` / `skipped`.

## Business mutation entitlement enforcement (BeautIzzy Plus Phase 6.5C, step 4) — NOT applied, switch DISABLED

`20261006120000_add_business_mutation_entitlement_enforcement.sql` lets the server refuse, behind
its OWN server-side switch that ships DISABLED, the business writes of an owner without a verified
production Plus entitlement — through `sync_push_aggregate` only (`docs/architecture/CLOUD_SYNC.md`
§26.1). Additive, rewrites no row, safe to re-run (a re-run can never flip the switch). No
deployment order to respect: the deployed app builds since Phase 6.5C step 3 parse the answer, and
the switch stays off until an operator flips it. BOUNDARY: the owner-only table policies, the
Storage policy and the communication preference RPCs are NOT gated by this migration (step 5).
Suggested manual check in the SQL Editor after applying:

```sql
-- the switch: one more row, disabled, never enabled; the communications row untouched
select flag, enabled, enabled_at from public.server_feature_flags order by flag;
select public.business_mutation_entitlement_enforcement_enabled();                               -- false

-- the functions: SECURITY DEFINER, search_path pinned; authenticated may execute EXACTLY the rule,
-- service_role none of the three; no "=X/" (PUBLIC) entry on any ACL
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'business\_mutation\_%';
select p.proname, p.proacl from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'business\_mutation\_%'
   and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X/');                                      -- 0 rows

-- the push RPC kept its shape and privileges, and asks the rule once
select p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       (length(p.prosrc) - length(replace(p.prosrc, 'business_mutation_is_entitled', ''))) / length('business_mutation_is_entitled') as rule_calls
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sync_push_aggregate';
-- expected: prosecdef false, authenticated_exec true, anon_exec false, rule_calls 1

-- while disabled: every owner may write her Business, whatever the mirror says
select b.id, b.name, public.business_mutation_is_entitled(b.id) from public.businesses b;         -- postgres: all FALSE (no JWT subject)
```

The last query answers FALSE for every row when run as `postgres` in the SQL Editor: the rule is
TRUE for the SIGNED-IN owner only, and the editor has no JWT subject. Behavior checks as a signed-in
owner: `select public.business_mutation_is_entitled('<her business id>')` is TRUE while the switch
is disabled, FALSE for any other Business id; `select * from public.server_feature_flags`, any call
of `business_mutation_set_entitlement_enforcement` or `business_mutation_entitlement_enforcement_enabled`
fail with `42501`; a push to another owner's Business is still `42501`. The same checks — plus the
status grid (ACTIVE, TRIAL, CANCELLED_ACTIVE until its end, BILLING_RETRY until its grace deadline,
EXPIRED, dated and lifetime COMPLIMENTARY, no row, Sandbox-only, a Test Store product labelled
PRODUCTION, one second after an end, no 72-hour grace), the disabled default for a Business without
any row, the idempotent re-run that flips nothing in either direction and rewrites no business,
mirror or queue row, the refusal performing zero writes for an UPSERT, a DELETE, an absent id and an
already tombstoned row, the untouched version / updated_at / tombstone bookkeeping, the exactly-once
retry after a webhook RENEWAL with the deployed replay and CONFLICT semantics, validation errors
(22023) preceding the rule, the pull and count RPCs unaffected for an unentitled owner, the
independence of the two switches, and the effective privileges (a grant-less role, anon,
authenticated and service_role lockout, explicit ACLs) — 87 checks in all — were executed against the
full 21-migration chain in an isolated in-process Postgres when this migration was written; the
6.5A (81) and 6.5B (144) harnesses still pass with it appended.

### Enabling enforcement (deliberate manual step — NOT performed by the phase)

Preconditions: the 6.5A mirror is applied, the `revenuecat-webhook` is deployed and receiving
production events, every paying or pilot account has been backfilled (`docs/architecture/SUBSCRIPTIONS.md`
§10 — a Business whose owner has NO mirrored row is REFUSED under enforcement), every device runs a
build of Phase 6.5C step 3 or later (an older build reads the answer as unknown and backs off, losing
nothing but staying silent about it), and step 5 has closed the bypass paths if the goal is protection
rather than a rehearsal. Validate on Staging (`iteufklnrsmazzvmzqxa`) first, never on production as
part of this phase.

```sql
-- preview who would be refused (read-only)
select b.id, b.name, public.subscription_has_plus_access(b.owner_user_id) as entitled
  from public.businesses b order by b.name;

-- flip (table owner only); the answer counts the Businesses without Plus right now
select public.business_mutation_set_entitlement_enforcement(true);
--   → { "enabled": true, "businesses_without_plus": n }

-- roll back: writes flow again for everyone; the devices resend what they kept
select public.business_mutation_set_entitlement_enforcement(false);
```

## Business mutation entitlement enforcement — step 5 (BeautIzzy Plus Phase 6.5C) — NOT applied, switch DISABLED

`20261007120000_complete_business_mutation_entitlement_enforcement.sql` completes, at the database,
what step 4 started at the push RPC: the row-level write policies of the eleven operational tables,
the business-media upload policy and the three communication preference RPCs reuse the SAME rule
(`docs/architecture/CLOUD_SYNC.md` §26.2, `docs/architecture/COMMUNICATIONS.md` §47). Additive,
rewrites no row, inserts no flag, flips nothing, safe to re-run (`drop policy if exists` on the named
policies, `create or replace`). Apply AFTER step 4 (the rule must exist). While the switch is
disabled every write behaves exactly as before, for every Business, including the accounts without
any mirrored row. Suggested manual check in the SQL Editor after applying:

```sql
-- every write policy of the eleven tables names BOTH predicates; SELECT policies name the owner only
select tablename, cmd, policyname,
       coalesce(qual, '') ~ 'is_business_owner' as using_owner,
       coalesce(qual, '') ~ 'business_mutation_is_entitled' as using_rule,
       coalesce(with_check, '') ~ 'business_mutation_is_entitled' as check_rule
  from pg_policies
 where schemaname = 'public' and tablename in ('clients','services','service_phases','appointments','appointment_items',
       'appointment_phases','products','sales','sale_items','calendar_blocks','appointment_deposits')
 order by tablename, cmd;
-- expected: SELECT using_owner t / using_rule f; INSERT check_rule t; UPDATE using_rule f / check_rule t;
--           DELETE (children only) using_rule t; 3 policies per parent, 4 per child, none other

-- Storage: insert through the writable predicate; select / delete unchanged; no update policy
select cmd, policyname, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by cmd;

-- the helper and the three RPCs: privileges unchanged (authenticated only), search_path pinned
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('is_business_media_writable', 'communications_update_preferences',
                     'communications_update_sms_preferences', 'communications_update_lifecycle_sms_preferences');

-- both switches still disabled
select flag, enabled from public.server_feature_flags order by flag;
```

Behavior checks as a signed-in owner while the switch is disabled: a direct `insert` / `update` on
her own rows succeeds exactly as before, a write to another Business is still `42501` (insert /
update) or `0 rows` (delete), an upload into her own folder succeeds, `select
public.communications_update_preferences(<her id>, true, '<valid email>')` answers `UPDATED`. The
same checks — plus the status grid through direct writes, the push RPC and the three preference
RPCs (ACTIVE, TRIAL, CANCELLED_ACTIVE before / after its end, BILLING_RETRY within / past its grace,
EXPIRED, COMPLIMENTARY, no row, Sandbox-only, Test Store), every table and child table under refusal
with the whole world byte-identical afterwards, cross-Business and tenant-escape attempts, the
OR-bypass test, Storage insert / replacement / read / remove / cross-folder / non-UUID / other
bucket, the preference gates (enable refused, disable and keep-on allowed, validation answers
unchanged, consent and history untouched), the pull and the step 4 push refusal, the independence of
the two switches, the idempotent re-run, and the effective privileges — 378 checks in all — were
executed against the full 22-migration chain in an isolated in-process Postgres when this migration
was written; the step 4 (87), 6.5A (81) and 6.5B (144) harnesses still pass with it appended.

### What the harness cannot prove — Staging checklist (required before any production activation)

PGlite runs the policies on a STUB of `storage.objects` and has no PostgREST: the following are
rehearsed on Staging (`iteufklnrsmazzvmzqxa`), with the step 4 and step 5 migrations applied and a
dedicated test account whose mirror row is controlled through the webhook or the reconciliation:

```text
 1. switch OFF: a device build of step 3 or later syncs normally (push, pull, photo upload, preference
    enable / disable) — nothing differs from before the two migrations;
 2. switch ON, account entitled (ACTIVE / TRIAL / COMPLIMENTARY): same as 1;
 3. switch ON, account NOT entitled (no row, EXPIRED): a local change is refused by the push RPC
    (ENTITLEMENT_REQUIRED), stays pending with the hold, and the device keeps PULLING what another
    device changed; the Plus badge / status reflect the verification; the read-only UX of Phase 5 is
    inert (client enforcement still disabled);
 4. switch ON, NOT entitled: a client / product photo upload is refused by Storage, the media gateway
    reports the failure and the previous photo is kept; reading and listing existing photos still
    works; removing a photo still works;
 5. switch ON, NOT entitled: turning email reminders or a lifecycle automation ON from the settings
    screens is refused (the deployed build shows a generic failure, nothing changes); turning OFF
    works; editing the Reply-To of an already-ON preference works;
 6. switch ON, NOT entitled: a direct PostgREST write with the account's own token (curl / the
    Supabase JS client) is refused — insert / update → 42501 (HTTP 403), child delete → 0 rows;
 7. the account regains Plus (a Sandbox purchase on Staging counts as PRODUCTION only if the mirror
    says so — use a promotional grant or a reconciliation write): the device resumes the held writes
    once, in order, and photo uploads / preference enables work again;
 8. switch OFF again: everything returns to 1 with no manual cleanup.
```

Production activation remains FORBIDDEN until `docs/architecture/SUBSCRIPTIONS.md` §12 holds in
full: webhook live, every paying and pilot account backfilled, this checklist run on Staging, every
device on step 3 or later, the rollback rehearsed.
