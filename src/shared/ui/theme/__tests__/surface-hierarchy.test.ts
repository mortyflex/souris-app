// Surface hierarchy (DESIGN_OVERRIDES.md §39): the semantic roles and the two
// source guards that keep them meaningful.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { colors, lavender, overlayMaterial, semanticColors } from '@/shared/ui/theme';

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const SOURCE_ROOT = join(__dirname, '..', '..', '..', '..');
const SKIPPED_DIRECTORIES = new Set(['__tests__', 'testing', 'node_modules']);

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (!statSync(path).isFile()) {
      return SKIPPED_DIRECTORIES.has(entry) ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

function findInSources(directories: readonly string[], pattern: RegExp): readonly string[] {
  return directories.flatMap((directory) =>
    listSourceFiles(join(SOURCE_ROOT, directory)).flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          pattern.test(line) ? [`${path.slice(SOURCE_ROOT.length + 1)}:${index + 1}`] : [],
        ),
    ),
  );
}

describe('surface hierarchy', () => {
  it('uses the lavender satin near-white as the ONE app background', () => {
    expect(semanticColors.screen).toBe('#F5F3F8');
  });

  it('keeps screenWarm only as a compatibility alias of screen', () => {
    expect(semanticColors.screenWarm).toBe(semanticColors.screen);
  });

  it('keeps white for the deliberate operational canvas, primary cards and text on accents', () => {
    expect(semanticColors.canvas).toBe(colors.background);
    expect(semanticColors.surfaceElevated).toBe(colors.background);
    expect(semanticColors.onAccent).toBe(colors.background);
  });

  it('keeps the approved satin sheet material', () => {
    expect(overlayMaterial.surface).toBe(lavender.lav025);
  });

  it('orders the layers: page < sheet < card, with inputs quieter than every raised layer', () => {
    const page = luminance(semanticColors.screen);
    const sheet = luminance(overlayMaterial.surface);
    const card = luminance(semanticColors.surfaceElevated);
    const input = luminance(semanticColors.surfaceInput);

    expect(page).toBeLessThan(sheet);
    expect(sheet).toBeLessThan(card);
    expect(input).toBeLessThan(sheet);
    expect(input).toBeLessThan(page);
  });

  it('never borrows the card surface as a text or icon colour (onAccent is that role)', () => {
    const offending = findInSources(
      ['app', 'features', 'shared', 'providers'],
      /\b(color|tintColor)\s*[:=]\s*\{?\s*semanticColors\.surfaceElevated\b/,
    );

    expect(offending).toEqual([]);
  });

  it('never paints a literal colour as a background in routes, features or providers', () => {
    const offending = findInSources(
      ['app', 'features', 'providers'],
      /backgroundColor\s*[:=]\s*\{?\s*['"](#|rgb|white)/i,
    );

    expect(offending).toEqual([]);
  });
});
