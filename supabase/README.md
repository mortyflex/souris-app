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

### Worker deployment and scheduling (NOT required in Lot A)

The scheduled worker is `supabase/functions/communications-worker` (fake transport only — it can
deliver nothing). Nothing needs to be deployed while nothing enqueues records. When Lot B needs
it running:

Authentication uses the CURRENT secret-key model (`sb_secret_…`, sent on the `apikey` header) —
NEVER the legacy `service_role` JWT key, which Supabase is deprecating. The Postgres
`service_role` ROLE keeps the EXECUTE grants (that is the database layer and is unchanged); the
secret key is only the HTTP credential that resolves to it.

1. Dashboard › Settings › API Keys: create a DEDICATED secret key named exactly
   `communications-worker`. The worker (`withSupabase({ auth: 'secret:communications-worker' })`)
   accepts only that named key and refuses publishable keys, user JWTs and unauthenticated
   calls. If one component ever leaks its key, only that key is rotated.
2. `npx supabase login` and `npx supabase link --project-ref <ref>` (writes `supabase/config.toml`;
   review before committing). In `supabase/config.toml`, disable JWT verification for this
   function — secret keys are not JWTs; the named-secret-key check replaces it:

   ```toml
   [functions.communications-worker]
   verify_jwt = false
   ```

   Then `npx supabase functions deploy communications-worker`. There is no provider secret to
   set in Lot A.
3. Enable the `pg_cron` and `pg_net` extensions (Dashboard › Database › Extensions). They cannot
   be enabled from a migration on every plan, and the cron job needs project-specific values, so
   this stays manual.
4. Store the `communications-worker` secret key in Vault and schedule the invocation
   (SQL Editor), about once per minute. Never inline the key in the cron command or a migration:

   ```sql
   select vault.create_secret('<the sb_secret_… communications-worker key>', 'communications_worker_secret_key');
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
Verify these instructions against the current Supabase docs when Lot B actually deploys — the
cron → Edge Function invocation pattern is the piece most likely to have evolved.
