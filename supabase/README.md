# Souris — Supabase

Remote scope today: **Auth identity + `businesses`** (Account & Onboarding V1) and, since Cloud
Sync V1A, the **operational schema** (`clients`, `services`, `service_phases`, `appointments`,
`appointment_items`, `appointment_phases`, `products`, `sales`, `sale_items`). The operational
tables are schema only: no application code reads or writes them yet, nothing is uploaded or
restored. Contract: `docs/architecture/CLOUD_SYNC.md`.

## Applying the migrations

The repository is not linked to a Supabase project (no `supabase/config.toml`, no project ref).
Apply, in order:

```text
migrations/20260912120000_create_businesses.sql                 (already applied on the project)
migrations/20260914120000_create_operational_sync_schema.sql    (Cloud Sync V1A — not applied yet)
```

with one of:

1. **Dashboard** — open the project › SQL Editor › paste the file › Run.
2. **CLI** — `npx supabase login`, `npx supabase link --project-ref <ref>`, then
   `npx supabase db push`. Linking writes `supabase/config.toml`; review it before committing.

Each migration must run exactly once; re-running one fails on `create table` (by design — nothing
is dropped). The V1A migration requires `businesses` to exist and does not touch its rows; it only
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
