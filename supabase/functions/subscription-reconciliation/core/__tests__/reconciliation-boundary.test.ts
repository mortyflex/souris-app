// BeautIzzy — Phase 6.5C step 6 stays bounded (source-level guard, like
// webhook-boundary.test.ts and entitlement-boundary.test.ts): the function
// reuses the 6.5A mirror and mapping and holds no access rule of its own; it
// is reachable through a dedicated named secret key only; its RevenueCat
// credential is a dedicated secret read in one place and hardcoded nowhere;
// the migration is ONE forward-only, additive file sorting last that creates
// no schedule, flips no switch, replaces no existing function or policy and
// rewrites no row; and nothing on the app side or in the deployed switches
// changed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { PURCHASABLE_STORES } from '@/features/access/purchasable-stores';

const FUNCTION_DIR = join(__dirname, '..', '..');
const FUNCTIONS_DIR = join(FUNCTION_DIR, '..');
const ROOT = join(FUNCTIONS_DIR, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = '20261008120000_add_subscription_reconciliation.sql';
const STEP5_MIGRATION_NAME = '20261007120000_complete_business_mutation_entitlement_enforcement.sql';

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

function listFiles(directory: string, accept: (name: string) => boolean, skipTests = true): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) return skipTests && name === '__tests__' ? [] : listFiles(path, accept, skipTests);
    return accept(name) ? [path] : [];
  });
}

const files: readonly SourceFile[] = listFiles(FUNCTION_DIR, (name) => /\.ts$/.test(name) && !/\.d\.ts$/.test(name)).map((path) => ({
  path: path.slice(FUNCTION_DIR.length + 1).split('\\').join('/'),
  source: readFileSync(path, 'utf8'),
}));

const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8');
/** The migration without its comment lines. */
const code = migration.replace(/^\s*--.*$/gm, '');
/** The migration with every `$$ … $$` function body removed: its top-level statements only. */
const topLevel = code.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$');

