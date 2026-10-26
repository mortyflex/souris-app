// BeautIzzy — Phase 6.5B stays bounded (source-level guard, like
// webhook-boundary.test.ts): the server-side switch is its own disabled row,
// never the app's build constant; the access rule is reused from 6.5A, never
// re-implemented; the worker holds no entitlement rule and binds the one new
// RPC; the migration is forward-only, additive, and rewrites no existing row
// at apply time; the operator switch is never granted to any role.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';

const WORKER_DIR = join(__dirname, '..', '..');
const SUPABASE_DIR = join(WORKER_DIR, '..', '..');
const MIGRATIONS_DIR = join(SUPABASE_DIR, 'migrations');
const MIGRATION_NAME = '20261005120000_add_communication_entitlement_enforcement.sql';
const MIRROR_MIGRATION_NAME = '20261004120000_create_subscription_entitlements.sql';

function listFiles(directory: string, accept: (name: string) => boolean): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) return name === '__tests__' ? [] : listFiles(path, accept);
    return accept(name) ? [path] : [];
  });
}

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');

/** The migration with every `$$ … $$` function body removed: its top-level statements only. */
function topLevelStatements(sql: string): string {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$');
}

describe('communications entitlement enforcement — Phase 6.5B boundary', () => {
  it('is a NEW forward-only migration sorting strictly after the 6.5A mirror, which is untouched', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    // Immediately after the mirror; later phases (6.5C step 4 onwards) sort after it and never touch it.
    expect(names.indexOf(MIGRATION_NAME)).toBe(names.indexOf(MIRROR_MIGRATION_NAME) + 1);
    expect(names.slice(names.indexOf(MIGRATION_NAME) + 1).every((name) => name > MIGRATION_NAME)).toBe(true);
    const mirror = readFileSync(join(MIGRATIONS_DIR, MIRROR_MIGRATION_NAME), 'utf8');
    expect(mirror).not.toMatch(/communications_/);
  });

  it('the server-side switch is a dedicated disabled row, and a re-run can never flip it', () => {
    expect(migration).toMatch(/create table if not exists public\.server_feature_flags/);
    expect(migration).toMatch(/'COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT',\s+false,/);
    expect(migration).toMatch(/on conflict \(flag\) do nothing;/);
    // A missing row reads as disabled.
    expect(migration).toMatch(/select coalesce\(\s*\(select f\.enabled from public\.server_feature_flags f\s+where f\.flag = 'COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT'\),\s*false\)/);
    // Nobody reads or writes the table directly — not even the server role.
    expect(migration).toMatch(/revoke all on table public\.server_feature_flags from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/alter table public\.server_feature_flags enable row level security;/);
    expect(migration).not.toMatch(/create policy[^;]*server_feature_flags/);
    expect(migration).not.toMatch(/grant [^;]*on table public\.server_feature_flags/);
  });

  it('the app build constant is never a server-side control: SUBSCRIPTION_ENFORCEMENT stays disabled and is named nowhere under supabase/', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const offenders = listFiles(SUPABASE_DIR, (name) => /\.(ts|sql|md)$/.test(name))
      .filter((path) => /SUBSCRIPTION_ENFORCEMENT/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SUPABASE_DIR.length + 1));
    // The 6.5A docs legitimately state that the app switch stays disabled; nothing executable names it.
    expect(offenders.filter((path) => !path.endsWith('.md') && !path.endsWith(MIRROR_MIGRATION_NAME))).toEqual([]);
  });

  it('reuses THE 6.5A access rule and never re-implements it, with no server-side offline grace', () => {
    expect(migration).toMatch(/public\.subscription_has_plus_access\(b\.owner_user_id, coalesce\(p_at, now\(\)\)\)/);
    expect(migration).toMatch(/public\.subscription_has_plus_access\(new\.user_id\)/);
    // No store list, no status comparison, no entitled_until arithmetic outside the mirror's own rule.
    expect(migration).not.toMatch(/'APP_STORE'|'PROMOTIONAL'|'TEST_STORE'/);
    expect(migration).not.toMatch(/status\s*<>\s*'EXPIRED'|entitled_until\s*[<>]/);
    expect(migration).not.toMatch(/from public\.subscription_entitlements/);
    expect(migration).not.toMatch(/interval '72 hours'|interval '3 days'/);
    // Unverified is never paid: a Business without a row reads false.
    expect(migration).toMatch(/where b\.id = p_business_id\),\s*false\)/);
  });

  it('touches no existing row at apply time: every UPDATE / DELETE lives inside a function body', () => {
    const top = topLevelStatements(migration);
    expect(top).not.toMatch(/^\s*update\s/im);
    expect(top).not.toMatch(/^\s*delete\s/im);
    expect(top).not.toMatch(/truncate|drop table|drop column|alter table public\.(scheduled_communications|businesses|clients|appointments|subscription_entitlements|subscription_events|business_communication_preferences|business_lifecycle_sms_preferences)\b/i);
    // The one INSERT is the disabled flag row.
    const inserts = [...top.matchAll(/^\s*insert into public\.(\w+)/gim)].map((match) => match[1]);
    expect(inserts).toEqual(['server_feature_flags']);
    // No sync RPC is replaced; the four reconciliation functions are replaced in place by name.
    expect(migration).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates/);
    for (const fn of ['communications_reconcile_appointment', 'communications_reconcile_appointment_events', 'communications_reconcile_business', 'communications_reconcile_client_lifecycle']) {
      expect(migration).toContain(`create or replace function public.${fn}(`);
    }
  });

  it('the security model: every new function revoked from the API roles, the operator switch granted to nobody, the worker RPC to service_role only', () => {
    const created = [...migration.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
    expect(new Set(created)).toEqual(new Set([
      'communications_entitlement_enforcement_enabled',
      'communications_is_entitled',
      'communications_suspend_pending',
      'communications_reconcile_appointment',
      'communications_reconcile_appointment_events',
      'communications_reconcile_business',
      'communications_reconcile_client_lifecycle',
      'communications_authorize_dispatch',
      'communications_on_entitlement_change',
      'communications_set_entitlement_enforcement',
    ]));
    for (const fn of [
      'communications_entitlement_enforcement_enabled',
      'communications_is_entitled',
      'communications_suspend_pending',
      'communications_authorize_dispatch',
      'communications_on_entitlement_change',
      'communications_set_entitlement_enforcement',
    ]) {
      // Every new function first loses PUBLIC's implicit EXECUTE AND any platform default for the API or server roles.
      expect(migration).toMatch(new RegExp(`^revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated, service_role;`, 'm'));
      const body = migration.slice(migration.indexOf(`create or replace function public.${fn}(`));
      expect({ fn, pinned: /^set search_path = ''$/m.test(body.slice(0, body.indexOf('as $$'))) }).toEqual({ fn, pinned: true });
    }
    // Exactly TWO grants exist, both to service_role: the worker gate and the rule it calls (the gate is SECURITY INVOKER).
    const grants = [...migration.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);/gm)].map((match) => [match[1], match[2]]);
    expect(grants).toEqual([
      ['communications_is_entitled', 'service_role'],
      ['communications_authorize_dispatch', 'service_role'],
    ]);
    expect(migration).not.toMatch(/^grant [^;]*to (anon|authenticated|public)/mi);
    // The worker RPC stays SECURITY INVOKER like every other worker RPC; the rule it calls is DEFINER.
    const authorize = migration.slice(migration.indexOf('create or replace function public.communications_authorize_dispatch('));
    expect(/^security invoker$/m.test(authorize.slice(0, authorize.indexOf('as $$')))).toBe(true);
    const rule = migration.slice(migration.indexOf('create or replace function public.communications_is_entitled('));
    expect(/^security definer$/m.test(rule.slice(0, rule.indexOf('as $$')))).toBe(true);
  });

  it('suspension is the existing terminal CANCELLED state with an inspectable marker — never a deletion, never a rewrite of history', () => {
    const suspensions = [...migration.matchAll(/set status = 'CANCELLED',\s*cancelled_at = now\(\),\s*last_error = 'ENTITLEMENT_SUSPENDED'/g)];
    expect(suspensions.length).toBeGreaterThanOrEqual(2);
    // Every suspension is guarded to pending rows: SCHEDULED / PROCESSING only.
    const guarded = [...migration.matchAll(/last_error = 'ENTITLEMENT_SUSPENDED'\s+where[\s\S]{0,300}?status (in \('SCHEDULED', 'PROCESSING'\)|= 'PROCESSING')/g)];
    expect(guarded.length).toBe(suspensions.length);
    expect(migration).not.toMatch(/delete from public\.scheduled_communications/);
    expect(migration).not.toMatch(/update public\.(business_communication_preferences|business_lifecycle_sms_preferences|clients|subscription_entitlements)/);
  });

  it('the worker holds no entitlement rule: it binds communications_authorize_dispatch and names no mirror object', () => {
    const sources = listFiles(WORKER_DIR, (name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
      .map((path) => ({ path: path.slice(WORKER_DIR.length + 1), source: readFileSync(path, 'utf8') }));
    for (const file of sources) {
      expect({ path: file.path, mirror: /subscription_entitlements|subscription_has_plus_access|server_feature_flags|communications_is_entitled/.test(file.source) }).toEqual({ path: file.path, mirror: false });
      expect({ path: file.path, readStatus: /communications_read_status/.test(file.source) }).toEqual({ path: file.path, readStatus: false });
    }
    const binders = sources.filter((file) => /'communications_authorize_dispatch'/.test(file.source)).map((file) => file.path);
    expect(binders).toEqual(['core/supabase-queue.ts']);
  });
});
