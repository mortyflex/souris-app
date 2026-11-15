// BeautIzzy — the availability engine migration stays bounded (source-level
// guard, like the other `*-migration.test.ts`): ONE forward-only migration
// sorting last that only ADDS objects and writes nothing it reads; ONE entry
// point granted to the website (service_role), keyed by the public slug; the
// Sprint 3A contract still granted to nobody; THE rules in one place; the
// conservative blocking rule of the domain (CANCELLED / NO_SHOW free the
// time, processing blocks); the public answer free of private fields; and
// nothing of it in the offline sync. The behavior is verified against an
// in-process Postgres (supabase/README.md › Online booking availability).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261017120000_create_online_booking_availability.sql';

const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');
const earlier = names
  .filter((name) => name < MIGRATION_NAME)
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  .join('\n');

const createdFunctions = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);

function body(name: string): string {
  const start = code.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$$;', start) + 3);
}

describe('Online booking availability migration', () => {
  it('is ONE forward-only migration sorting right after the working hours one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe('20261016120000_create_online_booking_working_hours.sql');
    expect(names.filter((name) => name.includes('availability'))).toEqual([MIGRATION_NAME]);
  });

  it('only adds objects and writes no row: it reads the calendar, it never books', () => {
    expect(code).not.toMatch(/\balter table public\.(?!business_bookable_services\b)/);
    expect(code).not.toMatch(/\bdrop (table|function|column|index|constraint|type|policy|trigger)\b/i);
    expect(code).not.toMatch(/\b(insert into|update public\.|delete from|truncate)\b/i);
    expect([...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'business_bookable_services',
    ]);
    expect(createdFunctions).toHaveLength(8);
    for (const name of createdFunctions) {
      expect(name).toMatch(/^online_booking_/);
      expect(earlier).not.toMatch(new RegExp(`function public\\.${name}\\(`));
    }
    expect(code).not.toMatch(/create (policy|trigger)|storage\.|server_feature_flags/i);
  });

  it('grants ONE function, to the website only, and keeps the Sprint 3A contract ungranted', () => {
    const grants = [...code.matchAll(/grant ([\w ,]+) on (function|table) public\.(\w+)[^;]* to ([\w, ]+);/g)].map(
      (m) => `${m[3]}:${m[4].trim()}`,
    );
    expect(grants).toEqual(['online_booking_public_availability:service_role']);
    expect(code).not.toMatch(/\bto [\w, ]*\b(anon|authenticated)\b/);
    expect(code).not.toMatch(/grant [^;]*online_booking_working_intervals/);
    expect(code).toMatch(/alter table public\.business_bookable_services enable row level security;/);
    expect(code).toMatch(
      /revoke all on table public\.business_bookable_services from public, anon, authenticated, service_role;/,
    );
  });

  it('pins the search_path of every function and revokes each from every API role', () => {
    const definitions = code.split(/create or replace function /).slice(1);
    expect(definitions).toHaveLength(createdFunctions.length);
    for (const definition of definitions) {
      expect(definition.slice(0, definition.indexOf('as $$'))).toMatch(/set search_path = ''/);
    }
    for (const name of createdFunctions) {
      expect(code).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`),
      );
    }
  });

  it('keys the public entry point by the slug and gates it on THE publication rule AND open bookings', () => {
    const entry = body('online_booking_public_availability');
    expect(entry).toMatch(/online_booking_public_availability\(\s*p_slug text,\s*p_service_id text default null,\s*p_date date default null\s*\)/);
    expect(entry).not.toMatch(/p_business_id|p_staff/);
    expect(entry).toMatch(/p\.slug = lower\(btrim\(p_slug\)\)/);
    expect(entry).toMatch(/and p\.published\s+and p\.booking_enabled\s+and public\.online_booking_may_be_public\(p\.business_id\)/);
    expect(entry).toMatch(/\bstable\b/);
    expect(code).not.toMatch(/business_mutation_is_entitled|communications_is_entitled/);
  });

  it('holds THE default rules in one place', () => {
    expect(body('online_booking_rules')).toMatch(/select 15, 24 \* 60, 30, 12 \* 60;/);
    for (const name of ['online_booking_compute_slots', 'online_booking_window', 'online_booking_bookable_services']) {
      expect(body(name)).toMatch(/online_booking_rules\(\)/);
    }
  });

  it('blocks like the domain: CANCELLED and NO_SHOW free the time, deleted rows never count, the full span blocks', () => {
    const busy = body('online_booking_busy_intervals');
    expect(busy).toMatch(/a\.status not in \('CANCELLED', 'NO_SHOW'\)/);
    expect(busy).toMatch(/a\.deleted_at is null/);
    expect(busy).toMatch(/c\.deleted_at is null/);
    // Every phase counts, processing included: no filter on requires_staff (conservative MVP).
    expect(busy).not.toMatch(/requires_staff/);
    expect(busy).toMatch(/from public\.calendar_blocks c/);
    // One professional per Business: no staff filter is accepted from the outside.
    expect(busy).not.toMatch(/staff_member_id/);
  });

  it('builds slots from working intervals, wall-clock candidates and exclusive ends', () => {
    const rule = body('online_booking_compute_slots');
    expect(rule).toMatch(/online_booking_working_intervals\(p_business_id, p_date, p_date\)/);
    expect(rule).toMatch(/online_booking_busy_intervals\(/);
    expect(rule).toMatch(/at time zone v_time_zone\) at time zone v_time_zone\s+= p_date \+ make_interval/);
    expect(rule).toMatch(/w\.work_start <= c\.slot_start\s+and c\.slot_start \+ make_interval\(mins => v_duration\) <= w\.work_end/);
    expect(rule).toMatch(/b\.busy_start < c\.slot_start \+ make_interval\(mins => v_duration\)\s+and c\.slot_start < b\.busy_end/);
    expect(rule).toMatch(/c\.slot_start >= p_now \+ make_interval\(mins => v_notice_minutes\)/);
    expect(rule).not.toMatch(/now\(\)|current_date|localtimestamp|current_setting/);
  });

  it('answers service names and times only — never a Business, client, appointment or amount', () => {
    const answer = body('online_booking_availability_json');
    const keys = [...answer.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]);
    expect([...new Set(keys)].sort()).toEqual(
      [
        'date',
        'duration_minutes',
        'ends_at',
        'first_date',
        'id',
        'last_date',
        'local_time',
        'name',
        'service',
        'services',
        'slot_minutes',
        'slots',
        'starts_at',
        'status',
        'time_zone',
      ].sort(),
    );
    expect(answer).not.toMatch(/client|notes|price|staff|business_id'|owner/);
    expect(answer).toMatch(/'YYYY-MM-DD"T"HH24:MI:SS"Z"'/);
  });

  it('stays outside the offline sync', () => {
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|sync_count_business_aggregates/);
    const syncSources = ['src/persistence/sync/remote-snapshot.ts', 'src/persistence/sync/remote-gateway.ts']
      .map((path) => readFileSync(join(ROOT, path), 'utf8'))
      .join('\n');
    expect(syncSources).not.toMatch(/bookable|online_booking|business_bookable_services/i);
  });
});