describe('subscription-reconciliation — Phase 6.5C step 6 boundary', () => {
  it('scans the function sources', () => {
    expect(files.map((file) => file.path).sort()).toEqual([
      'core/account-reconciliation.ts',
      'core/configuration.ts',
      'core/revenuecat-api.ts',
      'core/run.ts',
      'core/supabase-control.ts',
      'core/testing/fake-control.ts',
      'core/testing/subscriber-fixtures.ts',
      'index.ts',
    ]);
  });

  it('every relative import carries its .ts extension (Deno), nothing imports the app or Node, and the shared 6.5A core is reached relatively', () => {
    for (const file of files) {
      const imports = [...file.source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of imports) {
        expect({ path: file.path, specifier, deno: !specifier.startsWith('.') || specifier.endsWith('.ts') }).toEqual({ path: file.path, specifier, deno: true });
        expect({ path: file.path, specifier, app: specifier.startsWith('@/') || specifier.includes('/src/') || specifier.startsWith('node:') }).toEqual({ path: file.path, specifier, app: false });
      }
    }
    const shared = files.flatMap((file) => [...file.source.matchAll(/from\s+'(\.\.\/)+revenuecat-webhook\/core\/([^']+)'/g)].map((match) => match[2]));
    expect(new Set(shared)).toEqual(new Set(['entitlement-snapshot.ts', 'mirror.ts', 'reconciliation.ts', 'testing/event-fixtures.ts']));
  });

  it('the core binds the database through the structural rpc port only: supabase-js is imported by the Deno entry alone, behind a dedicated named secret key', () => {
    const importers = files.filter((file) => /npm:@supabase|@supabase\/supabase-js/.test(file.source)).map((file) => file.path);
    expect(importers).toEqual(['index.ts']);
    const entry = files.find((file) => file.path === 'index.ts')!.source;
    expect(entry).toMatch(/withSupabase\(\{ auth: 'secret:subscription_reconciliation' \}/);
    expect(entry).not.toMatch(/auth: 'none'/);
    expect(entry).not.toMatch(/no-verify-jwt(?!`\)|\s*\.)/);
    expect(entry).toMatch(/request\.method !== 'POST'/);
  });

  it('reuses the 6.5A reconciliation (the mapping, the merge, the mirror port, the SQL function) and holds no access rule of its own', () => {
    const account = files.find((file) => file.path === 'core/account-reconciliation.ts')!.source;
    expect(account).toMatch(/mapSubscriberResponse/);
    expect(account).toMatch(/mergeReconciledSnapshot/);
    expect(account).toMatch(/mirror\.applyReconciliation\(/);
    expect(account).toMatch(/deps\.access\.hasPlusAccess\(/);
    for (const file of files) {
      // No store list, no "production grants" arithmetic: THE rule is asked through subscription_has_plus_access.
      expect({ path: file.path, rule: /'APP_STORE'|'MAC_APP_STORE'|'PLAY_STORE'|environment === 'PRODUCTION' &&/.test(file.source) }).toEqual({ path: file.path, rule: false });
      expect({ path: file.path, table: /subscription_entitlements|subscription_events|server_feature_flags|from public\./.test(file.source) }).toEqual({ path: file.path, table: false });
    }
    const control = files.find((file) => file.path === 'core/supabase-control.ts')!.source;
    expect(control).toContain("'subscription_has_plus_access'");
    const binders = files.filter((file) => /'subscription_reconciliation_(claim|settle|finish)'/.test(file.source)).map((file) => file.path);
    expect(binders).toEqual(['core/supabase-control.ts']);
  });

  it('the RevenueCat credential is a dedicated secret, read in ONE place, hardcoded nowhere, never the webhook or SDK key', () => {
    for (const file of files) {
      // Comments may NAME a key shape (`sb_secret_…`); executable code never holds one.
      const executable = file.source.replace(/\/\/.*$/gm, '');
      expect({ path: file.path, secret: /sk_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}/.test(executable) }).toEqual({ path: file.path, secret: false });
      expect({ path: file.path, webhookSecret: /REVENUECAT_SECRET_API_KEY|REVENUECAT_WEBHOOK_AUTHORIZATION|EXPO_PUBLIC_REVENUECAT/.test(executable) }).toEqual({ path: file.path, webhookSecret: false });
    }
    expect(files.filter((file) => /Deno\.env\.get\(/.test(file.source)).map((file) => file.path)).toEqual(['index.ts']);
    expect(files.filter((file) => /readSecret\(/.test(file.source)).map((file) => file.path)).toEqual(['core/configuration.ts']);
    const api = files.find((file) => file.path === 'core/revenuecat-api.ts')!.source;
    // The informational read never rewrites the customer's last_seen.
    expect(api).not.toMatch(/'X-Platform'\s*:/);
    expect(api).toMatch(/signal: controller\.signal/);
  });

  it('scenario 25: the migration is ONE forward-only, additive file sorting last — no schedule, no switch, no replaced function, no rewritten row', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
    expect(names.at(-1)).toBe(MIGRATION_NAME);
    expect(names.at(-2)).toBe(STEP5_MIGRATION_NAME);
    expect(names.filter((name) => name.includes('subscription_reconciliation'))).toEqual([MIGRATION_NAME]);
    // No scheduler is created or touched by any migration: enabling the sweep is a documented manual step.
    for (const name of names) {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(/^\s*--.*$/gm, '');
      expect({ name, cron: /cron\.(schedule|unschedule|alter_job)|create extension[^;]*pg_(cron|net)|net\.http_post/i.test(sql) }).toEqual({ name, cron: false });
    }
    expect(migration).not.toMatch(/cron\.schedule/);
    // Additive: two new tables, three new functions, no replaced or dropped object.
    const tables = [...topLevel.matchAll(/create table if not exists public\.(\w+)/g)].map((match) => match[1]);
    expect(tables).toEqual(['subscription_reconciliation_state', 'subscription_reconciliation_runs']);
    const functions = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
    expect(functions).toEqual(['subscription_reconciliation_claim', 'subscription_reconciliation_settle', 'subscription_reconciliation_finish']);
    expect(topLevel).not.toMatch(/drop (table|function|policy|trigger)|alter table public\.(?!subscription_reconciliation_)/);
    expect(topLevel).not.toMatch(/create (or replace )?(trigger|policy|view)/);
    expect(topLevel).not.toMatch(/^\s*(update|delete|insert|truncate)\s/im);
    // Both tables locked: RLS on, zero policies, zero grants — not even service_role.
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role;`);
    }
    expect(migration).not.toMatch(/grant [^;]*on table/);
    expect(migration).not.toMatch(/create policy/);
  });

  it('scenario 26–29: the migration reuses THE access rule without re-implementing it, and never names a switch, a sync RPC, a policy or a communication object', () => {
    expect(code).toMatch(/public\.subscription_has_plus_access\(u\.user_id, now\(\)\)/);
    expect(code).not.toMatch(/from public\.subscription_entitlements e\s+where[\s\S]{0,200}status/);
    expect(code).not.toMatch(/status <> 'EXPIRED'|entitled_until|'APP_STORE'|'PROMOTIONAL'|'TEST_STORE'/);
    expect(code).not.toMatch(/interval '72 hours'|interval '3 days'/);
    expect(code).not.toMatch(/server_feature_flags|_ENTITLEMENT_ENFORCEMENT|business_mutation_|communications_/);
    expect(code).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|scheduled_communications|storage\./);
    expect(code).not.toMatch(/subscription_apply_|subscription_write_snapshot|subscription_read_mirror/);
    expect(migration).not.toMatch(/SUBSCRIPTION_ENFORCEMENT/);
    // The mirror is read for selection (user ids, App User IDs, row counts) and never written here.
    expect(code).not.toMatch(/(update|insert into|delete from) public\.subscription_entitlements/);
  });

  it('every new function is SECURITY DEFINER with a pinned search_path, revoked from every role, then granted to service_role ONLY', () => {
    for (const fn of ['subscription_reconciliation_claim', 'subscription_reconciliation_settle', 'subscription_reconciliation_finish']) {
      const body = migration.slice(migration.indexOf(`create or replace function public.${fn}(`));
      const head = body.slice(0, body.indexOf('as $$'));
      expect({ fn, definer: /^security definer$/m.test(head) }).toEqual({ fn, definer: true });
      expect({ fn, pinned: /^set search_path = ''$/m.test(head) }).toEqual({ fn, pinned: true });
      expect(migration).toMatch(new RegExp(`^revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated, service_role;`, 'm'));
    }
    const grants = [...migration.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);/gm)].map((match) => [match[1], match[2]]);
    expect(grants).toEqual([
      ['subscription_reconciliation_claim', 'service_role'],
      ['subscription_reconciliation_settle', 'service_role'],
      ['subscription_reconciliation_finish', 'service_role'],
    ]);
    expect(migration).not.toMatch(/^grant [^;]*to (anon|authenticated|public)/mi);
    // The batch and the lease are bounded in the database, whatever the caller sends.
    expect(code).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
    expect(code).toMatch(/least\(greatest\(coalesce\(p_lease_seconds, 300\), 60\), 3600\)/);
    // The report kept on a run is bounded.
    expect(code).toMatch(/jsonb_array_length\(report\) < 200/);
  });

  it('scenario 30: the app is untouched — enforcement disabled, the purchasable stores unchanged, no app module names the reconciliation or the mirror', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    expect(PURCHASABLE_STORES).toEqual(['test-store']);
    // Application modules only: the app's own boundary tests may quote these names to assert their absence.
    const readers = listFiles(join(ROOT, 'src'), (name) => /\.(ts|tsx)$/.test(name)).filter((path) =>
      /subscription_reconciliation|subscription_entitlements|subscription_read_mirror|subscription_apply_|REVENUECAT_RECONCILIATION_API_KEY/.test(readFileSync(path, 'utf8')),
    );
    expect(readers).toEqual([]);
    // No project link, no remote configuration lives in the repository.
    expect(() => statSync(join(ROOT, 'supabase', 'config.toml'))).toThrow();
    // The webhook keeps its own file set and its 'none' auth: this step added nothing to it.
    const webhookFiles = listFiles(join(FUNCTIONS_DIR, 'revenuecat-webhook'), (name) => /\.ts$/.test(name) && !/\.d\.ts$/.test(name)).map((path) => path.slice(FUNCTIONS_DIR.length + 1 + 'revenuecat-webhook/'.length));
    expect(webhookFiles.sort()).toEqual([
      'core/configuration.ts',
      'core/entitlement-snapshot.ts',
      'core/handler.ts',
      'core/mirror.ts',
      'core/project-event.ts',
      'core/reconciliation.ts',
      'core/revenuecat-event.ts',
      'core/testing/event-fixtures.ts',
      'core/testing/fake-mirror.ts',
      'core/webhook-auth.ts',
      'index.ts',
    ]);
  });

  it('the test suites of this function never reach the network: fetch is always injected, and the fake API answers from a script', () => {
    const tests = listFiles(join(FUNCTION_DIR, 'core', '__tests__'), (name) => name.endsWith('.test.ts'), false).map((path) => readFileSync(path, 'utf8'));
    for (const source of tests) {
      expect(/https?:\/\/api\.revenuecat\.com/.test(source.replace(/REVENUECAT_API_BASE_URL/g, ''))).toBe(false);
      expect(/\bfetch\(/.test(source.replace(/globalThis, 'fetch'/g, ''))).toBe(false);
    }
    const api = files.find((file) => file.path === 'core/revenuecat-api.ts')!.source;
    expect(api).toMatch(/fetchFn = fetch/);
  });
});
