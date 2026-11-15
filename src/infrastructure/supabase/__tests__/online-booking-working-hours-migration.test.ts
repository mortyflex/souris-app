// BeautIzzy — the working hours migration stays bounded (source-level guard,
// like the other `*-migration.test.ts`): ONE forward-only migration sorting
// last that only ADDS objects — no existing table altered, no existing
// function replaced, no policy, no Storage, no flag; nothing granted to
// `anon` or to the website; the owner RPCs ownership-checked; THE validation
// rule shared by the CHECK constraint and the save RPC, with the same limits
// as the app's domain; the engine contract granted to no API role and
// resolving wall-clock minutes in the Business time zone; and nothing of it
// in the offline sync or the device database. The behavior is verified
// against an in-process Postgres (supabase/README.md › Online booking working hours).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { MINUTES_PER_DAY, WORKING_INTERVALS_MAX_PER_DAY } from '@/domain/online-booking';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261016120000_create_online_booking_working_hours.sql';

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

describe('Online booking working hours migration', () => {
  it('is ONE forward-only migration sorting right after the booking profile one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe('20261015120000_create_online_booking_profiles.sql');
    expect(names.filter((name) => name.includes('working_hours'))).toEqual([MIGRATION_NAME]);
  });

  it('only adds objects: installed builds keep working unchanged', () => {
    expect(code).not.toMatch(/\balter table public\.(?!business_working_hours\b)/);
    expect(code).not.toMatch(/\bdrop (table|function|column|index|constraint|type|policy)\b/i);
    expect(code).not.toMatch(/\b(delete from|truncate)\b/i);
    expect(code).not.toMatch(/\bupdate public\./);
    expect([...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'business_working_hours',
    ]);
    expect(createdFunctions).toHaveLength(6);
    for (const name of createdFunctions) {
      expect(name).toMatch(/^(online_booking_|business_working_hours_)/);
      // A NEW function: no earlier migration defines it, so nothing existing is replaced.
      expect(earlier).not.toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('touches no policy, no Storage, no flag and no existing switch', () => {
    expect(code).not.toMatch(/create policy|storage\./i);
    expect(code).not.toMatch(/server_feature_flags|_ENFORCEMENT|ONLINE_BOOKING_PUBLICATION/);
  });

  it('writes the booking profile only to make sure its row (the time zone) exists', () => {
    const profileWrites = [...code.matchAll(/insert into public\.business_booking_profiles[^;]*;/g)].map((m) =>
      m[0].replace(/\s+/g, ' '),
    );
    expect(profileWrites).toEqual([
      'insert into public.business_booking_profiles (business_id) values (p_business_id) on conflict (business_id) do nothing;',
      'insert into public.business_booking_profiles (business_id) values (p_business_id) on conflict (business_id) do nothing;',
    ]);
    expect(code).not.toMatch(/online_booking_public_profile|online_booking_set_state|online_booking_update_profile/);
  });

  it('checks ownership first in both owner RPCs', () => {
    for (const name of ['online_booking_read_working_hours', 'online_booking_save_working_day']) {
      const definition = body(name);
      const begin = definition.indexOf('begin');
      expect(definition.slice(begin, begin + 140)).toMatch(/if not public\.is_business_owner\(p_business_id\) then/);
    }
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

  it('grants the two owner RPCs to authenticated and nothing else to anyone', () => {
    const grants = [...code.matchAll(/grant ([\w ,]+) on (function|table) public\.(\w+)[^;]* to ([\w, ]+);/g)].map(
      (m) => `${m[3]}:${m[4].trim()}`,
    );
    expect(grants.sort()).toEqual([
      'online_booking_read_working_hours:authenticated',
      'online_booking_save_working_day:authenticated',
    ]);
    expect(code).not.toMatch(/\bto [\w, ]*\b(anon|service_role)\b/);
    expect(code).toMatch(/alter table public\.business_working_hours enable row level security;/);
    expect(code).toMatch(
      /revoke all on table public\.business_working_hours from public, anon, authenticated, service_role;/,
    );
  });

  it('validates every stored day with THE rule, whoever writes it', () => {
    expect(code).toMatch(
      /constraint business_working_hours_valid_day\s+check \(public\.online_booking_working_day_issue\(is_open, intervals\) is null\)/,
    );
    expect(body('online_booking_save_working_day')).toMatch(/public\.online_booking_working_day_issue\(p_is_open, v_sorted\)/);
    expect(body('online_booking_working_day_issue')).toMatch(/\bimmutable\b/);
  });

  it('holds the same limits as the domain of the app', () => {
    const rule = body('online_booking_working_day_issue');
    expect(rule).toMatch(new RegExp(`v_count > ${WORKING_INTERVALS_MAX_PER_DAY}\\b`));
    expect(rule).toMatch(new RegExp(`v_end > ${MINUTES_PER_DAY}\\b`));
    // Ends are exclusive: an interval may start where the previous one ends.
    expect(rule).toMatch(/if v_start < v_previous_end then\s+return 'OVERLAP';/);
    expect(rule).toMatch(/v_end <= v_start/);
  });

  it('resolves wall-clock minutes in the Business time zone, by the LOCAL date, in the engine contract only', () => {
    const contract = body('online_booking_working_intervals');
    expect(contract.match(/at time zone p\.time_zone/g)).toHaveLength(2);
    expect(contract).toMatch(/extract\(isodow from d\.day\)/);
    // Local dates from an integer series: never a timestamptz series, never the session time zone.
    expect(contract).toMatch(/p_from \+ n as day from generate_series\(0, p_to - p_from\)/);
    expect(contract).not.toMatch(/now\(\)|current_date|localtimestamp|current_setting/);
    // Read-only and bounded.
    expect(contract).toMatch(/\bstable\b/);
    expect(contract).toMatch(/p_to - p_from >= 92/);
    expect(contract).not.toMatch(/\b(insert|update|delete)\b/);
    // Working time only: nothing about appointments, blocks, phases, publication or subscription.
    expect(contract).not.toMatch(/appointment|calendar_block|phase|subscription|published|booking_enabled/);
  });

  it('stays apart from scheduling and from the offline sync', () => {
    expect(code).not.toMatch(/\b(appointments|appointment_items|appointment_phases|calendar_blocks|sales|clients)\b/);
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|sync_count_business_aggregates/);
    const syncSources = ['src/persistence/sync/remote-snapshot.ts', 'src/persistence/sync/remote-gateway.ts']
      .map((path) => readFileSync(join(ROOT, path), 'utf8'))
      .join('\n');
    expect(syncSources).not.toMatch(/working|weekday/i);
    const sourcesUnder = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        if (!statSync(path).isFile()) return name === '__tests__' ? [] : sourcesUnder(path);
        return name.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
      });
    const localSchema = sourcesUnder(join(ROOT, 'src', 'persistence')).join('\n');
    expect(localSchema.length).toBeGreaterThan(0);
    expect(localSchema).not.toMatch(/working_hours|business_working/);
  });
});
