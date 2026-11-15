// BeautIzzy — the « no new refund after an over-refund » migration stays bounded (source-level
// guard, like the other migration guards): ONE forward-only migration sorting last; NO table,
// column, index or data change; exactly ONE function — `sync_sale_adjustment_breach` replaced in
// place, differing from its 20261012120000 body ONLY by the real-money rule of NEW refunds. Its
// behaviour is verified against an in-process Postgres (CLOUD_SYNC.md §28.2).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261013120000_prevent_refunds_after_over_refund.sql';
const PREVIOUS = '20261012120000_add_sale_refund_outflows.sql';

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

describe('sale adjustments — no new refund after an over-refund (20261013120000)', () => {
  it('is ONE forward-only migration; only its write-scoped fix (20261014120000) and the unrelated online booking profile, working hours and availability follow it', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    expect(names.slice(names.indexOf(MIGRATION_NAME) + 1)).toEqual([
      '20261014120000_identify_new_refund_by_write.sql',
      // Unrelated: they only add objects and define no sync function (online-booking-*migration.test.ts).
      '20261015120000_create_online_booking_profiles.sql',
      '20261016120000_create_online_booking_working_hours.sql',
      '20261017120000_create_online_booking_availability.sql',
    ]);
    expect(names.filter((name) => name.includes('over_refund'))).toEqual([MIGRATION_NAME]);
  });

  it('changes no table, column, index, row, trigger or policy', () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+(table|index|trigger|policy|type|view)\b/i);
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i);
    expect(code).not.toMatch(/\bdrop\s+function\b/i);
  });

  it('replaces exactly ONE SECURITY INVOKER function, granted to authenticated only', () => {
    const defined = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
    expect(defined).toEqual(['sync_sale_adjustment_breach']);
    expect(code).not.toMatch(/security definer/i);
    expect(code.match(/security invoker/g)).toHaveLength(1);
    expect(code).toMatch(/revoke all on function public\.sync_sale_adjustment_breach\(uuid, text\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.sync_sale_adjustment_breach\(uuid, text\) to authenticated;/);
  });

  it('the breach differs from its previous live body ONLY by the real-money rule of NEW refunds', () => {
    const next = functionBody(code, 'sync_sale_adjustment_breach');
    const ruleStart = next.indexOf("    elsif exists (\n      select 1\n      from public.sale_adjustments n");
    const ruleEnd = next.indexOf("v_reason := 'CEILING';", ruleStart);
    expect(ruleStart).toBeGreaterThan(-1);
    expect(ruleEnd).toBeGreaterThan(ruleStart);
    const rule = next.slice(ruleStart, ruleEnd);
    // Only a row THIS transaction inserted, never an outflow, only money.
    expect(rule).toContain('n.created_at = now()');
    expect(rule).toContain('public.sync_sale_refund_outflow_source(n.id) is null');
    expect(rule).toContain('n.refund_card_cents + n.refund_cash_cents > 0');
    // Refunds + effective (not compensated) outflows against the base.
    expect(rule).toContain('public.sync_sale_refund_outflow_source(o.id) is not null');
    expect(rule).toContain('r.reverses_adjustment_id = o.id');
    expect(rule).toMatch(/\) > v_base then\s*$/);
    const withoutRule = next.slice(0, ruleStart) + next.slice(ruleEnd + "v_reason := 'CEILING';".length).replace(/^\n/, '');
    expect(normalize(withoutRule)).toBe(normalize(functionBody(previous, 'sync_sale_adjustment_breach')));
  });

  it('leaves every sync RPC as it is (the push already evaluates the breach under the Sale-row lock)', () => {
    for (const name of ['sync_push_aggregate', 'sync_pull_business_aggregates', 'sync_count_business_aggregates']) {
      expect(code).not.toContain(`function public.${name}(`);
    }
  });
});
