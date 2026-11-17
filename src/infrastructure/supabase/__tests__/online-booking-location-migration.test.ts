// BeautIzzy — the location privacy migration of the public booking page stays
// bounded (source-level guard, like the other `*-migration.test.ts`): ONE
// forward-only migration sorting right after the request-limit one; four
// nullable columns, ONE rule backing a CHECK and the owner save, ONE public
// location shape; the public read never names the legacy free-text address
// again and stays behind the same publication gate; no coordinate, no URL,
// nothing granted to `anon`, and the booking engine untouched. The behavior —
// every publication level, legacy rows, refusals, cross-owner access, leaks —
// is verified against a real PostgreSQL (supabase/README.md › Online booking
// location privacy).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261020120000_add_online_booking_location_privacy.sql';
const PROFILES_MIGRATION_NAME = '20261015120000_create_online_booking_profiles.sql';

const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');
const profilesCode = readFileSync(join(MIGRATIONS_DIR, PROFILES_MIGRATION_NAME), 'utf8').replace(/^\s*--.*$/gm, '');

const createdFunctions = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);

function definition(source: string, name: string): string {
  const start = source.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

function jsonKeys(body: string): string[] {
  return [...body.matchAll(/'(\w+)', /g)].map((m) => m[1]).sort();
}

describe('Online booking location privacy migration', () => {
  it('is ONE forward-only migration sorting right after the request-limit one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe('20261019120000_create_online_booking_request_limits.sql');
    expect(names.filter((name) => name.includes('location_privacy'))).toEqual([MIGRATION_NAME]);
  });

  it('adds four nullable columns without a default and rewrites no row', () => {
    const added = [...code.matchAll(/add column if not exists (\w+) ([^,;]+)[,;]/g)].map((m) => `${m[1]} ${m[2].trim()}`);
    expect(added).toEqual([
      'address_visibility text',
      'address_street text',
      'address_postal_code text',
      'address_city text',
    ]);
    expect(code).not.toMatch(/alter table public\.(?!business_booking_profiles\b)/);
    expect(code).not.toMatch(/\bdrop\s+(table|function|column|index|constraint|type|policy|trigger)\b/i);
    expect(code).not.toMatch(/\b(delete from|truncate)\b/i);
    expect(code).not.toMatch(/\bcreate (table|policy|trigger)\b/);
    // The only row write is the owner's own save, and it never names the legacy free text.
    expect([...code.matchAll(/update public\.(\w+)/g)].map((m) => m[1])).toEqual(['business_booking_profiles']);
    expect(code).not.toMatch(/\baddress\s*=/);
  });

  it('backs a guarded CHECK and the owner save with ONE location rule', () => {
    expect(code).toMatch(
      /if not exists \(\s*select 1 from pg_constraint\s+where conrelid = 'public\.business_booking_profiles'::regclass\s+and conname = 'business_booking_profiles_location_rule'/,
    );
    expect(code).toMatch(
      /check \(public\.online_booking_location_issue\(\s*address_visibility, address_street, address_postal_code, address_city\) is null\)/,
    );
    const save = definition(code, 'online_booking_update_location');
    expect(save).toMatch(/public\.online_booking_location_issue\(p_visibility, v_street, v_postal_code, v_city\)/);
    const rule = definition(code, 'online_booking_location_issue');
    expect(rule).toMatch(/not in \('FULL_ADDRESS', 'CITY_ONLY', 'HIDDEN'\)/);
    expect(rule).toMatch(/p_visibility = 'FULL_ADDRESS' and p_street is null then 'MISSING_STREET'/);
    expect(rule).toMatch(/p_visibility = 'FULL_ADDRESS' and p_postal_code is null then 'MISSING_POSTAL_CODE'/);
    expect(rule).toMatch(/p_visibility in \('FULL_ADDRESS', 'CITY_ONLY'\) and p_city is null then 'MISSING_CITY'/);
  });

  it('defines exactly its own functions and leaves publication, booking and limits alone', () => {
    expect(createdFunctions).toEqual([
      'online_booking_location_issue',
      'online_booking_public_location',
      'online_booking_owner_profile_json',
      'online_booking_update_location',
      'online_booking_public_profile',
    ]);
    expect(code).not.toMatch(
      /function public\.online_booking_(set_state|update_profile|read_profile|book|create_booking|public_availability|availability_json|slot_is_available|take_request_quota|may_be_public)\(/,
    );
    expect(code).not.toMatch(/server_feature_flags|subscription_entitlements|sync_push_aggregate|sync_pull_business_aggregates/);
    expect(code).not.toMatch(/business_mutation_is_entitled|communications_is_entitled/);
  });

  it('stores and returns no coordinate, no map and no URL', () => {
    expect(code).not.toMatch(/latitude|longitude|\blat\b|\blng\b|geograph|geometry|point\(/i);
    expect(code).not.toMatch(/https?:|maps\.|apple|google/i);
  });

  it('pins the search_path, revokes every function from every API role, grants two', () => {
    const definitions = code.split(/create or replace function /).slice(1);
    expect(definitions).toHaveLength(createdFunctions.length);
    for (const body of definitions) {
      expect(body.slice(0, body.indexOf('as $$'))).toMatch(/set search_path = ''/);
    }
    for (const name of createdFunctions) {
      expect(code).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`),
      );
    }
    const grants = [...code.matchAll(/grant ([\w ,]+) on (function|table) public\.(\w+)[^;]* to ([\w, ]+);/g)].map(
      (m) => `${m[3]}:${m[4].trim()}`,
    );
    expect(grants.sort()).toEqual(
      ['online_booking_public_profile:service_role', 'online_booking_update_location:authenticated'].sort(),
    );
    expect(code).not.toMatch(/\bto [\w, ]*\banon\b/);
    expect(code).not.toMatch(/grant [a-z, ]+ on table/);
  });

  it('checks ownership first in the owner save, and requires an explicit level', () => {
    const save = definition(code, 'online_booking_update_location');
    expect(save).toMatch(/security definer\s+set search_path = ''/);
    const begin = save.indexOf('begin');
    expect(save.slice(begin, begin + 140)).toMatch(/if not public\.is_business_owner\(p_business_id\) then/);
    expect(save).toMatch(
      /if p_visibility is null or p_visibility not in \('FULL_ADDRESS', 'CITY_ONLY', 'HIDDEN'\) then\s+return jsonb_build_object\('status', 'INVALID_LOCATION', 'reason', 'INVALID_VISIBILITY'\);/,
    );
    // The level is validated before any write: a refusal never creates the draft.
    expect(save.indexOf("'INVALID_VISIBILITY'")).toBeLessThan(save.indexOf('insert into'));
    expect(save.indexOf('v_issue is not null')).toBeLessThan(save.indexOf('insert into'));
  });

  it('keeps every key of the owner view and adds the four stored values', () => {
    const before = jsonKeys(definition(profilesCode, 'online_booking_owner_profile_json'));
    const after = jsonKeys(definition(code, 'online_booking_owner_profile_json'));
    expect(after).toEqual(
      [...before, 'address_visibility', 'address_street', 'address_postal_code', 'address_city'].sort(),
    );
  });

  it('serves the location as its level allows, behind the same publication gate', () => {
    const publicRead = definition(code, 'online_booking_public_profile');
    expect(jsonKeys(publicRead)).toEqual(
      [...jsonKeys(definition(profilesCode, 'online_booking_public_profile')), 'location'].sort(),
    );
    // The legacy free text is never read; the alias is built from the authorized location only.
    expect(publicRead).not.toMatch(/\bp\.address\b(?!_)/);
    expect(publicRead).toMatch(/'address', case when l\.location ->> 'visibility' = 'FULL_ADDRESS'/);
    expect(publicRead).toMatch(
      /public\.online_booking_public_location\(\s*p\.address_visibility, p\.address_street, p\.address_postal_code, p\.address_city\)/,
    );
    expect(publicRead).toMatch(
      /where p\.slug = lower\(btrim\(p_slug\)\)\s+and p\.published\s+and public\.online_booking_may_be_public\(p\.business_id\);/,
    );
    expect(publicRead).not.toMatch(/business_id'|owner|media_id'|plus_access|publication_open/);
  });

  it('fails closed and publishes the city alone under CITY_ONLY', () => {
    const shape = definition(code, 'online_booking_public_location');
    expect(shape).toMatch(/when public\.online_booking_location_issue\([^)]*\) is not null then null/);
    const full = shape.slice(shape.indexOf("when p_visibility = 'FULL_ADDRESS'"), shape.indexOf("when p_visibility = 'CITY_ONLY'"));
    expect(jsonKeys(full)).toEqual(['city', 'directions_destination', 'postal_code', 'street', 'visibility']);
    const city = shape.slice(shape.indexOf("when p_visibility = 'CITY_ONLY'"), shape.indexOf('else null'));
    expect(jsonKeys(city)).toEqual(['city', 'visibility']);
    expect(city).toMatch(/'city', p_city\)/);
    expect(city).not.toMatch(/p_street|p_postal_code/);
    expect(shape).toMatch(/else null\s+end;/);
  });

  it('is never called by the app for the public read', () => {
    const gateway = readFileSync(join(ROOT, 'src', 'infrastructure', 'supabase', 'online-booking-gateway.ts'), 'utf8');
    expect(gateway).not.toMatch(/client\.rpc\('online_booking_public_profile'/);
  });
});
