// Souris — client import privacy guard
//
// An import carries personal data (names, phones, emails, birthdays). Its
// sources must never log it, persist the pasted text or the staging
// candidates, or send them anywhere: the only write is the confirmed Client
// through the Client session. This guard reads every non-test source of the
// import pipeline and fails on a logging, storage or network API.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_ROOT = join(__dirname, '..', '..', '..', '..');
const IMPORT_DIRECTORIES = [join(SOURCE_ROOT, 'domain', 'clients', 'import'), join(SOURCE_ROOT, 'features', 'clients', 'import')];

const FORBIDDEN = [
  /\bconsole\s*\./,
  /AsyncStorage/,
  /localStorage|sessionStorage/,
  /\bfetch\s*\(/,
  /expo-file-system|expo-sqlite|expo-clipboard|Clipboard/,
  /supabase/i,
];

function listSources(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (!statSync(path).isFile()) return entry === '__tests__' ? [] : listSources(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('client import privacy', () => {
  it('never logs, stores or sends import data from its sources', () => {
    const sources = IMPORT_DIRECTORIES.flatMap(listSources);
    expect(sources.length).toBeGreaterThan(10);
    for (const path of sources) {
      const text = readFileSync(path, 'utf8');
      const offending = FORBIDDEN.filter((pattern) => pattern.test(text)).map(String);
      expect({ path, offending }).toEqual({ path, offending: [] });
    }
  });
});
