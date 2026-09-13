// Minimal typing for Node's built-in fs / path (test-only, source hygiene
// guard). The project keeps `types: ["jest"]` in tsconfig, so @types/node is
// intentionally not loaded.
declare module 'node:fs' {
  interface Stats {
    isFile(): boolean;
  }
  function readdirSync(path: string): string[];
  function readFileSync(path: string): Uint8Array;
  function readFileSync(path: string, encoding: 'utf8'): string;
  function statSync(path: string): Stats;
}

declare module 'node:path' {
  function join(...segments: string[]): string;
}

declare const __dirname: string;
