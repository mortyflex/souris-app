// BeautIzzy — the step 8 migration of BeautIzzy Plus Phase 6.5C stays bounded
// (source-level guard, like the step 4 and step 5 ones): ONE forward-only
// migration sorting right after step 6; ONE new SECURITY DEFINER helper
// that writes the three consent columns of the owner's own client to
// OPTED_OUT and nothing else, granted to authenticated only; the push RPC
// replaced in place with the step 4 body plus the exception INSIDE its
// refusal branch (the rule asked once, the exception after it, the refusal
// literal unchanged); no policy, no table, no row, no switch, no
// communication object touched; the app's build constant named nowhere. The
// behavior is verified against an in-process Postgres (supabase/README.md ›
// Client consent withdrawal).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261009120000_add_client_consent_withdrawal_exception.sql';
const STEP4_MIGRATION_NAME = '20261006120000_add_business_mutation_entitlement_enforcement.sql';
const STEP6_MIGRATION_NAME = '20261008120000_add_subscription_reconciliation.sql';

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
const step4 = readFileSync(join(MIGRATIONS_DIR, STEP4_MIGRATION_NAME), 'utf8');
/** A migration without its comment lines. */
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const code = strip(migration);

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('Phase 6.5C step 8 — client consent withdrawal migration', () => {
  it('is ONE forward-only migration sorting right after step 6; earlier migrations are untouched', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    const index = names.indexOf(MIGRATION_NAME);
    expect(names[index - 1]).toBe(STEP6_MIGRATION_NAME);
    // Only later, unrelated phases follow it (multi-profession Step 3: service categories; sale adjustments
    // and their exceptional outflows; the online booking profile and working hours, which only add objects).
    expect(names.slice(index + 1)).toEqual([
      '20261010120000_add_service_categories_and_descriptions.sql',
      '20261011120000_create_sale_adjustments.sql',
      '20261012120000_add_sale_refund_outflows.sql',
      '20261013120000_prevent_refunds_after_over_refund.sql',
      '20261014120000_identify_new_refund_by_write.sql',
      '20261015120000_create_online_booking_profiles.sql',
      '20261016120000_create_online_booking_working_hours.sql',
    ]);
    expect(names.filter((name) => name.includes('consent_withdrawal'))).toEqual([MIGRATION_NAME]);
    expect(step4).not.toMatch(/sync_withdraw_client_sms_consent/);
  });

  it('adds ONE helper: SECURITY DEFINER, search_path pinned, owner-checked, writing the three consent columns to OPTED_OUT and nothing else', () => {
    const created = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(['sync_withdraw_client_sms_consent', 'sync_push_aggregate']);
    const helper = functionBody(code, 'sync_withdraw_client_sms_consent');
    const head = helper.slice(0, helper.indexOf('as $$'));
    expect(/^security definer$/m.test(head)).toBe(true);
    expect(/^set search_path = ''$/m.test(head)).toBe(true);
    expect(helper).toMatch(/if not public\.is_business_owner\(p_business_id\) then\s+raise exception[^;]*using errcode = '42501';/);
    // Only a withdrawal; never a grant, never a clear.
    expect(helper).toMatch(/p_payload->>'sms_marketing_consent' is distinct from 'OPTED_OUT' then\s+return null;/);
    expect(helper).not.toMatch(/'OPTED_IN'/);
    // Exactly one UPDATE, of the three consent columns, on the owner's row.
    expect(helper.match(/update public\.clients/g)).toHaveLength(1);
    expect(helper).toMatch(/set sms_marketing_consent = 'OPTED_OUT',\s*sms_marketing_consent_updated_at = v_updated_at,\s*sms_marketing_consent_source = v_source\s*where business_id = p_business_id and id = p_aggregate_id/);
    expect(helper).not.toMatch(/insert into|delete from|deleted_at = |archived_at = |first_name = /);
    // Every other key must equal the stored row; unknown keys refuse; a tombstoned or absent client refuses.
    for (const column of ['first_name', 'last_name', 'phone', 'email', 'birthday', 'notes', 'photo_path', 'archived_at']) {
      expect(helper).toContain(`p_payload ? '${column}'`);
    }
    expect(helper).toMatch(/jsonb_object_keys\(p_payload\)/);
    expect(helper).toMatch(/if not found or v_row\.deleted_at is not null then\s+return null;/);
    expect(helper).toMatch(/for update;/);
    // Privileges: authenticated only (the INVOKER push RPC runs as the owner).
    expect(migration).toMatch(/revoke all on function public\.sync_withdraw_client_sms_consent\(uuid, text, jsonb\) from public, anon, service_role;/);
    const grants = [...migration.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);/gm)].map((m) => `${m[1]}→${m[2]}`);
    expect(grants).toEqual(['sync_withdraw_client_sms_consent→authenticated', 'sync_push_aggregate→authenticated']);
  });

  it('replaces the push RPC in place with the step 4 body plus the exception INSIDE the refusal branch', () => {
    const rpc = functionBody(code, 'sync_push_aggregate');
    const previous = functionBody(strip(step4), 'sync_push_aggregate');
    // The rule is asked once; the exception follows it and precedes the unchanged refusal literal.
    expect(rpc.match(/business_mutation_is_entitled/g)).toHaveLength(1);
    const rule = rpc.indexOf('if not public.business_mutation_is_entitled(p_business_id) then');
    const exception = rpc.indexOf("if p_aggregate_type = 'CLIENT' and p_operation = 'UPSERT' then");
    const helperCall = rpc.indexOf('withdrawal := public.sync_withdraw_client_sms_consent(p_business_id, p_aggregate_id, p_payload);');
    const refusal = rpc.indexOf("return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');");
    const read = rpc.indexOf('for update');
    expect(rule).toBeGreaterThan(-1);
    expect(exception).toBeGreaterThan(rule);
    expect(helperCall).toBeGreaterThan(exception);
    expect(refusal).toBeGreaterThan(helperCall);
    expect(read).toBeGreaterThan(refusal);
    expect(rpc.match(/sync_withdraw_client_sms_consent/g)).toHaveLength(1);
    expect(rpc).toMatch(/if withdrawal is not null then\s+return withdrawal;\s+end if;/);
    // The body is the step 4 one with exactly that addition (and its declaration): every other line is identical.
    const normalize = (sql: string) =>
      sql
        .replace(/\s+withdrawal jsonb;\n/, '\n')
        .replace(/if p_aggregate_type = 'CLIENT' and p_operation = 'UPSERT' then[\s\S]*?end if;\s*\n\s*return jsonb_build_object\('status', 'ENTITLEMENT_REQUIRED'\);/, "return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');")
        .replace(/\s+/g, ' ')
        .trim();
    expect(normalize(rpc)).toBe(normalize(previous));
    expect(migration).toMatch(/revoke all on function public\.sync_push_aggregate\(uuid, text, text, text, bigint, jsonb\) from public, anon;/);
  });

  it('touches no policy, no table, no trigger, no switch, no communication object, no row, and names the app constant nowhere', () => {
    const topLevel = code.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$');
    expect(topLevel).not.toMatch(/create policy|alter policy|drop policy|create table|alter table|create trigger|drop trigger/);
    expect(topLevel).not.toMatch(/^\s*(update|delete from|insert into)\s/im);
    expect(code).not.toMatch(/server_feature_flags|_ENTITLEMENT_ENFORCEMENT'|business_mutation_set_|communications_set_/);
    expect(code).not.toMatch(/scheduled_communications|business_communication_preferences|business_lifecycle_sms_preferences|communications_update/);
    expect(code).not.toMatch(/subscription_has_plus_access|subscription_entitlements|storage\./);
    expect(migration).not.toMatch(/SUBSCRIPTION_ENFORCEMENT/);
  });

  it('the client parses the same answers the RPC returns, and the app rule mirrors the server rule', () => {
    const gateway = readFileSync(join(ROOT, 'src', 'infrastructure', 'supabase', 'sync-gateway.ts'), 'utf8');
    expect(gateway).toContain("case 'ENTITLEMENT_REQUIRED':");
    const domainRule = readFileSync(join(ROOT, 'src', 'domain', 'clients', 'consent-withdrawal.ts'), 'utf8');
    expect(domainRule).toMatch(/smsMarketingConsent\?\.status !== 'OPTED_OUT'\) return false/);
    for (const field of ['firstName', 'lastName', 'phone', 'email', 'notes', 'birthday']) expect(domainRule).toContain(field);
    const provider = readFileSync(join(ROOT, 'src', 'features', 'clients', 'session', 'ClientSessionProvider.tsx'), 'utf8');
    expect(provider).toMatch(/if \(current === undefined \|\| !isClientSmsConsentWithdrawalOnly\(current, client\)\) \{\s+requireWriteAccess\('clients\.updateClient'\);/);
  });
});
