-- Souris — Communications: least-privilege cleanup of the worker tables
--
-- The production privilege check after 20260929120000 showed that
-- `service_role` ALSO holds TRUNCATE, REFERENCES and TRIGGER on both
-- communications tables. Audit result: these three PREDATE the corrective
-- migration — no repository migration ever granted them. They are the
-- residue of the project's default-privilege behavior at table creation
-- ("ALL minus DML" for service_role on new tables: exactly why the original
-- smoke test failed 42501 — the residue includes no SELECT — and exactly why
-- the current set equals that residue plus the 20260929 DML grants). No
-- worker function needs any of the three: nothing truncates, no service_role
-- foreign key or trigger is ever created at run time.
--
-- This migration revokes the residue and reasserts the audited narrow set,
-- so the FINAL explicit privileges are exactly:
--
--   public.scheduled_communications            service_role: SELECT, INSERT, UPDATE
--   public.communication_reconciliation_jobs   service_role: SELECT, UPDATE, DELETE
--
-- `anon` and `authenticated` keep ZERO privileges on both tables (unchanged;
-- RLS stays enabled with zero policies), no other table is touched, no
-- EXECUTE grant changes, no row is read or written, nothing is enqueued or
-- sent. Idempotent: safe to run on the current production database and safe
-- to re-run.

revoke truncate, references, trigger
  on table public.scheduled_communications
  from service_role;

revoke truncate, references, trigger
  on table public.communication_reconciliation_jobs
  from service_role;

-- Reasserted for clarity and for databases where 20260929120000 ran before
-- any residue existed: the exact audited worker surface, nothing more.
grant select, insert, update on table public.scheduled_communications to service_role;

grant select, update, delete on table public.communication_reconciliation_jobs to service_role;
