// BeautIzzy — the booking creation migration stays bounded (source-level
// guard, like the other `*-migration.test.ts`): ONE forward-only migration
// sorting last; ONE entry point granted to the website (service_role), keyed
// by the public slug and trusting nothing else; a switch that ships DISABLED;
// the lock, the idempotency key and THE Sprint 3B slot rule in that order;
// an Appointment written the way a device writes one; a Client that is never
// modified and never given a consent; the offline sync left exactly as it
// is; and no caller in the website yet. The behavior — concurrency included —
// is verified against a real PostgreSQL (supabase/README.md › Online booking
// creation).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { currentStaffMemberId } from '@/features/appointments/current-staff-member';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261018120000_create_online_booking_creation.sql';

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

/** Position of each fragment inside a text, in the order given; -1 when one is missing. */
function positions(text: string, fragments: readonly string[]): number[] {
  return fragments.map((fragment) => text.indexOf(fragment));
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isFile() ? [path] : listFiles(path);
  });
}

describe('Online booking creation migration', () => {
  it('is ONE forward-only migration sorting right after the availability one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe('20261017120000_create_online_booking_availability.sql');
    expect(names.filter((name) => name.includes('booking_creation'))).toEqual([MIGRATION_NAME]);
  });

  it('adds one table, one trigger and one disabled switch — and replaces ONE existing function', () => {
    expect([...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual(['online_bookings']);
    expect(code).not.toMatch(/\balter table public\.(?!online_bookings\b)/);
    expect([...code.matchAll(/\bdrop (\w+) [^;]*;/g)].map((m) => m[0])).toEqual([
      'drop trigger if exists clients_online_booking_reattach on public.clients;',
    ]);
    expect([...code.matchAll(/create trigger (\w+)/g)].map((m) => m[1])).toEqual(['clients_online_booking_reattach']);
    expect(code).not.toMatch(/create policy|storage\.|\btruncate\b|delete from/i);

    const replaced = createdFunctions.filter((name) => new RegExp(`function public\\.${name}\\(`).test(earlier));
    expect(replaced).toEqual(['online_booking_busy_intervals']);
    for (const name of createdFunctions) expect(name).toMatch(/^online_booking_/);
    expect(createdFunctions).toHaveLength(16);

    // The switch: one row, disabled, never flipped by a re-run; nothing else is enabled.
    expect(code).toMatch(/values \(\s*'ONLINE_BOOKING_CREATION',\s*false,[^;]*on conflict \(flag\) do nothing;/);
    expect(code).not.toMatch(/update public\.business_booking_profiles|insert into public\.business_bookable_services/);
    expect(code).not.toMatch(/online_booking_set_(creation|publication)_enabled\(true\)/);
  });

  it('leaves the offline sync exactly as it is', () => {
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|sync_count_business_aggregates/);
    expect(code).not.toMatch(/sync_aggregate_before_write|sync_child_touch_parent/);
    // No column is added to a synced table: the Appointment has no origin field.
    expect(code).not.toMatch(/add column/i);
  });

  it('grants ONE function to the website and ONE read to the owner — nothing to anon', () => {
    const grants = [...code.matchAll(/grant ([\w ,]+) on (function|table) public\.(\w+)[^;]* to ([\w, ]+);/g)].map(
      (m) => `${m[3]}:${m[4].trim()}`,
    );
    expect(grants).toEqual([
      'online_booking_create_booking:service_role',
      'online_booking_read_conflicts:authenticated',
    ]);
    expect(code).not.toMatch(/\bto [\w, ]*\banon\b/);
    expect(code).toMatch(/alter table public\.online_bookings enable row level security;/);
    expect(code).toMatch(/revoke all on table public\.online_bookings from public, anon, authenticated, service_role;/);
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

  it('accepts a slug, a service, an instant, a contact and a key — nothing the server must decide', () => {
    const entry = body('online_booking_create_booking');
    expect(entry).toMatch(
      /online_booking_create_booking\(\s*p_slug text,\s*p_service_id text,\s*p_starts_at timestamptz,\s*p_first_name text,\s*p_last_name text,\s*p_email text,\s*p_phone text,\s*p_idempotency_key text\s*\)/,
    );
    expect(entry).not.toMatch(/p_business_id|p_staff|p_duration|p_price|p_phases|p_status|p_client_id/);
    expect(entry).toMatch(/select public\.online_booking_book\([^;]*p_idempotency_key, now\(\)\);/);
    expect(body('online_booking_book')).not.toMatch(/\bnow\(\)|current_date|localtimestamp|clock_timestamp/);
  });

  it('stamps the very staff identifier of the app', () => {
    expect(body('online_booking_staff_member_id')).toContain(`select '${currentStaffMemberId}'::text;`);
    expect(body('online_booking_book')).toMatch(/public\.online_booking_staff_member_id\(\)/);
  });

  it('decides in order: switch, request, slug, lock, key, publication, service, slot — then writes', () => {
    const rule = body('online_booking_book');
    const order = positions(rule, [
      "current_setting('transaction_isolation') <> 'read committed'",
      'if not public.online_booking_creation_enabled() then',
      'public.online_booking_request_issue(',
      'where p.slug = v_slug;',
      "set_config('lock_timeout', '3s', true)",
      'select p.slug, p.time_zone into v_locked_slug, v_time_zone',
      'for update;',
      'b.idempotency_key = p_idempotency_key;',
      'if v_locked_slug is distinct from v_slug then',
      'public.online_booking_may_be_public(v_business_id, p_now)',
      'public.online_booking_bookable_services(v_business_id, v_service_id)',
      'public.online_booking_slot_is_available(v_business_id, v_service.id, p_starts_at, p_now)',
      'public.online_booking_find_client(',
      'insert into public.appointments',
      'insert into public.appointment_items',
      'insert into public.appointment_phases',
      'insert into public.online_bookings',
    ]);
    expect(order.every((position) => position > -1)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    // The lock is the profile row the owner's own state changes lock.
    expect(rule).toMatch(/from public\.business_booking_profiles p\s+where p\.business_id = v_business_id\s+for update;/);
    // Before the wait only the Business id is resolved: the address and the
    // time zone are read from the locked row, never from a stale copy.
    expect(rule).toMatch(/select p\.business_id into v_business_id\s+from public\.business_booking_profiles p\s+where p\.slug = v_slug;/);
    expect([...rule.matchAll(/into [\w, ]*v_time_zone/g)]).toHaveLength(1);
    expect(rule).toMatch(/when lock_not_available then[\s\S]*'status', 'BUSY'/);
    expect(rule).toMatch(/p\.published and p\.booking_enabled\)\s+or not public\.online_booking_may_be_public/);
    expect(code).not.toMatch(/business_mutation_is_entitled|communications_is_entitled/);
  });

  it('reuses THE Sprint 3B slot rule instead of computing availability again', () => {
    const rule = body('online_booking_book');
    expect(rule).not.toMatch(/generate_series|online_booking_working_intervals|online_booking_busy_intervals|online_booking_rules/);
    expect(earlier).toMatch(/create or replace function public\.online_booking_slot_is_available\(/);
    expect(createdFunctions).not.toContain('online_booking_slot_is_available');
    expect(createdFunctions).not.toContain('online_booking_compute_slots');
  });

  it('writes the Appointment the way a device does', () => {
    const rule = body('online_booking_book');
    expect(rule).toMatch(/v_appointment_id := gen_random_uuid\(\)::text;/);
    expect(rule).toMatch(/v_item_id := v_appointment_id \|\| '-item-0';/);
    expect(rule).toMatch(/p_starts_at, 'SCHEDULED', public\.online_booking_appointment_note\(\)\);/);
    // The catalog phases under their own ids, renumbered from 0 in order.
    expect(rule).toMatch(/select v_business_id, v_appointment_id, v_item_id, ph\.id,\s+\(row_number\(\) over \(order by ph\.position, ph\.id\)\)::integer - 1,/);
    expect(rule).toMatch(/v_service\.name, v_service\.type, v_service\.price_cents\);/);
    // No payment, discount, reminder flag or status other than SCHEDULED is ever written.
    expect(rule).not.toMatch(/paid_at|card_amount_cents|discount_|client_reminder_enabled|CONFIRMED|COMPLETED/);
  });

  it('creates a Client with identity and contact only, and never rewrites an existing one', () => {
    const inserts = [...code.matchAll(/insert into public\.clients \(([^)]*)\)/g)].map((m) => m[1]);
    expect(inserts).toEqual([
      'business_id, id, first_name, last_name, phone, email',
      'business_id, id, first_name, last_name, phone, email',
    ]);
    expect(code).not.toMatch(/update public\.clients/);
    expect(code).not.toMatch(/sms_marketing_consent|birthday|photo_path/);

    const match = body('online_booking_find_client');
    expect(match).toMatch(/where c\.business_id = p_business_id\s+and c\.deleted_at is null\s+and c\.archived_at is null/);
    expect(match).toMatch(/lower\(btrim\(c\.email\)\) = lower\(btrim\(p_email\)\)/);
    expect(match).toMatch(/for share;/);
  });

  it('validates text with the characters the device trims, spelled out as escapes', () => {
    const backslash = String.fromCharCode(92);
    const clean = body('online_booking_clean_text');
    for (const escape of ['u00A0', 'u1680', 'u2000-', 'u2028', 'u2029', 'u202F', 'u205F', 'u3000', 'uFEFF']) {
      expect(clean).toContain(`${backslash}${escape}`);
    }
    // Never as raw invisible characters in the source.
    const invisible = [0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff, 0x200b, 0x202e];
    for (const codePoint of invisible) expect(migration.includes(String.fromCharCode(codePoint))).toBe(false);

    const issue = body('online_booking_request_issue');
    expect(issue).toMatch(/public\.communications_is_valid_email\(/);
    expect(issue).toMatch(/public\.communications_client_phone_e164\(p_phone\) is null/);
    expect(issue).toMatch(/p_idempotency_key !~ '\^\[A-Za-z0-9_-\]\{16,128\}\$'/);
    expect(issue).not.toMatch(/\bfrom public\./);
  });

  it('answers a reference, the service and times only', () => {
    const answer = body('online_booking_booking_json');
    const keys = [...answer.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]);
    expect([...new Set(keys)].sort()).toEqual(
      [
        'booking',
        'duration_minutes',
        'ends_at',
        'id',
        'local_date',
        'local_time',
        'name',
        'reference',
        'service',
        'starts_at',
        'status',
        'time_zone',
      ].sort(),
    );
    expect(answer).not.toMatch(/customer_|appointment_id|business_id|idempotency|request_hash|price/);
  });

  it('measures every appointment: no lookback bound, the same occupancy rule as the conflicts', () => {
    const busy = body('online_booking_busy_intervals');
    expect(busy).not.toMatch(/interval '\d+ days?'/);
    expect(busy).not.toMatch(/a\.start_at >=/);
    expect(busy).toMatch(/and a\.start_at < p_to/);
    for (const rule of [busy, body('online_booking_conflicts')]) {
      expect(rule).toMatch(/a\.status not in \('CANCELLED', 'NO_SHOW'\)/);
      expect(rule).toMatch(/a\.deleted_at is null/);
      expect(rule).toMatch(/c\.deleted_at is null/);
      expect(rule).not.toMatch(/requires_staff|staff_member_id/);
    }
    // Derived at each call: the migration stores no conflict.
    expect(code).not.toMatch(/create table if not exists public\.\w*conflict/);
    expect(body('online_booking_read_conflicts')).toMatch(/if not public\.is_business_owner\(p_business_id\) then/);
  });

  it('moves an online booking off a deleted Client, only when a tombstone appears', () => {
    expect(code).toMatch(
      /create trigger clients_online_booking_reattach\s+after update of deleted_at on public\.clients\s+for each row\s+when \(old\.deleted_at is null and new\.deleted_at is not null\)/,
    );
    const reattach = body('online_booking_reattach_deleted_client');
    expect(reattach).toMatch(/security definer/);
    expect(reattach).toMatch(/and a\.client_id = new\.id\s+and a\.deleted_at is null/);
    expect(reattach).toMatch(/from public\.online_bookings b/);
    // One new Client per distinct contact; each Appointment moves to the one
    // built from ITS booking — never one booking's details on another's.
    expect(reattach).toMatch(
      /group by b\.customer_first_name, b\.customer_last_name, b\.customer_email, b\.customer_phone/,
    );
    expect(reattach).toMatch(
      /and b\.customer_first_name = v_contact\.customer_first_name\s+and b\.customer_last_name = v_contact\.customer_last_name\s+and b\.customer_email = v_contact\.customer_email\s+and b\.customer_phone = v_contact\.customer_phone;/,
    );
    expect(reattach).not.toMatch(/limit 1/);
  });

  it('has ONE caller in the website — a server-only module — and none in the app', () => {
    // Sprint 3C-B: the public booking flow calls the entry point from ONE
    // server-only module; no browser code, no other module, never the
    // internal transaction itself.
    const webSources = listFiles(join(ROOT, 'web', 'src')).filter(
      (path) => /\.(ts|tsx)$/.test(path) && !/[\\/]__tests__[\\/]/.test(path),
    );
    expect(webSources.length).toBeGreaterThan(0);
    // Code only: documentation may name the function.
    const codeOf = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const callers = webSources.filter((path) => /online_booking_create_booking/.test(codeOf(path)));
    expect(callers.map((path) => path.slice(ROOT.length + 1).replace(/\\/g, '/')).sort()).toEqual([
      'web/src/features/booking/create-booking.ts',
      'web/src/features/booking/supabase-rpc.ts',
    ]);
    for (const path of callers) {
      const source = readFileSync(path, 'utf8');
      expect(source).toMatch(/^import "server-only";/m);
      expect(source).not.toMatch(/^["']use client["']/m);
    }
    for (const path of webSources) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/online_booking_book\b/);
    }
    const gateway = readFileSync(join(ROOT, 'src', 'infrastructure', 'supabase', 'online-booking-gateway.ts'), 'utf8');
    expect(gateway).not.toMatch(/online_booking_create_booking|online_booking_book\b|online_bookings/);
  });
});
