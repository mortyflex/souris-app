// BeautIzzy — no session termination may revoke the account's other devices.
//
// Guarded at the source level: supabase-js `auth.signOut()` defaults to the
// GLOBAL scope (every refresh token of the account is revoked, every other
// phone or tablet is signed out at its next refresh). Ordinary sign-out,
// abandoning a password recovery and discarding a stray session all end THIS
// device only. Any call to the Supabase `signOut` must therefore name the
// local scope explicitly; a global or `others` sign-out would need its own
// product decision and its own explicit user action.
//
// Supabase is reachable from `src/infrastructure` only (asserted below), so
// the scan covers that tree; `auth.signOut()` elsewhere is the AuthProvider's.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');
const INFRASTRUCTURE = join(SRC, 'infrastructure');

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) {
      return name === '__tests__' || name === 'testing' ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every Supabase `auth.signOut(` call, with what it passes. */
function supabaseSignOutCalls(): readonly { readonly file: string; readonly argument: string }[] {
  return listSourceFiles(INFRASTRUCTURE).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/\bauth\.signOut\(([^)]*)\)/g)].map((match) => ({
      file: path.slice(SRC.length + 1),
      argument: (match[1] ?? '').replace(/\s+/g, ' ').trim(),
    }));
  });
}

describe('Supabase sign-out scope', () => {
  it('Supabase is reachable from src/infrastructure only', () => {
    const outside = listSourceFiles(SRC).filter(
      (path) =>
        !path.startsWith(INFRASTRUCTURE) &&
        /from '@supabase\/supabase-js'|infrastructure\/supabase\/client/.test(readFileSync(path, 'utf8')),
    );
    expect(outside).toEqual([]);
  });

  it('every Supabase sign-out names the local scope — never the global default, never `others`', () => {
    const calls = supabaseSignOutCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toEqual({ file: call.file, argument: "{ scope: 'local' }" });
    }
  });

  it('only the Supabase auth gateway talks to Supabase sign-out', () => {
    const files = new Set(supabaseSignOutCalls().map((call) => call.file));
    expect([...files]).toEqual([join('infrastructure', 'supabase', 'auth-gateway.ts')]);
  });
});
