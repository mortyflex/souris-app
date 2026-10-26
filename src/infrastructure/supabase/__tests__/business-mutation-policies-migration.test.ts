// BeautIzzy — the step 5 migration of BeautIzzy Plus Phase 6.5C stays bounded
// (source-level guard, like `sync-entitlement-migration.test.ts` for step 4):
// ONE forward-only migration sorting last; every authenticated write policy of
// the eleven operational tables replaced UNDER ITS NAME with ownership AND the
// step 4 rule (never a second subscription rule), SELECT policies and grants
// untouched; the business-media INSERT policy replaced through ONE helper that
// mirrors the owner predicate; the three preference RPCs replaced in place with
// the enable gate only; no flag inserted or flipped; no row rewritten; the
// app's build constant named nowhere. The behavior is verified against an
// in-process Postgres (supabase/README.md › Business mutation entitlement
// enforcement — step 5).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261007120000_complete_business_mutation_entitlement_enforcement.sql';
const STEP4_MIGRATION_NAME = '20261006120000_add_business_mutation_entitlement_enforcement.sql';

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');

const PARENTS = ['clients', 'services', 'appointments', 'products', 'sales', 'calendar_blocks', 'appointment_deposits'];
const CHILDREN = ['service_phases', 'appointment_items', 'appointment_phases', 'sale_items'];
const OWNER = String.raw`\(select public\.is_business_owner\(business_id\)\)`;
const RULE = String.raw`\(select public\.business_mutation_is_entitled\(business_id\)\)`;
const BOTH = `${OWNER} and ${RULE}`;

