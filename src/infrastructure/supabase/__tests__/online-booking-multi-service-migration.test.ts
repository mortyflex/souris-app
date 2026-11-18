// BeautIzzy — the multi-service migration of online booking stays bounded
// (source-level guard, like the other `*-migration.test.ts`): ONE
// forward-only migration sorting right after the service publication one,
// sharing no object with the location privacy one (either may be applied
// first); THE slot rule written once by length and used by the single
// service (replaced in place, same signature) and by a selection; ONE place
// for the selection limits; ONE booking transaction that decides everything
// again under the Business lock of booking creation and writes ONE
// Appointment with one item per service in the customer's order; an additive
// booking record; two website functions for service_role alone. The
// behavior — single-service parity, ordered spans, waiting phases, limits,
// fingerprints, idempotency, rollback, races, both migration orders — is
// verified against a real PostgreSQL (supabase/README.md › Online booking
// multi-service).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261022120000_add_online_booking_multi_service.sql';
const PUBLICATION_MIGRATION_NAME = '20261021120000_add_online_booking_service_publication.sql';
const LOCATION_MIGRATION_NAME = '20261020120000_add_online_booking_location_privacy.sql';
const AVAILABILITY_MIGRATION_NAME = '20261017120000_create_online_booking_availability.sql';
const CREATION_MIGRATION_NAME = '20261018120000_create_online_booking_creation.sql';

const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const withoutComments = (source: string) => source.replace(/^\s*--.*$/gm, '');
const read = (name: string) => withoutComments(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = withoutComments(migration);
const locationCode = read(LOCATION_MIGRATION_NAME);
const availabilityCode = read(AVAILABILITY_MIGRATION_NAME);
const creationCode = read(CREATION_MIGRATION_NAME);

const functionsOf = (source: string) =>
  [...source.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
const createdFunctions = functionsOf(code);

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

/** The positions of `needles` in `body`, each one required. */
function positions(body: string, needles: readonly (string | RegExp)[]): number[] {
  return needles.map((needle) => {
    const at = typeof needle === 'string' ? body.indexOf(needle) : body.search(needle);
    expect({ needle: String(needle), found: at > -1 }).toEqual({ needle: String(needle), found: true });
    return at;
  });
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isFile() ? [path] : listFiles(path);
  });
}

