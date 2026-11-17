// BeautIzzy — the service publication migration of online booking stays
// bounded (source-level guard, like the other `*-migration.test.ts`): ONE
// forward-only migration of functions only, sorting right after the location
// privacy one WITHOUT sharing an object with it (either may be applied
// first); two owner RPCs that check ownership first and write under the
// Business lock of booking creation; ONE eligibility rule; a public service
// shape that only adds keys to the three a deployed website reads; and no
// redefinition of booking creation, the slot rule, the publication gate or
// the offline sync. The behavior — ownership, eligibility, descriptions,
// prices, categories, races with a booking, both migration orders — is
// verified against a real PostgreSQL (supabase/README.md › Online booking
// service publication).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261021120000_add_online_booking_service_publication.sql';
const LOCATION_MIGRATION_NAME = '20261020120000_add_online_booking_location_privacy.sql';
const AVAILABILITY_MIGRATION_NAME = '20261017120000_create_online_booking_availability.sql';

const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const withoutComments = (source: string) => source.replace(/^\s*--.*$/gm, '');
const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = withoutComments(migration);
const locationCode = withoutComments(readFileSync(join(MIGRATIONS_DIR, LOCATION_MIGRATION_NAME), 'utf8'));
const availabilityCode = withoutComments(readFileSync(join(MIGRATIONS_DIR, AVAILABILITY_MIGRATION_NAME), 'utf8'));

const functionsOf = (source: string) =>
  [...source.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
const createdFunctions = functionsOf(code);
/** What the functions execute: the bodies alone, without the `comment on` texts. */
const bodies = [...code.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((m) => m[1]).join('\n');

function definition(source: string, name: string): string {
  const start = source.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

/** `name(args) returns …` up to the language clause, whitespace collapsed. */
function header(source: string, name: string): string {
  const whole = definition(source, name);
  return whole.slice(0, whole.indexOf('language ')).replace(/\s+/g, ' ').trim();
}

function jsonKeys(body: string): string[] {
  return [...new Set([...body.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]))].sort();
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isFile() ? [path] : listFiles(path);
  });
}