describe('Phase 6.5C step 5 — business-mutation policies migration', () => {
  it('is ONE forward-only migration sorting right after step 4, which is untouched', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    // Immediately after step 4; step 6 (and later phases) sort after it and never touch it.
    expect(names.indexOf(MIGRATION_NAME)).toBe(names.indexOf(STEP4_MIGRATION_NAME) + 1);
    expect(names.slice(names.indexOf(MIGRATION_NAME) + 1).every((name) => name > MIGRATION_NAME)).toBe(true);
    const step4 = readFileSync(join(MIGRATIONS_DIR, STEP4_MIGRATION_NAME), 'utf8');
    expect(step4).not.toMatch(/create policy|storage\.|communications_update/);
  });

  it('replaces every authenticated write policy of the eleven tables UNDER ITS NAME with ownership AND the rule', () => {
    const created = [...code.matchAll(/create policy "([^"]+)" on public\.(\w+)\s+for (insert|update|delete) to authenticated\s+([\s\S]*?);/g)];
    const dropped = [...code.matchAll(/drop policy if exists "([^"]+)" on public\.(\w+);/g)].map((m) => `${m[2]}:${m[1]}`);
    const expected: string[] = [];
    for (const table of [...PARENTS, ...CHILDREN]) {
      expected.push(`${table}:${table}: owner can insert`, `${table}:${table}: owner can update`);
      if (CHILDREN.includes(table)) expected.push(`${table}:${table}: owner can delete`);
    }
    expect(created.map((m) => `${m[2]}:${m[1]}`).sort()).toEqual([...expected].sort());
    expect(dropped.sort()).toEqual([...expected].sort());
    for (const [, name, table, command, body] of created) {
      const label = `${table} ${command} (${name})`;
      if (command === 'insert') {
        expect({ label, ok: new RegExp(`^\\s*with check \\(${BOTH}\\)\\s*$`).test(body) }).toEqual({ label, ok: true });
      } else if (command === 'update') {
        expect({ label, ok: new RegExp(`^\\s*using \\(${OWNER}\\)\\s+with check \\(${BOTH}\\)\\s*$`).test(body) }).toEqual({ label, ok: true });
      } else {
        expect({ label, ok: new RegExp(`^\\s*using \\(${BOTH}\\)\\s*$`).test(body) }).toEqual({ label, ok: true });
      }
    }
    // Parents are tombstoned, never deleted: no DELETE policy, no DELETE grant appears.
    for (const table of PARENTS) expect(code).not.toContain(`"${table}: owner can delete"`);
    expect(code).not.toMatch(/\bgrant\b[^;]*\bdelete\b/);
  });

  it('touches no SELECT policy, no grant, no trigger, no constraint, no businesses policy and no row', () => {
    expect(code).not.toMatch(/for select/);
    expect(code).not.toMatch(/on table/);
    expect(code).not.toMatch(/create trigger|alter table|add constraint/);
    expect(code).not.toMatch(/on public\.businesses\b/);
    expect(code).not.toMatch(/^\s*(update|delete from|insert into)\s+public\.(clients|services|service_phases|appointments|appointment_items|appointment_phases|products|sales|sale_items|calendar_blocks|appointment_deposits|businesses|subscription_\w+|scheduled_communications)\b/m);
  });

  it('reuses the step 4 rule and never re-implements it, inserts or flips no flag', () => {
    expect(code).not.toMatch(/subscription_has_plus_access|subscription_entitlements|entitled_until|status <> 'EXPIRED'|'APP_STORE'/);
    expect(code).not.toMatch(/server_feature_flags|_ENTITLEMENT_ENFORCEMENT'/);
    expect(code).not.toMatch(/create or replace function public\.business_mutation_/);
  });

  it('gates business-media uploads through ONE helper mirroring the owner predicate; reading and removing stay as they were', () => {
    const helper = code.slice(code.indexOf('create or replace function public.is_business_media_writable'));
    const body = helper.slice(0, helper.indexOf('$$;'));
    expect(body).toMatch(/security invoker/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/\[1\]\s*~ '\^\[0-9a-f\]\{8\}-/);
    expect(body).toMatch(/then public\.is_business_owner\(\(\(storage\.foldername\(object_name\)\)\[1\]\)::uuid\)\s+and public\.business_mutation_is_entitled\(\(\(storage\.foldername\(object_name\)\)\[1\]\)::uuid\)/);
    expect(code).toMatch(/drop policy if exists "business-media: owner can insert" on storage\.objects;/);
    expect(code).toMatch(/create policy "business-media: owner can insert"\s+on storage\.objects\s+for insert\s+to authenticated\s+with check \(bucket_id = 'business-media' and public\.is_business_media_writable\(name\)\);/);
    expect(code).not.toMatch(/"business-media: owner can select"|"business-media: owner can delete"/);
    expect(code).not.toMatch(/on storage\.objects\s+for (update|delete|select)/);
    expect(code).toMatch(/revoke all on function public\.is_business_media_writable\(text\) from public, anon, service_role;/);
    expect(code).toMatch(/grant execute on function public\.is_business_media_writable\(text\) to authenticated;/);
  });

  it('replaces the three preference RPCs in place with the enable gate only — disabling never asks the rule', () => {
    const functions = ['communications_update_preferences', 'communications_update_sms_preferences', 'communications_update_lifecycle_sms_preferences'];
    for (const name of functions) {
      const start = code.indexOf(`create or replace function public.${name}(`);
      expect({ name, found: start > -1 }).toEqual({ name, found: true });
      const body = code.slice(start, code.indexOf('$$;', start));
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = ''/);
      expect(body).toMatch(/if not public\.is_business_owner\(p_business_id\) then\s+raise exception[^;]*using errcode = '42501';/);
      expect(body.match(/business_mutation_is_entitled\(p_business_id\)/g)).toHaveLength(1);
      expect(body).toMatch(/and not public\.business_mutation_is_entitled\(p_business_id\) then\s+return jsonb_build_object\('status', 'ENTITLEMENT_REQUIRED'\);/);
      // The gate is reached only when a switch would turn ON: every `p_*_enabled and not coalesce(<stored>, false)` shape.
      expect(body).toMatch(/p_\w+_enabled\s+and not coalesce\(v_(currently_enabled|current\.\w+), false\)/);
      // Ownership and the required-argument check come first; the gate comes before any write.
      expect(body.indexOf("errcode = '42501'")).toBeLessThan(body.indexOf('business_mutation_is_entitled'));
      expect(body.indexOf("errcode = '22023'")).toBeLessThan(body.indexOf('business_mutation_is_entitled'));
      expect(body.indexOf('business_mutation_is_entitled')).toBeLessThan(body.indexOf('insert into public.business_'));
      // The deployed answers are still produced.
      expect(body).toContain("'status', 'UPDATED'");
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
    }
    expect(code).toContain("'status', 'INVALID_REPLY_TO'");
    expect(code).toContain("'status', 'INVALID_VALUE'");
    // The scheduling, the worker gate and the 6.5B switch are not rewritten here.
    expect(code).not.toMatch(/communications_reconcile|communications_authorize_dispatch|communications_is_entitled|communications_set_entitlement_enforcement/);
  });

  it('names the mobile app’s enforcement constant nowhere', () => {
    expect(migration).not.toMatch(/SUBSCRIPTION_ENFORCEMENT/);
  });
});
