// BeautIzzy — the request-limit migration of the public booking flow stays
// bounded (source-level guard, like the other `*-migration.test.ts`): ONE
// forward-only migration sorting right after the booking-creation one; ONE
// table of opaque counters that can never hold an IP address, an email or a
// slug; ONE function, granted to service_role only; nothing existing touched.
// The behavior — concurrent callers included — is verified against a real
// PostgreSQL (supabase/README.md › Online booking request limits).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261019120000_create_online_booking_request_limits.sql';

const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');

describe('Online booking request-limits migration', () => {
  it('is ONE forward-only migration sorting right after the booking-creation one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe('20261018120000_create_online_booking_creation.sql');
    expect(names.filter((name) => name.includes('request_limits'))).toEqual([MIGRATION_NAME]);
  });

  it('adds one table and one function, and touches nothing else', () => {
    expect([...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'online_booking_request_counters',
    ]);
    expect([...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])).toEqual([
      'online_booking_take_request_quota',
    ]);
    expect(code).not.toMatch(/\balter table public\.(?!online_booking_request_counters\b)/);
    expect(code).not.toMatch(/\bdrop\s+(table|function|policy|trigger)\b/);
    expect(code).not.toMatch(/\bcreate trigger\b|\bcreate policy\b|server_feature_flags/);
  });

  it('stores opaque keys only — never an address, an email or a slug', () => {
    const table = code.slice(code.indexOf('create table if not exists public.online_booking_request_counters'));
    const columns = table.slice(0, table.indexOf(');'));
    expect(columns).toMatch(/counter_key text not null check \(counter_key ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(columns).not.toMatch(/\b(ip|address|email|slug|business_id|phone|user_agent)\b/i);
  });

  it('locks the table and grants the function to service_role only', () => {
    expect(code).toMatch(/alter table public\.online_booking_request_counters enable row level security;/);
    expect(code).toMatch(
      /revoke all on table public\.online_booking_request_counters from public, anon, authenticated, service_role;/,
    );
    expect(code).not.toMatch(/grant [a-z, ]+ on table/);
    expect(code).toMatch(
      /revoke all on function public\.online_booking_take_request_quota\(jsonb\) from public, anon, authenticated, service_role;\s+grant execute on function public\.online_booking_take_request_quota\(jsonb\) to service_role;/,
    );
    expect([...code.matchAll(/grant execute on function/g)]).toHaveLength(1);
    const fn = code.slice(code.indexOf('function public.online_booking_take_request_quota('));
    expect(fn).toMatch(/security definer\s+set search_path = ''/);
  });

  it('counts every counter of a request, in key order, after validating them all', () => {
    const fn = code.slice(code.indexOf('function public.online_booking_take_request_quota('), code.indexOf('$$;', code.indexOf('function public.online_booking_take_request_quota(')));
    expect(fn.indexOf("raise exception 'online booking: malformed request counter'")).toBeLessThan(fn.indexOf('insert into'));
    expect(fn).toMatch(/order by c\.value ->> 'key'/);
    expect(fn).toMatch(/on conflict \(counter_key, window_started_at\)/);
    expect(fn).toMatch(/for update skip locked/);
  });

  it('is called by ONE server-only module of the website, never by the app', () => {
    const protection = readFileSync(join(ROOT, 'web', 'src', 'features', 'booking', 'request-protection.ts'), 'utf8');
    expect(protection).toMatch(/^import "server-only";/m);
    expect(protection).toMatch(/online_booking_take_request_quota/);
    expect(protection).toMatch(/createHmac\("sha256"/);
    const gateway = readFileSync(join(ROOT, 'src', 'infrastructure', 'supabase', 'online-booking-gateway.ts'), 'utf8');
    expect(gateway).not.toMatch(/online_booking_take_request_quota|online_booking_request_counters/);
  });
});
