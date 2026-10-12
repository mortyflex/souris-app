// BeautIzzy — the development sync control must never be part of a release.
//
// Jest always runs with `__DEV__ = true`, so the bundle boundary itself is
// guarded at the source level (same approach as persistence/source-hygiene):
// the control is loaded ONLY through a `require` inside a `__DEV__` branch —
// which Metro folds away in release builds, dropping the module. The two
// first-sync approvals (initial upload, new-device restore) have exactly ONE
// caller in application code since V1D.1: the cloud sync runner, which gives
// them automatically under a live session. No screen — product or
// development — can approve anything.

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

  it.each(['approveInitialUpload', 'approveInitialRestore'])(
    '%s is called by the cloud sync runner only — never by a screen',
    (approval) => {
      const callers = files
        .filter((file) => new RegExp(`\\b${approval}\\s*\\(`).test(file.source))
        .map((file) => file.path);
      expect(callers.sort()).toEqual([
        'persistence/sync/bootstrap.ts', // the definition
        'providers/CloudSyncRunner.tsx', // the automatic first sync (V1D.1)
      ]);
    },
  );

  it('the runner never answers RECONCILIATION_REQUIRED with an approval', () => {
    const runner = files.find((file) => file.path === 'providers/CloudSyncRunner.tsx')!.source;
    expect(runner).toMatch(/case 'RECONCILIATION_REQUIRED':\s*return false;/);
  });

  it('no product screen reads sync state: only the root navigator does, for the first-sync gate', () => {
    expect(files.filter((file) => file.path.startsWith('features/sync/'))).toEqual([]);
    const controlReaders = files
      .filter((file) => /\buseCloudSyncControl\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(controlReaders.sort()).toEqual([
      'features/plus/development/DevelopmentSyncSheet.tsx',
      'providers/CloudSyncRunner.tsx', // the definition
      'providers/RootNavigator.tsx', // the first-sync gate of an empty device
    ]);
    // The state it shows is pure presentation: it knows nothing about the mechanism.
    const screen = files.find((file) => file.path === 'features/business/DataUnavailableScreen.tsx')!.source;
    expect(screen).not.toMatch(/persistence|providers\/|useCloudSyncControl/);
  });

  it('only the sync worker can restore, and only the cloud sync runner and onboarding re-hydrate the UI', () => {
    const restoreCallers = files
      .filter((file) => /\brestoreBusiness(FromRemote|Snapshot)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(restoreCallers.sort()).toEqual(['persistence/sync/push-worker.ts', 'persistence/sync/restore.ts']);

    // Two callers only: the runner after a run that wrote rows for the remote,
    // and onboarding after writing the starter prestations of a NEW Business
    // (so the (app) providers mounted right after know them). Neither the
    // development tools nor any other screen re-reads the snapshot.
    const reloadCallers = files
      .filter((file) => /\breloadSnapshot\s*\(\)/.test(file.source))
      .map((file) => file.path);
    expect(reloadCallers.sort()).toEqual([
      'features/business/setup/BusinessSetupScreen.tsx',
      'providers/CloudSyncRunner.tsx',
    ]);
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

  it('the control hardcodes no account, no Business and no privileged key, and logs nothing', () => {
    for (const file of files.filter((entry) => entry.path.startsWith('features/plus/development/'))) {
      expect({ path: file.path, uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(file.source) }).toEqual({ path: file.path, uuid: false });
      expect({ path: file.path, email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(file.source) }).toEqual({ path: file.path, email: false });
      expect({ path: file.path, privileged: /service_role|SERVICE_ROLE|supabase/i.test(file.source) }).toEqual({ path: file.path, privileged: false });
      expect({ path: file.path, logs: /console\./.test(file.source) }).toEqual({ path: file.path, logs: false });
    }
  });
});
