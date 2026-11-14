// BeautIzzy — the online booking profile migration stays bounded (source-level
// guard, like the other `*-migration.test.ts`): ONE forward-only migration
// sorting last that only ADDS objects — no existing table altered, no sync RPC
// or existing function replaced, no existing policy dropped, no existing flag
// touched and its own flag shipped disabled; nothing granted to `anon`; the
// public read reserved to service_role; publication tied to THE existing Plus
// access rule and never to the mutation rule that is permissive while its
// switch is off. The behavior is verified against an in-process Postgres
// (supabase/README.md › Online booking profiles).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261015120000_create_online_booking_profiles.sql';

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');

const createdFunctions = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);

describe('Online booking profiles migration', () => {
  it('is ONE forward-only migration sorting after every earlier one', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    expect(names).toContain(MIGRATION_NAME);
    expect(names.filter((name) => name < MIGRATION_NAME)).toHaveLength(names.indexOf(MIGRATION_NAME));
    expect(names.indexOf(MIGRATION_NAME)).toBeGreaterThanOrEqual(29);
  });

  it('only adds objects: installed builds keep working unchanged', () => {
    expect(code).not.toMatch(/alter table public\.(?!business_booking_profiles\b)/);
    expect(code).not.toMatch(/\bdrop (table|function|column|index|constraint|type)\b/i);
    expect(code).not.toMatch(/\b(delete from|truncate)\b/i);
    expect(code).not.toMatch(/update public\.(?!business_booking_profiles\b)/);
    expect([...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'business_booking_profiles',
    ]);
    // Every function it defines is new: none of them is an existing sync / communication / subscription object.
    expect(createdFunctions.length).toBeGreaterThan(0);
    for (const name of createdFunctions) {
      expect(name).toMatch(/^(online_booking_|business_booking_profiles_)/);
    }
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|scheduled_communications/);
  });

  it('touches only its own Storage policies and leaves the private bucket alone', () => {
    const policies = [...code.matchAll(/(?:drop policy if exists|create policy) "([^"]+)"/g)].map((m) => m[1]);
    expect(policies.length).toBe(6);
    for (const name of policies) expect(name).toMatch(/^business-public-media: owner can (select|insert|delete)$/);
    expect(code).not.toMatch(/create policy[^;]*for update/i);
    expect(code).toMatch(
      /values \('business-public-media', 'business-public-media', true, 2097152, array\['image\/jpeg'\]\)/,
    );
    expect(code).not.toMatch(/'business-media'/);
    expect(code).not.toMatch(/update storage\.buckets/);
  });

  it('ships its switch disabled and flips no existing switch', () => {
    expect(code).toMatch(/'ONLINE_BOOKING_PUBLICATION',\s*false,/);
    expect(code).toMatch(/on conflict \(flag\) do nothing/);
    expect(code).not.toMatch(/COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT|BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT/);
    expect(code).not.toMatch(/set_entitlement_enforcement/);
  });

  it('gates publication on THE verified Plus access rule, never on the permissive mutation rule', () => {
    expect(code).toMatch(/public\.subscription_has_plus_access\(b\.owner_user_id/);
    expect(code).not.toMatch(/business_mutation_is_entitled|communications_is_entitled/);
    const setState = code.slice(code.indexOf('function public.online_booking_set_state'));
    expect(setState).toMatch(/online_booking_publication_enabled\(\)/);
    expect(setState).toMatch(/online_booking_may_be_public\(p_business_id\)/);
    const publicRead = code.slice(
      code.indexOf('function public.online_booking_public_profile'),
      code.indexOf('comment on function public.online_booking_public_profile'),
    );
    expect(publicRead).toMatch(/p\.published\s+and public\.online_booking_may_be_public\(p\.business_id\)/);
  });

  it('checks ownership first in every owner RPC', () => {
    for (const name of ['online_booking_read_profile', 'online_booking_update_profile', 'online_booking_set_state']) {
      const body = code.slice(code.indexOf(`function public.${name}(`));
      const begin = body.indexOf('begin');
      expect(body.slice(begin, begin + 140)).toMatch(/if not public\.is_business_owner\(p_business_id\) then/);
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

  it('grants nothing to anon, the owner RPCs to authenticated, the public read to service_role only', () => {
    const grants = [...code.matchAll(/grant ([\w ,]+) on (function|table) public\.(\w+)[^;]* to ([\w, ]+);/g)].map(
      (m) => `${m[3]}:${m[4].trim()}`,
    );
    expect(grants.sort()).toEqual(
      [
        'online_booking_is_media_owner:authenticated',
        'online_booking_public_profile:service_role',
        'online_booking_read_profile:authenticated',
        'online_booking_set_state:authenticated',
        'online_booking_update_profile:authenticated',
      ].sort(),
    );
    expect(code).not.toMatch(/\bto [\w, ]*\banon\b/);
    expect(code).toMatch(/alter table public\.business_booking_profiles enable row level security;/);
    expect(code).toMatch(
      /revoke all on table public\.business_booking_profiles from public, anon, authenticated, service_role;/,
    );
    expect(code).not.toMatch(/create policy[^;]*on public\./);
  });

  it('returns only the approved public fields to the website', () => {
    const publicRead = code.slice(
      code.indexOf('function public.online_booking_public_profile'),
      code.indexOf('comment on function public.online_booking_public_profile'),
    );
    const keys = [...publicRead.matchAll(/'(\w+)', /g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(
      ['address', 'booking_enabled', 'cover_path', 'description', 'email', 'logo_path', 'name', 'phone', 'slug', 'time_zone'].sort(),
    );
    expect(publicRead).not.toMatch(/business_id'|owner|media_id'|plus_access|publication_open/);
  });

  it('stays outside the offline sync: the app has no aggregate for it', () => {
    const syncSources = ['src/persistence/sync/remote-snapshot.ts', 'src/persistence/sync/remote-gateway.ts']
      .map((path) => readFileSync(join(ROOT, path), 'utf8'))
      .join('\n');
    expect(syncSources).not.toMatch(/booking/i);
  });
});
