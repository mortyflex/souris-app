// BeautIzzy — neutral client wording guard
//
// BeautIzzy serves professionals whose clientele is women, men or both: the
// visible wording is « Clientèle » for the directory and neutral « client »
// for one person (« Ajouter un client », « Aucun client »). This guard keeps
// the feminine « cliente » / « clientes » out of the copy a professional can
// see or hear.
//
// It reads the TypeScript syntax tree rather than grepping text, so it only
// looks at what can reach a screen — string literals, template text, JSX
// text — and never at comments. Technical identifiers stay allowed: the
// `clientes` tab route (`name="clientes"`, `/clientes` paths) and testIDs.
// Tests, test helpers and the historical design references are not scanned.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import * as ts from 'typescript';

const SOURCE_ROOT = join(__dirname, '..', '..', '..');
const SCANNED_DIRECTORIES = ['app', 'features', 'shared', 'providers'];
const SKIPPED_DIRECTORIES = new Set(['__tests__', 'testing', 'node_modules']);
const FEMININE_CLIENT = /\bclientes?\b/i;
/** JSX attributes that carry identifiers, never visible or spoken text. */
const TECHNICAL_ATTRIBUTES = new Set(['name', 'testID', 'href']);

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (!statSync(path).isFile()) {
      return SKIPPED_DIRECTORIES.has(entry) ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

function isTechnicalLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) {
    return TECHNICAL_ATTRIBUTES.has(parent.name.getText());
  }
  // Route paths (`/clientes`) and import specifiers are identifiers.
  if (ts.isStringLiteral(node) && node.text.startsWith('/')) return true;
  return ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent);
}

/** Every visible-text fragment of a source text that uses the feminine form. */
function findFeminineWording(fileName: string, text: string): readonly string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const offending: string[] = [];
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
        ? node.text
        : ts.isJsxText(node)
          ? node.getText()
          : undefined;
    if (text !== undefined && FEMININE_CLIENT.test(text) && !isTechnicalLiteral(node)) {
      offending.push(text.trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offending;
}

describe('neutral client wording', () => {
  const files = SCANNED_DIRECTORIES.flatMap((directory) =>
    listSourceFiles(join(SOURCE_ROOT, directory)),
  );

  it('scans the presentation sources, the directory screen included', () => {
    expect(files.some((path) => path.endsWith('ClientDirectoryScreen.tsx'))).toBe(true);
    expect(files.length).toBeGreaterThan(100);
  });

  it('never shows or speaks « cliente » / « clientes » in presentation code', () => {
    const offending = files
      .map((path) => ({
        path: path.slice(SOURCE_ROOT.length + 1),
        wording: findFeminineWording(path, readFileSync(path, 'utf8')),
      }))
      .filter((entry) => entry.wording.length > 0);
    expect(offending).toEqual([]);
  });

  it('keeps the native permission prompts of app.json neutral', () => {
    const config = readFileSync(join(SOURCE_ROOT, '..', 'app.json'), 'utf8');
    expect(config).toMatch(/Permission/);
    expect(config).not.toMatch(FEMININE_CLIENT);
  });

  it('recognises the feminine form without flagging comments or technical identifiers', () => {
    const sample = [
      '// Clientes tab — a comment never reaches a screen',
      'const route = "/clientes";',
      'const title = "Ajouter une cliente";',
      'const element = <Trigger name="clientes" testID="clientes-tab">Clientèle</Trigger>;',
    ].join('\n');
    expect(findFeminineWording('sample.tsx', sample)).toEqual(['Ajouter une cliente']);
  });
});
