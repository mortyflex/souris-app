// Souris — source hygiene: a TypeScript store must stay a text file.
//
// `stores/appointments.ts` once embedded a literal NUL byte in its item key
// separator, which made Git treat the file as binary. The separator is now
// the `\0` escape (same runtime string), and this guard keeps it that way.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STORES_DIRECTORY = join(__dirname, '..', 'stores');

function listTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory)
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile() && path.endsWith('.ts'));
}

describe('persistence source files', () => {
  it('contain no literal NUL byte', () => {
    const files = listTypeScriptFiles(STORES_DIRECTORY);
    expect(files.some((path) => path.endsWith('appointments.ts'))).toBe(true);
    for (const path of files) {
      expect({ path, hasNul: readFileSync(path).includes(0) }).toEqual({ path, hasNul: false });
    }
  });

  it('keep the appointment item key separator as the escaped NUL character', () => {
    const source = readFileSync(join(STORES_DIRECTORY, 'appointments.ts'), 'utf8');
    expect(source).toContain('return `${appointmentId}\\0${itemId}`;');
    // The escape produces the same runtime string the literal byte produced.
    expect(`a\0b`).toBe('a' + String.fromCharCode(0) + 'b');
  });
});
