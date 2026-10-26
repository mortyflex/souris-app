// BeautIzzy — the server-side business-mutation entitlement migration stays
// bounded (BeautIzzy Plus Phase 6.5C, step 4; source-level guard, like the
// 6.5B `entitlement-boundary.test.ts`): a forward-only migration that sorts
// last, ONE disabled flag row that a re-run can never flip, THE access rule
// reused and never re-implemented, the push RPC asking the rule once — after
// the owner check and the argument validation, before any row is read — and
// answering the EXACT literal the client gateway parses, the pull RPC and the
// communication objects untouched, the privileges explicit, the app's build
// constant named nowhere. The behavior itself is verified against an
// in-process Postgres (supabase/README.md › Business mutation entitlement
// enforcement).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261006120000_add_business_mutation_entitlement_enforcement.sql';
const PREVIOUS_MIGRATION_NAME = '20261005120000_add_communication_entitlement_enforcement.sql';

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');

describe('Phase 6.5C step 4 — business-mutation entitlement migration', () => {
  it('is ONE forward-only migration sorting last, after the 6.5B one', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    // Immediately after the 6.5B one; step 5 (and later phases) sort after it and never touch it.
    expect(names.indexOf(MIGRATION_NAME)).toBe(names.indexOf(PREVIOUS_MIGRATION_NAME) + 1);
    expect(names.slice(names.indexOf(MIGRATION_NAME) + 1).every((name) => name > MIGRATION_NAME)).toBe(true);
    expect(names.filter((name) => name.includes('add_business_mutation'))).toEqual([MIGRATION_NAME]);
  });

  it('inserts ONE disabled flag row that a re-run can never flip, independent of the communications flag', () => {
    expect(code).toMatch(/insert into public\.server_feature_flags \(flag, enabled, note\)\s*values \(\s*'BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT',\s*false,/);
    expect(code).toMatch(/on conflict \(flag\) do nothing;/);
    expect(code).not.toMatch(/COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT/);
    expect(code).not.toMatch(/communications_/);
    // The only other write to the flag table is the operator switch's upsert of ITS row.
    const flagWrites = code.match(/public\.server_feature_flags/g) ?? [];
    expect(flagWrites).toHaveLength(3); // the insert, the reader's select, the switch's upsert
  });

  it('reuses THE access rule and never re-implements it', () => {
    expect(code).toMatch(/public\.subscription_has_plus_access\(b\.owner_user_id, coalesce\(p_at, now\(\)\)\)/);
    expect(code).not.toMatch(/from public\.subscription_entitlements/);
    expect(code).not.toMatch(/status <> 'EXPIRED'/);
    expect(code).not.toMatch(/'APP_STORE', 'MAC_APP_STORE'/);
    expect(code).not.toMatch(/entitled_until/);
  });

  it('the rule owns the ownership check: the signed-in caller, her Business, FALSE otherwise; enforcement disabled answers TRUE', () => {
    const rule = code.slice(code.indexOf('create or replace function public.business_mutation_is_entitled'));
    const body = rule.slice(0, rule.indexOf('$$;'));
    expect(body).toMatch(/when p_business_id is null then false/);
    expect(body).toMatch(/b\.owner_user_id = \(select auth\.uid\(\)\)/);
    expect(body).toMatch(/\) then false/);
    expect(body).toMatch(/when not public\.business_mutation_entitlement_enforcement_enabled\(\) then true/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/\bstable\b/);
  });

  it('the push RPC asks the rule exactly once — after the owner check and the validation, before any row is read — and answers the exact literal', () => {
    const rpc = code.slice(code.indexOf('create or replace function public.sync_push_aggregate'));
    const body = rpc.slice(0, rpc.indexOf('$$;'));
    expect(body.match(/business_mutation_is_entitled/g)).toHaveLength(1);
    const owner = body.indexOf('public.is_business_owner(p_business_id)');
    const validation = body.lastIndexOf("using errcode = '22023'");
    const check = body.indexOf('public.business_mutation_is_entitled(p_business_id)');
    const read = body.indexOf('for update');
    expect(owner).toBeGreaterThan(-1);
    expect(validation).toBeGreaterThan(owner);
    expect(check).toBeGreaterThan(validation);
    expect(read).toBeGreaterThan(check);
    expect(body).toMatch(/if not public\.business_mutation_is_entitled\(p_business_id\) then\s*return jsonb_build_object\('status', 'ENTITLEMENT_REQUIRED'\);\s*end if;/);
    // Never an exception for the refusal.
    expect(body).not.toMatch(/ENTITLEMENT_REQUIRED'[^;]*using errcode/);
    // The signature, the security mode and the aggregate whitelist are the deployed ones.
    expect(body).toMatch(/p_business_id uuid,\s*p_aggregate_type text,\s*p_aggregate_id text,\s*p_operation text,\s*p_expected_version bigint,\s*p_payload jsonb/);
    expect(body).toMatch(/security invoker/);
    for (const type of ['CLIENT', 'SERVICE', 'APPOINTMENT', 'PRODUCT', 'SALE', 'CALENDAR_BLOCK', 'APPOINTMENT_DEPOSIT']) {
      expect(body).toContain(`when '${type}' then`);
    }
    // The body is the deployed one plus the check: every existing answer is still produced.
    for (const status of ['APPLIED', 'CONFLICT', 'ABSENT', 'FINANCIAL_CONFLICT']) {
      expect(body).toContain(`'status', '${status}'`);
    }
  });

  it('the client parses the SAME literal the server answers', () => {
    const gateway = readFileSync(join(ROOT, 'src', 'infrastructure', 'supabase', 'sync-gateway.ts'), 'utf8');
    const contract = readFileSync(join(ROOT, 'src', 'persistence', 'sync', 'remote-gateway.ts'), 'utf8');
    expect(gateway).toContain("case 'ENTITLEMENT_REQUIRED':");
    expect(gateway).toContain("return { status: 'ENTITLEMENT_REQUIRED' };");
    expect(contract).toContain("| { readonly status: 'ENTITLEMENT_REQUIRED' };");
  });

  it('touches neither the pull RPC, the count RPC, Storage, a policy, nor any communication or mirror object', () => {
    expect(code).not.toMatch(/sync_pull_business_aggregates/);
    expect(code).not.toMatch(/sync_count_business_aggregates/);
    expect(code).not.toMatch(/storage\./);
    expect(code).not.toMatch(/create policy|alter policy|drop policy/);
    expect(code).not.toMatch(/scheduled_communications|business_communication_preferences|business_lifecycle_sms_preferences/);
    expect(code).not.toMatch(/subscription_apply|subscription_events|subscription_read_mirror|subscription_write_snapshot/);
    expect(code).not.toMatch(/create trigger|alter table/);
    // No top-level rewrite of any business table: the only UPDATE statements are the switch's upsert
    // and the RPC's own conditional writes inside its body (byte-identical to the deployed one).
    expect(code).not.toMatch(/^\s*(update|delete from)\s+public\.(clients|services|appointments|products|sales|calendar_blocks|appointment_deposits)/m);
  });

  it('revokes every new function from PUBLIC, anon, authenticated and service_role, then grants EXACTLY the rule to authenticated', () => {
    const revokes = [...code.matchAll(/revoke all on function public\.(business_mutation_\w+)\([^)]*\) from public, anon, authenticated, service_role;/g)].map((m) => m[1]).sort();
    expect(revokes).toEqual(['business_mutation_entitlement_enforcement_enabled', 'business_mutation_is_entitled', 'business_mutation_set_entitlement_enforcement']);
    const grants = [...code.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to (\w+);/g)].map((m) => `${m[1]}→${m[2]}`).sort();
    expect(grants).toEqual(['business_mutation_is_entitled→authenticated', 'sync_push_aggregate→authenticated']);
    expect(code).toMatch(/revoke all on function public\.sync_push_aggregate\(uuid, text, text, text, bigint, jsonb\) from public, anon;/);
  });

  it('names the mobile app’s enforcement constant nowhere under supabase/', () => {
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (!statSync(path).isFile()) {
          // Tests may quote the constant to assert its absence; executable code may not.
          if (name !== 'node_modules' && name !== '__tests__') walk(path);
        } else if (/\.(sql|ts|md)$/.test(name) && readFileSync(path, 'utf8').includes('SUBSCRIPTION_ENFORCEMENT')) {
          offenders.push(path.slice(ROOT.length + 1));
        }
      }
    };
    walk(join(ROOT, 'supabase'));
    expect(offenders.filter((path) => !path.endsWith('.md') && !path.endsWith('20261004120000_create_subscription_entitlements.sql'))).toEqual([]);
    expect(migration).not.toMatch(/SUBSCRIPTION_ENFORCEMENT/);
  });
});
