# Souris — Supabase

Remote scope of Account & Onboarding V1: **Auth identity + one `businesses` table**. Nothing
operational (Clients, Appointments, Services, Products, Sales) is stored remotely yet.

## Applying the migration

The repository is not linked to a Supabase project (no `supabase/config.toml`, no project ref).
Apply `migrations/20260912120000_create_businesses.sql` with one of:

1. **Dashboard** — open the project › SQL Editor › paste the file › Run.
2. **CLI** — `npx supabase login`, `npx supabase link --project-ref <ref>`, then
   `npx supabase db push`. Linking writes `supabase/config.toml`; review it before committing.

The migration is idempotent only in the sense that it must run once; re-running it fails on
`create table` (by design — nothing is dropped).

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
