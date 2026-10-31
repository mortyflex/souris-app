// BeautIzzy — the exceptional-outflow migration stays bounded (source-level guard, like the other
// migration guards): ONE forward-only migration sorting last; NO table, column, index or data
// change; exactly two functions — a new immutable helper and `sync_sale_adjustment_breach`
// replaced in place, differing from its 20261011120000 body ONLY by the outflow rule and the two
// ceiling exclusions. Its behaviour is verified against an in-process Postgres (CLOUD_SYNC.md §28.1).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261012120000_add_sale_refund_outflows.sql';
const PREVIOUS = '20261011120000_create_sale_adjustments.sql';

const strip = (sql: string) =>
  sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
const code = strip(readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8'));
const previous = strip(readFileSync(join(MIGRATIONS_DIR, PREVIOUS), 'utf8'));

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('sale adjustments — exceptional outflows migration (20261012120000)', () => {
  it('is ONE forward-only migration and sorts last', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    expect(names.at(-1)).toBe(MIGRATION_NAME);
    expect(names.filter((name) => name.includes('refund_outflows'))).toEqual([MIGRATION_NAME]);
  });

  it('changes no table, column, index, row, trigger or policy', () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+(table|index|trigger|policy|type|view)\b/i);
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i);
    expect(code).not.toMatch(/\bdrop\s+function\b/i);
  });

  it('defines exactly two SECURITY INVOKER functions, granted to authenticated only', () => {
    const defined = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
    expect(defined).toEqual(['sync_sale_refund_outflow_source', 'sync_sale_adjustment_breach']);
    expect(code).not.toMatch(/security definer/i);
    expect(code.match(/security invoker/g)).toHaveLength(2);
    for (const name of defined) {
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`));
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
    }
    expect(functionBody(code, 'sync_sale_refund_outflow_source')).toMatch(/\bimmutable\b/);
  });

  it('the outflow link is the `-outflow` suffix, read the same way as the app (getSaleRefundOutflowSourceId)', () => {
    const helper = functionBody(code, 'sync_sale_refund_outflow_source');
    expect(helper).toContain("right(p_id, 8) = '-outflow'");
    expect(helper).toContain('char_length(p_id) > 8');
  });

  it('the breach differs from its previous live body ONLY by the outflow rule and the two ceiling exclusions', () => {
    const next = functionBody(code, 'sync_sale_adjustment_breach');
    const outflowStart = next.indexOf('  elsif exists (\n    select 1\n    from public.sale_adjustments o');
    const outflowEnd = next.indexOf("v_reason := 'OUTFLOW';", outflowStart);
    expect(outflowStart).toBeGreaterThan(-1);
    expect(outflowEnd).toBeGreaterThan(outflowStart);
    const withoutOutflow =
      next.slice(0, outflowStart) + next.slice(outflowEnd + "v_reason := 'OUTFLOW';".length).replace(/^\n/, '');
    const exclusion = /^\s*and public\.sync_sale_refund_outflow_source\(a\.id\) is null\n/gm;
    expect(withoutOutflow.match(exclusion)).toHaveLength(2);
    expect(normalize(withoutOutflow.replace(exclusion, ''))).toBe(
      normalize(functionBody(previous, 'sync_sale_adjustment_breach')),
    );
  });

  it('leaves every sync RPC as it is (the push already evaluates the breach under the Sale-row lock)', () => {
    for (const name of ['sync_push_aggregate', 'sync_pull_business_aggregates', 'sync_count_business_aggregates']) {
      expect(code).not.toContain(`function public.${name}(`);
    }
    expect(functionBody(previous, 'sync_push_aggregate')).toContain('public.sync_sale_adjustment_breach(');
  });
});
