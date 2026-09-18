// Souris — the development sync control must never be part of a release.
//
// Jest always runs with `__DEV__ = true`, so the bundle boundary itself is
// guarded at the source level (same approach as persistence/source-hygiene):
// the control is loaded ONLY through a `require` inside a `__DEV__` branch —
// which Metro folds away in release builds, dropping the module — and neither
// the initial-upload approval has any other caller anywhere in application
// code, nor the initial-restore approval (V1D) any caller beyond the
// production restore prompt, which exists for RESTORE_REQUIRED only.

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

  it('approveInitialRestore is called only by the development control and the production restore prompt', () => {
    const callers = files
      .filter((file) => /\bapproveInitialRestore\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(callers.sort()).toEqual([
      'features/plus/development/DevelopmentSyncSheet.tsx',
      'features/sync/restore/CloudRestoreSheet.tsx', // the production prompt (RESTORE_REQUIRED only)
      'persistence/sync/bootstrap.ts', // the definition
    ]);
    // The production prompt never reaches the development control or the upload approval.
    const prompt = files.find((file) => file.path === 'features/sync/restore/CloudRestoreSheet.tsx')!.source;
    expect(prompt).not.toMatch(/development|approveInitialUpload|__DEV__/);
  });

  it('only the sync worker can restore, and only the cloud sync runner re-hydrates the UI after it', () => {
    const restoreCallers = files
      .filter((file) => /\brestoreBusiness(FromRemote|Snapshot)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(restoreCallers.sort()).toEqual(['persistence/sync/push-worker.ts', 'persistence/sync/restore.ts']);

    const reloadCallers = files
      .filter((file) => /\breloadSnapshot\s*\(\)/.test(file.source))
      .map((file) => file.path);
    expect(reloadCallers).toEqual(['providers/CloudSyncRunner.tsx']);
  });

  it('the restore / pull path hardcodes no account and no Business: it serves whichever Business the device is bound to', () => {
    const syncFiles = files.filter(
      (file) => file.path.startsWith('persistence/sync/') || file.path === 'infrastructure/supabase/sync-gateway.ts',
    );
    expect(syncFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'persistence/sync/restore.ts',
        'persistence/sync/pull-worker.ts',
        'persistence/sync/remote-apply.ts',
        'persistence/sync/remote-snapshot.ts',
      ]),
    );
    for (const file of syncFiles) {
      expect({ path: file.path, uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(file.source) }).toEqual({ path: file.path, uuid: false });
      expect({ path: file.path, email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(file.source) }).toEqual({ path: file.path, email: false });
      expect({ path: file.path, privileged: /service_role|SERVICE_ROLE/.test(file.source) }).toEqual({ path: file.path, privileged: false });
      expect({ path: file.path, logs: /console\./.test(file.source) }).toEqual({ path: file.path, logs: false });
    }
  });

  it('the control and the restore prompt hardcode no account, no Business and no privileged key, and log nothing', () => {
    for (const file of files.filter(
      (entry) => entry.path.startsWith('features/plus/development/') || entry.path.startsWith('features/sync/'),
    )) {
      expect({ path: file.path, uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(file.source) }).toEqual({ path: file.path, uuid: false });
      expect({ path: file.path, email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(file.source) }).toEqual({ path: file.path, email: false });
      expect({ path: file.path, privileged: /service_role|SERVICE_ROLE|supabase/i.test(file.source) }).toEqual({ path: file.path, privileged: false });
      expect({ path: file.path, logs: /console\./.test(file.source) }).toEqual({ path: file.path, logs: false });
    }
  });
});
