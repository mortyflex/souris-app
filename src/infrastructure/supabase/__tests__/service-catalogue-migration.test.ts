// BeautIzzy — the service catalogue migration stays bounded (source-level guard, like the
// other migration guards): ONE forward-only, additive migration sorting last; two nullable
// Service columns; ONE new table with RLS, the entitlement on writes and least-privilege grants;
// the three sync RPCs replaced in place, the push differing from the previous live body ONLY by
// the SERVICE branch and the new SERVICE_CATEGORY branch. Its behaviour is verified against an
// in-process Postgres (supabase/README.md › Service categories and descriptions).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261010120000_add_service_categories_and_descriptions.sql';
const PREVIOUS_PUSH = '20261009120000_add_client_consent_withdrawal_exception.sql';

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '').replace(/\n\s*\n/g, '\n');
const code = strip(migration);

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

function withoutBranch(body: string, from: string, to: string): string {
  const start = body.indexOf(from);
  const end = body.indexOf(to, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return body.slice(0, start) + body.slice(end);
}

describe('multi-profession Step 3 — service categories and descriptions migration', () => {
  it('is ONE forward-only migration; only later, unrelated phases follow it', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    // The sale adjustments migrations (CLOUD_SYNC.md §28, §28.1) sort after it.
    expect(names.slice(names.indexOf(MIGRATION_NAME) + 1)).toEqual([
      '20261011120000_create_sale_adjustments.sql',
      '20261012120000_add_sale_refund_outflows.sql',
      '20261013120000_prevent_refunds_after_over_refund.sql',
    ]);
    expect(names.filter((name) => name.includes('service_categories'))).toEqual([MIGRATION_NAME]);
  });

  it('is additive: no drop of a table or column, no delete, no truncate, no row update', () => {
    // The RPC bodies keep their existing child-set replacement; the migration itself writes no row.
    const statements = code.replace(/create or replace function[\s\S]*?\$\$;/g, '');
    expect(statements).not.toMatch(/drop\s+table/i);
    expect(statements).not.toMatch(/drop\s+column/i);
    expect(statements).not.toMatch(/\btruncate\b/i);
    expect(statements).not.toMatch(/^\s*delete\s+from/im);
    expect(statements).not.toMatch(/^\s*update\s+public\./im);
    expect(statements).not.toMatch(/^\s*insert\s+into\s+public\./im);
    expect(code).toMatch(/alter table public\.services add column if not exists category_id text;/);
    expect(code).toMatch(/alter table public\.services add column if not exists description text;/);
    // No foreign key from a Service to its category: plain metadata.
    expect(code).not.toMatch(/references public\.service_categories/);
  });

  it('creates service_categories with RLS, owner policies, the entitlement on writes and no delete', () => {
    expect(code).toMatch(/create table if not exists public\.service_categories/);
    expect(code).toMatch(/alter table public\.service_categories enable row level security;/);
    const policies = [...code.matchAll(/create policy "service_categories: owner can (\w+)"/g)].map((m) => m[1]);
    expect(policies).toEqual(['select', 'insert', 'update']);
    expect((code.match(/business_mutation_is_entitled\(business_id\)/g) ?? []).length).toBe(2);
    expect(code).toMatch(/revoke all on table public\.service_categories from public, anon, authenticated, service_role;/);
    expect(code).toMatch(/grant select, insert, update on table public\.service_categories to authenticated;/);
    expect(code).toMatch(/execute function public\.sync_aggregate_before_write\(\)/);
  });

  it('replaces exactly the three sync RPCs, in place', () => {
    const created = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(['sync_count_business_aggregates', 'sync_push_aggregate', 'sync_pull_business_aggregates']);
    expect(code).toMatch(/grant execute on function public\.sync_push_aggregate\(uuid, text, text, text, bigint, jsonb\) to authenticated;/);
    expect(functionBody(code, 'sync_count_business_aggregates')).toMatch(/from public\.service_categories where business_id = p_business_id/);
  });

  it('keeps the stored category and description when a payload omits them (an older build)', () => {
    const push = functionBody(code, 'sync_push_aggregate');
    expect(push).toMatch(/category_id = case\s+when p_payload \? 'category_id' then excluded\.category_id\s+else public\.services\.category_id\s+end/);
    expect(push).toMatch(/description = case\s+when p_payload \? 'description' then excluded\.description\s+else public\.services\.description\s+end/);
    expect(push).toMatch(/when 'SERVICE_CATEGORY' then 'service_categories'/);
  });

  it('changes nothing else in the push: the previous live body minus the two branches is identical', () => {
    const previous = strip(functionBody(readFileSync(join(MIGRATIONS_DIR, PREVIOUS_PUSH), 'utf8'), 'sync_push_aggregate'));
    const current = functionBody(code, 'sync_push_aggregate');
    const service = ["elsif p_aggregate_type = 'SERVICE' then", "      delete from public.service_phases c"] as const;
    const normalizedPrevious = withoutBranch(previous, ...service);
    const normalizedCurrent = withoutBranch(
      withoutBranch(current, ...service),
      "elsif p_aggregate_type = 'SERVICE_CATEGORY' then",
      "elsif p_aggregate_type = 'CALENDAR_BLOCK' then",
    ).replace("    when 'SERVICE_CATEGORY' then 'service_categories'\n", '');
    expect(normalizedCurrent).toBe(normalizedPrevious);
  });

  it('pulls the two Service keys and an always-present service_categories family', () => {
    const pull = functionBody(code, 'sync_pull_business_aggregates');
    expect(pull).toMatch(/'category_id', s\.category_id,\s+'description', s\.description,/);
    expect(pull).toMatch(/'service_categories', coalesce\(\(/);
    expect(pull).toMatch(/\), '\[\]'::jsonb\)\s+\)\s+\);\s+end;/);
  });
});
