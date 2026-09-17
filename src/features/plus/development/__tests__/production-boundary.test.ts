// Souris — the development sync control must never be part of a release.
//
// Jest always runs with `__DEV__ = true`, so the bundle boundary itself is
// guarded at the source level (same approach as persistence/source-hygiene):
// the control is loaded ONLY through a `require` inside a `__DEV__` branch —
// which Metro folds away in release builds, dropping the module — and the
// initial-upload approval has no other caller anywhere in application code.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', '..', '..');

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) {
      return name === '__tests__' || name === 'testing' ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = listSourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).split('\\').join('/'),
  source: readFileSync(path, 'utf8'),
}));

describe('development sync control — production boundary', () => {
  it('scans the application sources', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(files.some((file) => file.path === 'features/plus/PlusScreen.tsx')).toBe(true);
  });

  it('is referenced by PlusScreen only, and only through a require inside a __DEV__ branch', () => {
    const referencing = files
      .filter((file) => !file.path.startsWith('features/plus/development/'))
      .filter((file) => /plus\/development|\.\/development\//.test(file.source))
      .map((file) => file.path);
    expect(referencing).toEqual(['features/plus/PlusScreen.tsx']);

    const plus = files.find((file) => file.path === 'features/plus/PlusScreen.tsx')!.source;
    // No static (bundled) import of the control…
    expect(plus).not.toMatch(/^import[^;]*['"]\.\/development\//m);
    // …exactly one runtime load, guarded by __DEV__ with `undefined` otherwise.
    expect(plus.match(/require\(/g)).toHaveLength(1);
    expect(plus).toMatch(
      /const DevelopmentSyncSheet = __DEV__\s*\?[^;]*require\('\.\/development\/DevelopmentSyncSheet'\)[^;]*:\s*undefined;/,
    );
    // The section that renders it exists only under __DEV__ as well.
    expect(plus).toContain('{__DEV__ && <DevelopmentSection />}');
  });

  it('approveInitialUpload has no caller in application code except the development control', () => {
    const callers = files
      .filter((file) => /\bapproveInitialUpload\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(callers.sort()).toEqual([
      'features/plus/development/DevelopmentSyncSheet.tsx',
      'persistence/sync/bootstrap.ts', // the definition
    ]);
  });

  it('the control hardcodes no account, no Business and no privileged key, and logs nothing', () => {
    for (const file of files.filter((entry) => entry.path.startsWith('features/plus/development/'))) {
      expect({ path: file.path, uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(file.source) }).toEqual({ path: file.path, uuid: false });
      expect({ path: file.path, email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(file.source) }).toEqual({ path: file.path, email: false });
      expect({ path: file.path, privileged: /service_role|SERVICE_ROLE|supabase/i.test(file.source) }).toEqual({ path: file.path, privileged: false });
      expect({ path: file.path, logs: /console\./.test(file.source) }).toEqual({ path: file.path, logs: false });
    }
  });
});