describe('Online booking multi-service migration', () => {
  it('is ONE forward-only migration sorting right after the service publication one', () => {
    const index = names.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThan(-1);
    expect(names[index - 1]).toBe(PUBLICATION_MIGRATION_NAME);
    expect(names.filter((name) => name.includes('multi_service'))).toEqual([MIGRATION_NAME]);
  });

  it('adds functions and ONE additive change to the booking record — nothing else', () => {
    expect(code).not.toMatch(/\b(create|drop)\s+(table|index|unique index|type|policy|trigger|schema|extension)\b/i);
    expect(code).not.toMatch(/\bdrop\s+(function|column|constraint|table)\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).not.toMatch(/\bupdate public\.|\bdelete from public\./);
    expect(code).not.toMatch(/server_feature_flags|set_publication_enabled|set_creation_enabled/);
    // The only table change: online_bookings, additive.
    expect([...code.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'online_bookings',
      'online_bookings',
      'online_bookings',
      'online_bookings',
    ]);
    expect(code).toMatch(/alter table public\.online_bookings add column if not exists services jsonb;/);
    expect(code).toMatch(/alter table public\.online_bookings alter column service_id drop not null;/);
    expect(code).toMatch(/alter table public\.online_bookings alter column service_name drop not null;/);
    expect([...code.matchAll(/alter column (\w+)/g)].map((m) => m[1])).toEqual(['service_id', 'service_name']);
    // Exactly one representation per record; every existing (single-service) row satisfies it.
    expect(code).toMatch(
      /add constraint online_bookings_shape check \(\s+\(services is null and service_id is not null and service_name is not null\)\s+or \(services is not null and service_id is null and service_name is null/,
    );
    expect(code).toMatch(/jsonb_array_length\(services\) between 1 and 8/);
    // Re-runnable: the constraint is added once.
    expect(code).toMatch(/if not exists \(\s+select 1 from pg_constraint\s+where conrelid = 'public\.online_bookings'::regclass\s+and conname = 'online_bookings_shape'/);
    expect(migration).toMatch(/comment on column public\.online_bookings\.services is/);
    // No grant on any table.
    expect(code).not.toMatch(/grant [a-z, ]+ on table/);
  });

  it('defines exactly its own functions and replaces ONE earlier function, with its exact signature', () => {
    expect(createdFunctions).toEqual([
      'online_booking_compute_slots_for_minutes',
      'online_booking_compute_slots',
      'online_booking_minutes_slot_is_available',
      'online_booking_selection_rules',
      'online_booking_selection_issue',
      'online_booking_resolve_selection',
      'online_booking_selection_fingerprint',
      'online_booking_selection_availability_json',
      'online_booking_public_selection_availability',
      'online_booking_selection_request_issue',
      'online_booking_selection_booking_json',
      'online_booking_book_selection',
      'online_booking_create_selection_booking',
    ]);
    const earlier = names
      .filter((name) => name < MIGRATION_NAME)
      .flatMap((name) => functionsOf(read(name)));
    expect(createdFunctions.filter((name) => earlier.includes(name))).toEqual(['online_booking_compute_slots']);
    // `create or replace` cannot change a signature or a return type: both are the Sprint 3B ones.
    expect(header(code, 'online_booking_compute_slots')).toBe(header(availabilityCode, 'online_booking_compute_slots'));
    // No new name overloads an existing one (new RPC names, never a second signature).
    for (const name of createdFunctions) {
      expect(code.match(new RegExp(`create or replace function public\\.${name}\\(`, 'g'))).toHaveLength(1);
    }
  });

  it('writes THE slot rule once, by length: the Sprint 3B query, the single service delegating to it', () => {
    const query = (body: string) => body.slice(body.indexOf('return query')).replace(/\s+/g, ' ');
    const sprint3b = definition(availabilityCode, 'online_booking_compute_slots');
    const byLength = definition(code, 'online_booking_compute_slots_for_minutes');
    // Word for word the rule of 20261017, the service's length now a parameter.
    expect(query(byLength)).toBe(query(sprint3b).replace(/v_duration/g, 'p_minutes'));
    expect(byLength).toMatch(/if p_minutes < 1 or p_minutes > v_max_minutes then\s+return;/);
    expect(byLength).toMatch(/select r\.slot_minutes, r\.minimum_notice_minutes, r\.max_service_minutes/);

    const single = definition(code, 'online_booking_compute_slots');
    expect(single).toMatch(/from public\.online_booking_bookable_services\(p_business_id, p_service_id\) s;/);
    expect(single).toMatch(/from public\.online_booking_compute_slots_for_minutes\(p_business_id, v_duration, p_date, p_now\) s/);
    expect(single).not.toMatch(/generate_series|working_intervals|busy_intervals/);

    const revalidation = definition(code, 'online_booking_minutes_slot_is_available');
    expect(revalidation).toMatch(/from public\.online_booking_compute_slots_for_minutes\(\s+p_business_id, p_minutes, \(p_starts_at at time zone p\.time_zone\)::date, p_now\) s\s+where s\.starts_at = p_starts_at/);

    // No second copy of the rule anywhere else in the file.
    expect(code.match(/generate_series\(/g)).toHaveLength(1);
    expect(code.match(/online_booking_busy_intervals\(/g)).toHaveLength(1);
  });

  it('never redefines booking creation, the publication gate, the request limits or the service publication', () => {
    expect(code).not.toMatch(
      /function public\.online_booking_(book|create_booking|slot_is_available|busy_intervals|working_intervals|public_availability|availability_json|rules|window|take_request_quota|set_state|update_profile|read_profile|may_be_public|publication_enabled|creation_enabled|find_client|request_issue|clean_text|booking_json|bookable_services|public_services|service_issue|set_service_publication|read_service_publication|reattach_deleted_client|conflicts|read_conflicts)\(/,
    );
    // The single-service booking still decides its slot with its own rule, untouched.
    expect(creationCode).toMatch(/public\.online_booking_slot_is_available\(v_business_id, v_service\.id, p_starts_at, p_now\)/);
  });

  it('shares no object with the location privacy migration: either may be applied first', () => {
    const locationFunctions = functionsOf(locationCode);
    expect(locationFunctions).toContain('online_booking_public_profile');
    expect(createdFunctions.filter((name) => locationFunctions.includes(name))).toEqual([]);
    for (const name of locationFunctions) expect(code).not.toContain(`public.${name}(`);
    for (const name of createdFunctions) expect(locationCode).not.toContain(`public.${name}(`);
    expect(code).not.toMatch(/address|location|visibility|postal|city\b/i);
    expect(locationCode).not.toMatch(/online_bookings|appointment_items|service_phases/);
  });

  it('keeps the selection limits in ONE place: 8 distinct services, the booking rules’ maximum length', () => {
    const rules = definition(code, 'online_booking_selection_rules');
    expect(rules).toMatch(/select 8, r\.max_service_minutes from public\.online_booking_rules\(\) r;/);
    expect(code).not.toMatch(/\b720\b|12 \* 60/);
    // Outside the documentation texts, 8 appears twice: the rule above and the record's CHECK.
    const executable = code.replace(/'(?:[^']|'')*'/g, "''");
    expect(executable.match(/\b8\b/g)).toHaveLength(2);
    const issue = definition(code, 'online_booking_selection_issue');
    for (const reason of ['EMPTY', 'MALFORMED', 'TOO_MANY', 'DUPLICATE']) expect(issue).toContain(`then '${reason}'`);
    expect(issue).toMatch(/from public\.online_booking_selection_rules\(\) l/);
    expect(issue).toMatch(/count\(distinct u\.id\)/);
    expect(issue).not.toMatch(/\bfrom public\.(services|business_|online_bookings)/);
  });

  it('resolves a selection through the public service shape of 20261021, in the order given', () => {
    const resolve = definition(code, 'online_booking_resolve_selection');
    expect(resolve).toMatch(/from unnest\(p_service_ids\) with ordinality as u\(id, ordinality\)/);
    expect(resolve).toMatch(/join public\.online_booking_public_services\(p_business_id, null\) p on p\.service_id = u\.id/);
    expect(resolve).toMatch(/join public\.services s on s\.business_id = p_business_id and s\.id = u\.id/);
    expect(resolve).toMatch(/order by u\.ordinality;/);
    expect(resolve).toMatch(/jsonb_build_object\('id', s\.id, 'name', s\.name,\s+'duration_minutes', \(p\.service ->> 'duration_minutes'\)::integer,\s+'price_cents', s\.price_cents\)/);
    // Never sorted by name: the customer's order is kept.
    expect(resolve).not.toMatch(/order by s\.name|order by p\.name/);
    const fingerprint = definition(code, 'online_booking_selection_fingerprint');
    expect(fingerprint).toMatch(/sha256\(convert_to\('selection-v1' \|\| coalesce\(p_snapshot, '\[\]'::jsonb\)::text, 'UTF8'\)\)/);
    expect(fingerprint).toMatch(/immutable/);
  });

  it('answers the availability of a selection with distinct statuses, from THE slot rule', () => {
    const answer = definition(code, 'online_booking_selection_availability_json');
    const order = positions(answer, [
      "'status', 'INVALID_SELECTION'",
      "'status', 'UNKNOWN_SERVICE'",
      "'status', 'SELECTION_TOO_LONG'",
      "'status', 'DOES_NOT_FIT'",
      "'status', 'CHOOSE_DATE'",
      "'status', 'OUT_OF_WINDOW'",
      "'status', 'SLOTS'",
    ]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(answer).toMatch(/from public\.online_booking_compute_slots_for_minutes\(p_business_id, v_minutes, p_date, p_now\) s;/);
    expect(answer).toMatch(/if v_longest > 0 and v_minutes > v_longest then/);
    expect(answer).toMatch(/from public\.online_booking_working_intervals\(p_business_id, v_first_date, v_last_date\) w;/);
    expect(answer).toMatch(/'fingerprint', public\.online_booking_selection_fingerprint\(v_snapshot\)/);
    // The catalogue list is the single-service one, word for word.
    expect(answer).toMatch(/jsonb_agg\(s\.service order by s\.name, s\.service_id\)\s+from public\.online_booking_public_services\(p_business_id, null\) s/);
    expect(answer).not.toMatch(/\b(insert|update|delete)\b|client|staff|owner/);

    const read = definition(code, 'online_booking_public_selection_availability');
    expect(read).toMatch(
      /where p\.slug = lower\(btrim\(p_slug\)\)\s+and p\.published\s+and p\.booking_enabled\s+and public\.online_booking_may_be_public\(p\.business_id\);/,
    );
    expect(read).toMatch(/online_booking_selection_availability_json\(p\.business_id, p_service_ids, p_date, now\(\)\)/);
  });

  it('books in ONE transaction that decides everything again under THE Business lock', () => {
    const book = definition(code, 'online_booking_book_selection');
    const order = positions(book, [
      "current_setting('transaction_isolation') <> 'read committed'",
      'if not public.online_booking_creation_enabled() then',
      'v_issue := public.online_booking_selection_request_issue(',
      "perform set_config('lock_timeout', '3s', true);",
      /from public\.business_booking_profiles p\s+where p\.business_id = v_business_id\s+for update;/,
      /where b\.business_id = v_business_id and b\.idempotency_key = p_idempotency_key;/,
      "v_answer := jsonb_build_object('status', 'IDEMPOTENCY_KEY_REUSED');",
      'or not public.online_booking_may_be_public(v_business_id, p_now) then',
      /where not exists \(select 1 from public\.online_booking_bookable_services\(v_business_id, u\.id\)\)/,
      /from public\.online_booking_resolve_selection\(v_business_id, p_service_ids\) r;/,
      "elsif public.online_booking_selection_fingerprint(v_snapshot) <> p_selection_fingerprint then",
      'elsif v_minutes > v_max_minutes then',
      'elsif not public.online_booking_minutes_slot_is_available(v_business_id, v_minutes, p_starts_at, p_now) then',
      'v_client_id := public.online_booking_find_client(v_business_id, v_first_name, v_last_name, v_email);',
      'insert into public.clients',
      'insert into public.appointments',
      'insert into public.appointment_items',
      'insert into public.appointment_phases',
      "using errcode = '40001'",
      'insert into public.online_bookings',
    ]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Exactly one explicit lock: the profile row, as for one service and for the owner's selection.
    expect([...book.matchAll(/for (update|share|no key update|key share)\b/g)]).toHaveLength(1);
    expect(book).toMatch(/when lock_not_available then[\s\S]*'status', 'BUSY'/);
    // Writes: the four rows of a booking and the record — never an update or a deletion (a matched Client is never modified).
    expect([...book.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'clients',
      'appointments',
      'appointment_items',
      'appointment_phases',
      'online_bookings',
    ]);
    expect(book).not.toMatch(/\bupdate public\.|\bdelete from\b/);
  });

  it('writes ONE canonical Appointment: the app staff id, one item per service in order, the catalogue phases', () => {
    const book = definition(code, 'online_booking_book_selection');
    expect(book).toMatch(/\(v_business_id, v_appointment_id, v_client_id, public\.online_booking_staff_member_id\(\),\s+p_starts_at, 'SCHEDULED', public\.online_booking_appointment_note\(\)\)/);
    expect(book).toMatch(/v_item_id := v_appointment_id \|\| '-item-' \|\| v_service\.item_order;/);
    // The items come from the very rows compared with what was shown — never from the caller.
    expect(book).toMatch(/from jsonb_to_recordset\(v_items\) as i\(item_order integer, service_id text, name text, type text, price_cents integer\)/);
    expect(book).toMatch(/v_service\.name, v_service\.type, v_service\.price_cents\);/);
    expect(book).toMatch(/\(row_number\(\) over \(order by ph\.position, ph\.id\)\)::integer - 1/);
    expect(book).toMatch(/where ph\.business_id = v_business_id and ph\.service_id = v_service\.service_id;/);
    // Each item's phases add up to its snapshot length, or the whole booking fails.
    expect(book).toMatch(/and ph\.appointment_item_id = v_appointment_id \|\| '-item-' \|\| \(e\.ordinality - 1\)\)\) then/);
    // The record: the ordered snapshots, the total length, the single-service columns empty.
    expect(book).toMatch(/null, null, v_snapshot, v_minutes, p_starts_at,\s+p_starts_at \+ make_interval\(mins => v_minutes\), v_time_zone,/);
    // Nothing of the caller is trusted beyond ids, a start, the contact and what was shown.
    const entry = definition(code, 'online_booking_create_selection_booking');
    expect(header(code, 'online_booking_create_selection_booking')).toBe(
      'function public.online_booking_create_selection_booking( p_slug text, p_service_ids text[], p_starts_at timestamptz, p_first_name text, p_last_name text, p_email text, p_phone text, p_selection_fingerprint text, p_idempotency_key text ) returns jsonb',
    );
    expect(entry).toMatch(/p_selection_fingerprint, p_idempotency_key, now\(\)\);/);
    expect(entry).not.toMatch(/price|duration|staff|business_id/);
  });

  it('makes the order part of the request: the idempotency hash covers the ids in order and what was shown', () => {
    const book = definition(code, 'online_booking_book_selection');
    expect(book).toMatch(
      /v_request_hash := encode\(sha256\(convert_to\(concat_ws\(E'\\n',\s+'selection-v1',\s+to_jsonb\(p_service_ids\)::text,\s+p_selection_fingerprint,/,
    );
    // The same customer key as the single-service request.
    expect(book).toMatch(/public\.online_booking_text_key\(v_first_name\),\s+public\.online_booking_text_key\(v_last_name\),\s+lower\(v_email\),\s+public\.communications_client_phone_e164\(v_phone\)/);
    const json = definition(code, 'online_booking_selection_booking_json');
    // The booked services in order — name and length, never an amount (as for one service).
    expect(json).toMatch(/from jsonb_array_elements\(p_booking\.services\) with ordinality as e\(item, ordinality\)/);
    expect(json).not.toMatch(/price|business_id|appointment_id|client|customer|request_hash|idempotency/);
  });

  it('pins the search_path, revokes every function from every API role, grants the two website functions to service_role', () => {
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
      'online_booking_create_selection_booking:service_role',
      'online_booking_public_selection_availability:service_role',
    ]);
    expect(code).not.toMatch(/\bto [\w, ]*\b(anon|authenticated|public)\b/);
  });

  it('stays outside the offline sync; only the website server calls its two website functions (unit D2)', () => {
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|sync_count_business_aggregates|sync_outbox/);
    const isSource = (path: string) => /\.(ts|tsx)$/.test(path) && !/[\\/]__tests__[\\/]/.test(path);
    const codeOf = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    // The native application never names it: the offline sync and the app are untouched.
    const appSources = listFiles(join(ROOT, 'src')).filter(isSource);
    expect(appSources.length).toBeGreaterThan(0);
    for (const path of appSources) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /selection_availability|create_selection_booking|book_selection|compute_slots_for_minutes/,
      );
    }

    // The website calls the two service_role functions from server-only modules, and nothing else of it.
    const webSources = listFiles(join(ROOT, 'web', 'src')).filter(isSource);
    const callers = webSources
      .filter((path) => /online_booking_(public_selection_availability|create_selection_booking)/.test(codeOf(path)))
      .map((path) => path.slice(join(ROOT, 'web', 'src').length + 1).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual([
      'features/availability/get-selection-availability.ts',
      'features/booking/create-selection-booking.ts',
      'features/booking/supabase-rpc.ts',
    ]);
    for (const caller of callers) {
      expect(readFileSync(join(ROOT, 'web', 'src', caller), 'utf8')).toMatch(/^import "server-only";/);
    }
    for (const path of webSources) {
      expect(codeOf(path)).not.toMatch(
        /online_booking_(book_selection|compute_slots_for_minutes|minutes_slot_is_available|resolve_selection|selection_fingerprint|selection_availability_json|selection_request_issue|selection_booking_json|selection_rules|selection_issue)/,
      );
    }
  });
});
