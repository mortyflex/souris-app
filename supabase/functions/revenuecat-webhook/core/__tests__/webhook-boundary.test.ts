// BeautIzzy — the entitlement mirror stays bounded (source-level guard, like
// revenuecat-boundary.test.ts): the function's core has no dependency on the
// app or on Node, every relative import carries its `.ts` extension (Deno),
// the product and entitlement identifiers are THE app's, no secret or
// service-role key is hardcoded, the migration keeps the client read-only and
// the server behind SECURITY DEFINER functions, and the app's enforcement
// switch is untouched.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import {
  APP_STORE_PLUS_PRODUCT_IDENTIFIERS as APP_PRODUCTS,
  PLUS_ENTITLEMENT_IDENTIFIER as APP_ENTITLEMENT,
} from '@/infrastructure/revenuecat/customer-info';

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS, PLUS_ENTITLEMENT_IDENTIFIER } from '../entitlement-snapshot';

const FUNCTION_DIR = join(__dirname, '..', '..');
const ROOT = join(FUNCTION_DIR, '..', '..', '..');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20261004120000_create_subscription_entitlements.sql');

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) return name === '__tests__' ? [] : listSourceFiles(path);
    return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

const files: readonly SourceFile[] = listSourceFiles(FUNCTION_DIR).map((path) => ({
  path: path.slice(FUNCTION_DIR.length + 1).split('\\').join('/'),
  source: readFileSync(path, 'utf8'),
}));

const migration = readFileSync(MIGRATION, 'utf8');

describe('revenuecat-webhook — Phase 6.5A boundary', () => {
  it('scans the function sources', () => {
    expect(files.map((file) => file.path).sort()).toEqual([
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

  it('every relative import carries its .ts extension (Deno), and nothing imports the app or Node', () => {
    for (const file of files) {
      const imports = [...file.source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of imports) {
        expect({ path: file.path, specifier, deno: !specifier.startsWith('.') || specifier.endsWith('.ts') }).toEqual({ path: file.path, specifier, deno: true });
        expect({ path: file.path, specifier, app: specifier.startsWith('@/') || specifier.includes('/src/') || specifier.startsWith('node:') }).toEqual({ path: file.path, specifier, app: false });
      }
    }
  });

  it('the core binds the database through the structural rpc port only: supabase-js is imported by the Deno entry alone', () => {
    const importers = files.filter((file) => /npm:@supabase|@supabase\/supabase-js/.test(file.source)).map((file) => file.path);
    expect(importers).toEqual(['index.ts']);
    expect(files.find((file) => file.path === 'index.ts')!.source).toMatch(/withSupabase\(\{ auth: 'none' \}/);
  });

  it('uses THE application identifiers: the plus entitlement and the exact App Store products', () => {
    expect(PLUS_ENTITLEMENT_IDENTIFIER).toBe(APP_ENTITLEMENT);
    expect(APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY).toBe(APP_PRODUCTS.monthly);
    expect(APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL).toBe(APP_PRODUCTS.annual);
  });

  it('hardcodes no secret, no key and no service-role credential; secrets are read by name through the reader only', () => {
    for (const file of files) {
      expect({ path: file.path, secret: /sk_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}/.test(file.source) }).toEqual({ path: file.path, secret: false });
    }
    const envReaders = files.filter((file) => /Deno\.env\.get\(/.test(file.source)).map((file) => file.path);
    expect(envReaders).toEqual(['index.ts']);
    const secretNames = files.filter((file) => /readSecret\('REVENUECAT_/.test(file.source)).map((file) => file.path);
    expect(secretNames).toEqual(['core/configuration.ts']);
  });

  it('the migration keeps the client read-only on its own rows and the server behind SECURITY DEFINER functions', () => {
    // ONE policy, a SELECT for the owner, on the snapshot; none on the history.
    const policies = [...migration.matchAll(/create policy "([^"]+)"\s+on public\.(\w+)\s+for (\w+)\s+to (\w+)/g)].map((match) => match.slice(1));
    expect(policies).toEqual([['subscription_entitlements: owner can select', 'subscription_entitlements', 'select', 'authenticated']]);
    expect(migration).toMatch(/using \(\(select auth\.uid\(\)\) = user_id\)/);
    // The API roles hold SELECT on the snapshot only; nothing on the history.
    expect(migration).toMatch(/revoke all on table public\.subscription_entitlements from public, anon, authenticated;/);
    expect(migration).toMatch(/revoke all on table public\.subscription_events from public, anon, authenticated;/);
    expect(migration).toMatch(/grant select on table public\.subscription_entitlements to authenticated;/);
    expect(migration).not.toMatch(/grant [^;]*on table public\.subscription_events to (anon|authenticated)/);
    expect(migration).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on table public\.subscription_(entitlements|events) to (anon|authenticated)/);
    // The server holds no direct table privilege: every write goes through the functions.
    expect(migration).not.toMatch(/grant [^;]*on table public\.subscription_\w+ to service_role/);
    expect(migration).toMatch(/revoke all on table public\.subscription_entitlements from service_role;/);
    for (const fn of ['subscription_read_mirror', 'subscription_write_snapshot', 'subscription_apply_revenuecat_event', 'subscription_apply_reconciliation', 'subscription_has_plus_access']) {
      const body = migration.slice(migration.indexOf(`create or replace function public.${fn}(`));
      expect({ fn, definer: /^security definer$/m.test(body.slice(0, body.indexOf('as $$'))) }).toEqual({ fn, definer: true });
      expect({ fn, pinned: /^set search_path = ''$/m.test(body.slice(0, body.indexOf('as $$'))) }).toEqual({ fn, pinned: true });
      expect(migration).toContain(`grant execute on function public.${fn}(`);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    }
    // One row per granting product; effective access is derived from PRODUCTION rows of production stores only.
    expect(migration).toMatch(/unique \(user_id, environment, entitlement_id, product_id\)/);
    expect(migration).toMatch(/and e\.environment = 'PRODUCTION'\s+and e\.store in \('APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE', 'PROMOTIONAL'\)/);
    // No existing sync RPC, reminder function or table is replaced.
    expect(migration).not.toMatch(/sync_push_aggregate|sync_pull_business_aggregates|communications_/);
    expect(migration).not.toMatch(/alter table public\.(businesses|clients|appointments|services|products|sales)\b/);
  });

  it('the app is untouched: enforcement stays disabled and the mobile side never reads the mirror', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const src = join(ROOT, 'src');
    const readers = listSourceFiles(src).filter((path) => /subscription_entitlements|subscription_read_mirror|subscription_apply_/.test(readFileSync(path, 'utf8')));
    expect(readers).toEqual([]);
  });
});
