// BeautIzzy — the « new refund = the row THIS write inserted » migration stays bounded (source-level
// guard, like the other migration guards): ONE forward-only migration sorting last; NO table, column,
// index or data change; the 3-argument breach differs from the 20261013120000 body ONLY by naming the
// inserted adjustment instead of `created_at = now()`; the push differs from its 20261011120000 body
// ONLY by passing that id and by the adjustment-identity guards (advisory lock, ON CONFLICT forward rule,
// post-write identity check). Its behaviour is verified against an in-process Postgres (CLOUD_SYNC.md §28.3).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261014120000_identify_new_refund_by_write.sql';
const PREVIOUS_BREACH = '20261013120000_prevent_refunds_after_over_refund.sql';
const PREVIOUS_PUSH = '20261011120000_create_sale_adjustments.sql';

const strip = (sql: string) =>
  sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
const read = (name: string) => strip(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
const code = read(MIGRATION_NAME);

function functionBody(sql: string, signatureStart: string): string {
  const start = sql.indexOf(signatureStart);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const BREACH_3 = 'create or replace function public.sync_sale_adjustment_breach(\n  p_business_id uuid,\n  p_sale_id text,\n  p_inserted_adjustment_id text\n)';
const BREACH_2 = 'create or replace function public.sync_sale_adjustment_breach(p_business_id uuid, p_sale_id text)';
const PUSH = 'create or replace function public.sync_push_aggregate(';

describe('sale adjustments — the new refund is the row the write inserted (20261014120000)', () => {
  it('is ONE forward-only migration, the last one to define a sync function', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    const index = names.indexOf(MIGRATION_NAME);
    expect(names[index - 1]).toBe(PREVIOUS_BREACH);
    // Only the online booking profile, working hours and availability follow; they add objects and replace none of these functions.
    const later = names.slice(index + 1);
    expect(later).toEqual([
      '20261015120000_create_online_booking_profiles.sql',
      '20261016120000_create_online_booking_working_hours.sql',
      '20261017120000_create_online_booking_availability.sql',
    ]);
    for (const name of later) {
      const source = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(/^\s*--.*$/gm, '');
      expect(source).not.toMatch(/sync_push_aggregate|sync_sale_adjustment_/);
    }
  });

  it('changes no table, column, index, row, trigger or policy and drops nothing', () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+(table|index|trigger|policy|type|view)\b/i);
    expect(code).not.toMatch(/\btruncate\b|\bdrop\s+function\b/i);
    // Outside the push body (whose writes are pinned below), nothing writes a row.
    const outsidePush = code.slice(0, code.indexOf(PUSH));
    expect(outsidePush).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i);
  });

  it('defines the breach overloads, the identity comparison and the push, SECURITY INVOKER, authenticated only', () => {
    const defined = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
    expect(defined).toEqual([
      'sync_sale_adjustment_breach',
      'sync_sale_adjustment_breach',
      'sync_sale_adjustment_payload_differs',
      'sync_push_aggregate',
    ]);
    expect(code).not.toMatch(/security definer/i);
    expect(code.match(/security invoker/g)).toHaveLength(4);
    for (const signature of [
      'sync_sale_adjustment_breach(uuid, text, text)',
      'sync_sale_adjustment_breach(uuid, text)',
      'sync_sale_adjustment_payload_differs(uuid, text, jsonb)',
      'sync_push_aggregate(uuid, text, text, text, bigint, jsonb)',
    ]) {
      expect(code).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(code).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
  });

  it('never infers a new row from the transaction timestamp', () => {
    expect(code).not.toMatch(/created_at\s*=\s*now\(\)/);
  });

  it('the 3-argument breach differs from the 20261013120000 body ONLY by naming the inserted row', () => {
    const next = functionBody(code, BREACH_3);
    expect(next).toContain('and n.id = p_inserted_adjustment_id');
    const previous = functionBody(read(PREVIOUS_BREACH), BREACH_2);
    const expected = previous
      .replace(BREACH_2, BREACH_3)
      .replace('and n.created_at = now()', '')
      .replace("where n.business_id = p_business_id and n.sale_id = p_sale_id", 'where n.business_id = p_business_id and n.sale_id = p_sale_id and n.id = p_inserted_adjustment_id');
    expect(normalize(next)).toBe(normalize(expected));
  });

  it('the 2-argument breach keeps only the state rules (no inserted row)', () => {
    expect(normalize(functionBody(code, BREACH_2))).toContain(
      'select public.sync_sale_adjustment_breach(p_business_id, p_sale_id, null::text);',
    );
  });

  it('the push differs from its 20261011120000 body ONLY by the inserted id and the identity guards', () => {
    const next = normalize(functionBody(code, PUSH));
    let expected = normalize(functionBody(read(PREVIOUS_PUSH), PUSH));
    const swap = (from: string, to: string) => {
      expect(expected.split(from)).toHaveLength(2);
      expected = expected.replace(from, () => to);
    };
    swap(
      'stored_adjustment public.sale_adjustments%rowtype;',
      'stored_adjustment public.sale_adjustments%rowtype; adjustment_inserted_id text;',
    );
    // (1) one writer per adjustment identity, BEFORE the Sale-row lock
    swap(
      "if p_aggregate_type = 'SALE_ADJUSTMENT' then adjustment_sale_id := coalesce(",
      "if p_aggregate_type = 'SALE_ADJUSTMENT' then perform pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended('sale_adjustment:' || p_business_id::text || ':' || p_aggregate_id, 0) ); end if; if p_aggregate_type = 'SALE_ADJUSTMENT' then adjustment_sale_id := coalesce(",
    );
    // (2) the pre-write immutability check reads the shared comparison (pinned below)
    const preStart = expected.indexOf("if stored_adjustment.sale_id is distinct from (p_payload ->> 'sale_id')");
    const preEnd = expected.indexOf(") then return jsonb_build_object( 'status', 'ADJUSTMENT_CONFLICT', 'sale_id', stored_adjustment.sale_id, 'reason', 'IMMUTABLE' );");
    expect(preStart).toBeGreaterThan(-1);
    expect(preEnd).toBeGreaterThan(preStart);
    expected =
      expected.slice(0, preStart) +
      "if public.sync_sale_adjustment_payload_differs(p_business_id, p_aggregate_id, p_payload) or not public.sync_sale_adjustment_transition_allowed(stored_adjustment.status, p_payload ->> 'status'" +
      expected.slice(preEnd);
    // (3) the adjustment this write inserts
    swap(
      'begin set constraints all deferred;',
      "if p_aggregate_type = 'SALE_ADJUSTMENT' and (not remote_found or remote_deleted_at is not null) then adjustment_inserted_id := p_aggregate_id; end if; begin set constraints all deferred;",
    );
    // (4) ON CONFLICT never moves a forbidden status
    swap('insert into public.sale_adjustments (business_id, id, sale_id, kind,', 'insert into public.sale_adjustments as stored (business_id, id, sale_id, kind,');
    swap(
      'voided_at = excluded.voided_at, deleted_at = null; insert into public.sale_adjustment_items',
      'voided_at = excluded.voided_at, deleted_at = null where public.sync_sale_adjustment_transition_allowed(stored.status, excluded.status); insert into public.sale_adjustment_items',
    );
    // (5) after the write: the stored record IS the payload, or nothing is written
    swap(
      "if p_aggregate_type = 'SALE_ADJUSTMENT' then adjustment_breach := public.sync_sale_adjustment_breach(p_business_id, adjustment_sale_id);",
      "if p_aggregate_type = 'SALE_ADJUSTMENT' then select * into stored_adjustment from public.sale_adjustments where business_id = p_business_id and id = p_aggregate_id; if public.sync_sale_adjustment_payload_differs(p_business_id, p_aggregate_id, p_payload) or stored_adjustment.deleted_at is not null or stored_adjustment.status is distinct from (p_payload ->> 'status') or stored_adjustment.refunded_at is distinct from (p_payload ->> 'refunded_at')::timestamptz or stored_adjustment.settled_at is distinct from (p_payload ->> 'settled_at')::timestamptz or stored_adjustment.voided_at is distinct from (p_payload ->> 'voided_at')::timestamptz then adjustment_breach := jsonb_build_object( 'status', 'ADJUSTMENT_CONFLICT', 'sale_id', coalesce(stored_adjustment.sale_id, adjustment_sale_id), 'reason', 'IMMUTABLE' ); raise exception 'sync: adjustment identity conflict' using errcode = 'SC423'; end if; end if; if p_aggregate_type = 'SALE_ADJUSTMENT' then adjustment_breach := public.sync_sale_adjustment_breach(p_business_id, adjustment_sale_id, adjustment_inserted_id);",
    );
    expect(next).toBe(expected);
  });

  it('takes the identity lock before any row lock', () => {
    const next = functionBody(code, PUSH);
    const advisory = next.indexOf('pg_advisory_xact_lock(');
    expect(advisory).toBeGreaterThan(-1);
    expect(advisory).toBeLessThan(next.indexOf('from public.sales s'));
    expect(advisory).toBeLessThan(next.indexOf('for update'));
    expect(advisory).toBeGreaterThan(next.indexOf('business_mutation_is_entitled(p_business_id)'));
  });

  it('the identity comparison is exactly the 20261011120000 immutability check, status excepted', () => {
    const previous = normalize(functionBody(read(PREVIOUS_PUSH), PUSH));
    const inline = previous.slice(
      previous.indexOf("stored_adjustment.sale_id is distinct from (p_payload ->> 'sale_id')"),
      previous.indexOf(") then return jsonb_build_object( 'status', 'ADJUSTMENT_CONFLICT', 'sale_id', stored_adjustment.sale_id, 'reason', 'IMMUTABLE' );"),
    )
      .replace(" or not public.sync_sale_adjustment_transition_allowed(stored_adjustment.status, p_payload ->> 'status')", '')
      .replaceAll('stored_adjustment.', 'a.')
      .replace('where i.business_id = p_business_id and i.adjustment_id = p_aggregate_id', 'where i.business_id = a.business_id and i.adjustment_id = a.id');
    const helper = normalize(functionBody(code, 'create or replace function public.sync_sale_adjustment_payload_differs('));
    expect(helper).toContain(`select coalesce(( select ${inline.trim()} ) from public.sale_adjustments a where a.business_id = p_business_id and a.id = p_adjustment_id ), true);`);
  });

  it('leaves the pull and the count RPCs as they are', () => {
    for (const name of ['sync_pull_business_aggregates', 'sync_count_business_aggregates']) {
      expect(code).not.toContain(`function public.${name}(`);
    }
  });
});