describe('Online booking service publication migration', () => {
  it('is ONE forward-only migration sorting right after the location privacy one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe(LOCATION_MIGRATION_NAME);
    expect(names.filter((name) => name.includes('service_publication'))).toEqual([MIGRATION_NAME]);
  });

  it('creates functions only: no table, column, constraint, index, trigger, policy, flag or drop', () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+(table|index|unique index|type|policy|trigger|schema|extension)\b/i);
    expect(code).not.toMatch(/\bdrop\s+(function|column|constraint)\b/i);
    expect(code).not.toMatch(/\badd (column|constraint)\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).not.toMatch(/\bupdate public\./);
    expect(code).not.toMatch(/server_feature_flags/);
    // Every statement of the file defines, documents or (un)grants a function.
    const statements = code
      .replace(/\$\$[\s\S]*?\$\$/g, '$body$')
      // A documentation text may hold a semicolon: it is not a statement separator.
      .replace(/'(?:[^']|'')*'/g, "''")
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    for (const statement of statements) {
      expect(statement).toMatch(/^(create or replace function|comment on function|revoke all on function|grant execute on function) public\.online_booking_/);
    }
  });

  it('lets the owner write her own opt-ins and the empty draft — nothing else', () => {
    expect([...code.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual([
      'business_bookable_services',
      'business_booking_profiles',
    ]);
    expect([...new Set([...code.matchAll(/delete from public\.(\w+)/g)].map((m) => m[1]))]).toEqual([
      'business_bookable_services',
    ]);
    // The draft is the same empty row every other owner RPC creates.
    expect(code).toMatch(
      /insert into public\.business_booking_profiles \(business_id\)\s+values \(p_business_id\)\s+on conflict \(business_id\) do nothing;/,
    );
    // Never a duplicate opt-in.
    expect(code).toMatch(/on conflict \(business_id, service_id\) do nothing;/);
    const writers = createdFunctions.filter((name) => /\b(insert into|delete from)\b/.test(definition(code, name)));
    expect(writers).toEqual(['online_booking_set_service_publication']);
  });

  it('defines exactly its own functions, two of them replaced with their exact signature', () => {
    expect(createdFunctions).toEqual([
      'online_booking_service_issue',
      'online_booking_bookable_services',
      'online_booking_public_text',
      'online_booking_service_category_json',
      'online_booking_public_services',
      'online_booking_availability_json',
      'online_booking_service_publication_json',
      'online_booking_read_service_publication',
      'online_booking_set_service_publication',
    ]);
    const replaced = createdFunctions.filter((name) => functionsOf(availabilityCode).includes(name));
    expect(replaced).toEqual(['online_booking_bookable_services', 'online_booking_availability_json']);
    for (const name of replaced) {
      // `create or replace` cannot change a signature or a return type: both are the Sprint 3B ones.
      expect(header(code, name)).toBe(header(availabilityCode, name));
      expect(definition(code, name)).toMatch(/security definer\s+set search_path = ''/);
    }
    // Every other function of earlier migrations is left alone.
    const earlier = names
      .filter((name) => name < MIGRATION_NAME)
      .flatMap((name) => functionsOf(withoutComments(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))));
    expect(createdFunctions.filter((name) => earlier.includes(name))).toEqual(replaced);
  });

  it('shares no object with the location privacy migration: either may be applied first', () => {
    const locationFunctions = functionsOf(locationCode);
    expect(locationFunctions).toContain('online_booking_public_profile');
    expect(locationFunctions).toContain('online_booking_owner_profile_json');
    expect(createdFunctions.filter((name) => locationFunctions.includes(name))).toEqual([]);
    // Neither names what the other defines, so neither depends on the other being applied.
    for (const name of locationFunctions) expect(code).not.toContain(`public.${name}(`);
    for (const name of createdFunctions) expect(locationCode).not.toContain(`public.${name}(`);
    expect(code).not.toMatch(/address|location|visibility|postal|city\b/i);
    expect(locationCode).not.toMatch(/business_bookable_services|service_categories|service_phases|public\.services\b/);
  });

  it('never redefines booking creation, the slot rule, the request limits or the publication gate', () => {
    expect(code).not.toMatch(
      /function public\.online_booking_(book|create_booking|compute_slots|slot_is_available|busy_intervals|public_availability|rules|window|take_request_quota|set_state|update_profile|read_profile|may_be_public|publication_enabled|creation_enabled|find_client|request_issue)\(/,
    );
    // The answer still takes its slots from THE slot rule: nothing is computed again here.
    const answer = definition(code, 'online_booking_availability_json');
    expect(answer).toMatch(/from public\.online_booking_compute_slots\(p_business_id, v_service\.service_id, p_date, p_now\)/);
    expect(code).not.toMatch(/generate_series|online_booking_working_intervals|appointment|calendar_blocks|clients\b/);
    // No subscription rule is read: editing the selection needs none, and the public gate is not here.
    expect(bodies).not.toMatch(/subscription|entitle|may_be_public|\bpublished\b|booking_enabled/);
  });

  it('pins the search_path, revokes every function from every API role, grants the two owner RPCs', () => {
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
    expect(grants.sort()).toEqual([
      'online_booking_read_service_publication:authenticated',
      'online_booking_set_service_publication:authenticated',
    ]);
    expect(code).not.toMatch(/\bto [\w, ]*\b(anon|service_role|public)\b/);
    expect(code).not.toMatch(/grant [a-z, ]+ on table/);
  });

  it('checks ownership first in both owner RPCs, and answers the owner view only after it', () => {
    for (const name of ['online_booking_read_service_publication', 'online_booking_set_service_publication']) {
      const body = definition(code, name);
      const start = body.indexOf('begin');
      const guard = body.indexOf('if not public.is_business_owner(p_business_id) then');
      expect(guard).toBeGreaterThan(start);
      // Nothing is read or written between `begin` and the ownership check.
      expect(body.slice(start, guard)).not.toMatch(/\b(select|insert|update|delete|perform|return)\b/);
      expect(body.slice(guard, guard + 220)).toMatch(/using errcode = '42501'/);
      expect(body).toMatch(/security definer\s+set search_path = ''/);
    }
    // The view itself has no API grant: only the two RPCs reach it.
    expect(definition(code, 'online_booking_read_service_publication')).toMatch(/stable\s+security definer/);
    expect(definition(code, 'online_booking_read_service_publication')).not.toMatch(/\b(insert|update|delete)\b/);
  });

  it('writes under THE Business lock of booking creation, inside the owner Business only', () => {
    const write = definition(code, 'online_booking_set_service_publication');
    const lock = write.search(/from public\.business_booking_profiles p\s+where p\.business_id = p_business_id\s+for update;/);
    expect(lock).toBeGreaterThan(-1);
    // Decide and write only once the lock is held.
    for (const later of ['from public.services s', 'insert into public.business_bookable_services', 'delete from public.business_bookable_services']) {
      expect(write.indexOf(later)).toBeGreaterThan(lock);
    }
    // No explicit lock on a synced table: only the profile row is locked.
    expect([...write.matchAll(/for (update|share|no key update|key share)\b/g)]).toHaveLength(1);
    // Every service is looked up inside the Business the caller owns.
    expect(write).toMatch(/where s\.business_id = p_business_id and s\.id = u\.id and s\.deleted_at is null/);
    expect(write).toMatch(/where b\.business_id = p_business_id\s+and b\.service_id = any \(v_ids\);/);
    expect(write).toMatch(/select p_business_id, u\.id from unnest\(v_ids\) as u\(id\)/);
    // Bounded, well-formed input — or 22023 before anything is written.
    expect(write).toMatch(/cardinality\(p_service_ids\) not between 1 and 200/);
    expect(write.indexOf("using errcode = '22023'")).toBeLessThan(lock);
    // The three answers.
    expect(write).toMatch(/'status', 'UNKNOWN_SERVICE', 'service_id', v_unknown/);
    expect(write).toMatch(/'status', 'NOT_ELIGIBLE', 'service_id', v_refused\.id, 'reason', v_refused\.issue/);
    expect(write).toMatch(/jsonb_build_object\('status', 'UPDATED'\)\s+\|\| public\.online_booking_service_publication_json\(p_business_id\)/);
  });

  it('decides eligibility with ONE rule, read at each call — the limit is THE one of the booking rules', () => {
    const rule = definition(code, 'online_booking_service_issue');
    expect(rule).toMatch(/when p_deleted_at is not null then 'DELETED'/);
    expect(rule).toMatch(/when p_active is not true then 'INACTIVE'/);
    expect(rule).toMatch(/when coalesce\(p_minutes, 0\) < 1 then 'NO_DURATION'/);
    expect(rule).toMatch(/when p_minutes > r\.max_service_minutes then 'TOO_LONG'/);
    expect(rule).toMatch(/from public\.online_booking_rules\(\) r/);
    // No second copy of the rule: the three readers call it.
    const call = /public\.online_booking_service_issue\(s\.active, s\.deleted_at, d\.minutes\)/;
    for (const name of ['online_booking_bookable_services', 'online_booking_service_publication_json', 'online_booking_set_service_publication']) {
      expect(definition(code, name)).toMatch(call);
    }
    expect(code).not.toMatch(/between 1 and r\.max_service_minutes|12 \* 60|\b720\b/);
    // Bookable = selected AND eligible; a selection is kept while a service is inactive.
    const bookable = definition(code, 'online_booking_bookable_services');
    expect(bookable).toMatch(/from public\.business_bookable_services b\s+join public\.services s/);
    expect(bookable).toMatch(/is null\s+order by s\.name, s\.id;/);
    const write = definition(code, 'online_booking_set_service_publication');
    // Only the rows of services that are deleted (or gone) are ever cleaned up.
    expect(write).toMatch(/where s\.business_id = b\.business_id and s\.id = b\.service_id and s\.deleted_at is null\);/);
    expect(write).not.toMatch(/s\.active\s*(=|is)/);
  });

  it('publishes a service as its three original keys plus price, description and category — bookable ones only', () => {
    const shape = definition(code, 'online_booking_public_services');
    expect(jsonKeys(shape)).toEqual(['category', 'description', 'duration_minutes', 'id', 'name', 'price_cents']);
    // Built ON the bookable list: a service that is not bookable cannot appear.
    expect(shape).toMatch(/from public\.online_booking_bookable_services\(p_business_id, p_service_id\) b\s+join public\.services s/);
    expect(shape).toMatch(/'id', b\.service_id,\s+'name', b\.name,\s+'duration_minutes', b\.duration_minutes,/);
    expect(shape).toMatch(/'price_cents', s\.price_cents,/);
    expect(shape).toMatch(/order by b\.name, b\.service_id;/);
    expect(shape).not.toMatch(/s\.type|s\.active|service_phases|requires_staff|owner|client|notes/);

    const category = definition(code, 'online_booking_service_category_json');
    expect(jsonKeys(category)).toEqual(['id', 'name', 'position']);
    expect(category).toMatch(/where c\.business_id = p_business_id\s+and c\.id = p_category_id\s+and c\.deleted_at is null;/);
    expect(category).not.toMatch(/c\.description/);

    // The answer keeps its top-level keys; its services are the shape above.
    const answer = definition(code, 'online_booking_availability_json');
    const before = jsonKeys(definition(availabilityCode, 'online_booking_availability_json'));
    expect(jsonKeys(answer)).toEqual(before.filter((key) => !['duration_minutes', 'id', 'name'].includes(key)));
    expect(answer).toMatch(/jsonb_agg\(s\.service order by s\.name, s\.service_id\)\s+from public\.online_booking_public_services\(p_business_id, null\) s/);
    expect(answer).toMatch(/from public\.online_booking_public_services\(p_business_id, v_service_id\) s;/);
    for (const status of ['CHOOSE_SERVICE', 'UNKNOWN_SERVICE', 'CHOOSE_DATE', 'OUT_OF_WINDOW', 'SLOTS']) {
      expect(answer).toContain(`'status', '${status}'`);
    }
    expect(answer).not.toMatch(/price|description|category|client|staff|owner/);
  });

  it('returns a description as bounded plain text, with the catalogue limit of the app', () => {
    const description = readFileSync(join(ROOT, 'src', 'domain', 'services', 'description.ts'), 'utf8');
    const limit = /SERVICE_DESCRIPTION_MAX_LENGTH = (\d+);/.exec(description)?.[1];
    expect(limit).toBe('1000');
    expect(code.match(new RegExp(`public\\.online_booking_public_text\\(s\\.description, ${limit}\\)`, 'g'))).toHaveLength(2);

    const text = definition(code, 'online_booking_public_text');
    const backslash = String.fromCharCode(92);
    // Line endings become a line feed, a run of blank lines one blank line, a tab a space.
    expect(text).toContain(`'${backslash}r${backslash}n?|[${backslash}u2028${backslash}u2029]', E'${backslash}n', 'g'`);
    expect(text).toContain(`'${backslash}n{3,}', E'${backslash}n${backslash}n', 'g'`);
    expect(text).toContain(`'${backslash}t', ' ', 'g'`);
    // Control characters (the line feed excepted) and bidirectional overrides are removed.
    expect(text).toContain(
      `'[${backslash}x01-${backslash}x09${backslash}x0B-${backslash}x1F${backslash}x7F-${backslash}x9F${backslash}u202A-${backslash}u202E${backslash}u2066-${backslash}u2069]', '', 'g'`,
    );
    // Trimmed like the device trims, before and after the cut; nothing visible = no text.
    expect(text.match(/public\.online_booking_clean_text\(/g)).toHaveLength(2);
    expect(text).toMatch(/left\(/);
    expect(text).toMatch(/case\s+when t\.cleaned ~ '\[\^/);
    expect(text).not.toMatch(/\bfrom public\./);
    // Never as raw invisible characters in the source.
    for (const codePoint of [0xa0, 0x1680, 0x2028, 0x2029, 0x202a, 0x202e, 0x202f, 0x205f, 0x2066, 0x3000, 0xfeff, 0x200b]) {
      expect(migration.includes(String.fromCharCode(codePoint))).toBe(false);
    }
  });

  it('shows the owner her live catalogue: her choice, the rule, and what is offered', () => {
    const view = definition(code, 'online_booking_service_publication_json');
    expect(jsonKeys(view)).toEqual(
      [
        'active',
        'bookable',
        'bookable_count',
        'category',
        'description',
        'duration_minutes',
        'eligible',
        'id',
        'ineligible_reason',
        'max_service_minutes',
        'name',
        'price_cents',
        'selected',
        'selected_count',
        'services',
        'type',
      ].sort(),
    );
    expect(view).toMatch(/where s\.business_id = p_business_id\s+and s\.deleted_at is null/);
    expect(view).toMatch(/'bookable', c\.selected and c\.issue is null\)/);
    expect(view).toMatch(/order by c\.name, c\.id\)/);
    expect(view).not.toMatch(/\b(insert|update|delete)\b/);
  });

  it('stays outside the offline sync, and the website never calls the owner RPCs', () => {
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|sync_count_business_aggregates/);
    const syncSources = ['src/persistence/sync/remote-snapshot.ts', 'src/persistence/sync/remote-gateway.ts']
      .map((path) => readFileSync(join(ROOT, path), 'utf8'))
      .join('\n');
    expect(syncSources).not.toMatch(/bookable|service_publication|online_booking/i);

    // The owner RPCs belong to the app, and the internal functions to the database: no website
    // code names them (a test or a comment may name the migration).
    const webSources = listFiles(join(ROOT, 'web', 'src')).filter(
      (path) => /\.(ts|tsx)$/.test(path) && !/[\\/]__tests__[\\/]/.test(path),
    );
    expect(webSources.length).toBeGreaterThan(0);
    const codeOf = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const path of webSources) {
      expect(codeOf(path)).not.toMatch(/service_publication|online_booking_public_services|business_bookable_services/);
    }
  });
});
