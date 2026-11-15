// BeautIzzy — the professional's name in the public-page preview
//
// The name is set in Bodoni Moda 500 (docs/design/BRAND_TYPOGRAPHY.md §8).
// Its size comes from the width the preview card actually offers, measured
// against the font's real glyph advances — never from a character count
// alone — and it is always shown whole: no truncation, no line limit.
//
//   1. one line, 30pt down to 24pt, when the name fits on one line there;
//   2. otherwise two balanced lines, 26pt down to 22pt;
//   3. otherwise three balanced lines, 24pt down to 20pt;
//   4. otherwise 20pt, as many balanced lines as the name needs.
//
// Balanced: the lines are as even as the words allow (no lone last word),
// the explicit line breaks are part of the returned text.
//
// Bodoni Moda's line box is tall (ascender 1.125em + descender 0.4em =
// 1.525em). A display line height is tighter than that, and React Native on
// iOS then cuts the line from the top: whatever rises above
// `lineHeight − 0.4em` on the first line is drawn outside the text frame and
// clipped — the accent of « É » disappears. `paddingTop` gives the first line
// that room back, from the font's metrics, on both platforms (Android draws
// outside instead of clipping; the same inset keeps the two identical).
//
// Pure and deterministic: same name, same width, same text scale → same layout.

/** Advance widths of Bodoni Moda 500 (em), read from BodoniModa_500Medium.ttf. */
const ADVANCES: Readonly<Record<string, number>> = {
  a: 0.539, b: 0.617, c: 0.514, d: 0.617, e: 0.526, f: 0.402, g: 0.608, h: 0.605, i: 0.309, j: 0.314, k: 0.616, l: 0.342, m: 0.87,
  n: 0.605, o: 0.563, p: 0.617, q: 0.617, r: 0.457, s: 0.443, t: 0.345, u: 0.607, v: 0.55, w: 0.78, x: 0.579, y: 0.561, z: 0.472,
  A: 0.78, B: 0.671, C: 0.718, D: 0.739, E: 0.625, F: 0.604, G: 0.748, H: 0.774, I: 0.399, J: 0.476, K: 0.726, L: 0.612, M: 0.884,
  N: 0.776, O: 0.757, P: 0.652, Q: 0.757, R: 0.731, S: 0.584, T: 0.68, U: 0.73, V: 0.781, W: 1.036, X: 0.778, Y: 0.738, Z: 0.591,
  '0': 0.63, '1': 0.451, '2': 0.564, '3': 0.534, '4': 0.607, '5': 0.509, '6': 0.574, '7': 0.514, '8': 0.564, '9': 0.574,
  '.': 0.216, ',': 0.232, '-': 0.359, '–': 0.54, '—': 0.784, '’': 0.231, "'": 0.216, '&': 0.82, ':': 0.214, ';': 0.232,
  '!': 0.335, '?': 0.559, '(': 0.365, ')': 0.365, '/': 0.528, '+': 0.529, '"': 0.4, '«': 0.703, '»': 0.704, '@': 1.01,
  '#': 0.638, '*': 0.631, '°': 0.32, '·': 0.214, œ: 0.879, Œ: 0.979, æ: 0.813, Æ: 1.021,
};
const SPACE_ADVANCE = 0.25;
/** An unknown glyph is taken as a wide capital: the name steps down early rather than overflow. */
const UNKNOWN_ADVANCE = 0.8;
/** Every width is over-estimated by this share (kerning, rounding, the fallback serif). */
const SAFETY = 1.04;

/** Font metrics of Bodoni Moda (em): the descender, and the highest French accent (« Å » 1.02, « É » 0.985). */
const DESCENDER = 0.4;
const ACCENT_TOP = 1.02;

export const PREVIEW_NAME_LINE_HEIGHT = 1.18;
export const PREVIEW_NAME_LETTER_SPACING = -0.01;
/** The name follows the reader's text size up to this multiplier. */
export const PREVIEW_NAME_MAX_FONT_SCALE = 1.2;
export const PREVIEW_NAME_MAX_SIZE = 30;
export const PREVIEW_NAME_MIN_SIZE = 20;

/** Per line count: the largest and the smallest size it may be set at (pt, unscaled). */
const STEPS: readonly { readonly lines: number; readonly max: number; readonly min: number }[] = [
  { lines: 1, max: PREVIEW_NAME_MAX_SIZE, min: 24 },
  { lines: 2, max: 26, min: 22 },
  { lines: 3, max: 24, min: PREVIEW_NAME_MIN_SIZE },
];
const SIZE_STEP = 0.5;

export interface PreviewNameLayout {
  /** Unscaled: React Native applies the reader's text scale (capped) on top. */
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  /** Absolute (React Native never scales padding): room for the first line's accents. */
  readonly paddingTop: number;
  /** The name with its balanced line breaks. */
  readonly text: string;
  readonly lineCount: number;
}

function advance(character: string): number {
  if (/\s/.test(character)) return SPACE_ADVANCE;
  const known = ADVANCES[character];
  if (known !== undefined) return known;
  // An accented letter advances like its base letter (é = e, Ç = C).
  const base = character.normalize('NFD')[0];
  return (base !== undefined && ADVANCES[base]) || UNKNOWN_ADVANCE;
}

/** The width (em) a run of text needs, over-estimated by `SAFETY`. */
export function estimatePreviewNameWidthEm(text: string): number {
  let em = 0;
  for (const character of text) em += advance(character);
  return em * SAFETY;
}

/** Greedy wrap of words into lines no wider than `maxEm`; a word wider than that stands alone. */
function wrap(words: readonly string[], widths: readonly number[], maxEm: number): string[] {
  const space = SPACE_ADVANCE * SAFETY;
  const lines: string[] = [];
  let line = '';
  let lineEm = 0;
  words.forEach((word, index) => {
    const width = widths[index] ?? 0;
    if (line !== '' && lineEm + space + width <= maxEm) {
      line += ` ${word}`;
      lineEm += space + width;
    } else {
      if (line !== '') lines.push(line);
      line = word;
      lineEm = width;
    }
  });
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * The most even wrap into at most `lineCount` lines within `columnEm`, or
 * undefined when the words cannot fit in that many lines: the narrowest
 * width that still needs no more lines, wrapped greedily.
 */
function balancedWrap(
  words: readonly string[],
  widths: readonly number[],
  lineCount: number,
  columnEm: number,
): string[] | undefined {
  if (wrap(words, widths, columnEm).length > lineCount) return undefined;
  let low = Math.max(...widths);
  let high = columnEm;
  if (low > high) return undefined;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (wrap(words, widths, middle).length <= lineCount) high = middle;
    else low = middle;
  }
  return wrap(words, widths, high);
}

function layout(fontSize: number, renderedSize: number, lines: readonly string[]): PreviewNameLayout {
  return {
    fontSize,
    lineHeight: Math.round(fontSize * PREVIEW_NAME_LINE_HEIGHT * 10) / 10,
    letterSpacing: Math.round(fontSize * PREVIEW_NAME_LETTER_SPACING * 100) / 100,
    paddingTop: Math.ceil(renderedSize * Math.max(0, ACCENT_TOP + DESCENDER - PREVIEW_NAME_LINE_HEIGHT)),
    text: lines.join('\n'),
    lineCount: lines.length,
  };
}

/**
 * The size, line breaks and inset of a name set in a column `columnWidth`
 * points wide, under the reader's text scale `fontScale`.
 */
export function layoutPreviewName(name: string, columnWidth: number, fontScale: number): PreviewNameLayout {
  const scale = Math.min(Math.max(fontScale, 1), PREVIEW_NAME_MAX_FONT_SCALE);
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  const widths = words.map(estimatePreviewNameWidthEm);
  if (words.length === 0) return layout(PREVIEW_NAME_MAX_SIZE, PREVIEW_NAME_MAX_SIZE * scale, []);

  for (const step of STEPS) {
    for (let size = step.max; size >= step.min; size -= SIZE_STEP) {
      const lines = balancedWrap(words, widths, step.lines, columnWidth / (size * scale));
      if (lines !== undefined) return layout(size, size * scale, lines);
    }
  }

  // The floor: as many balanced lines as the name needs at the smallest size.
  const columnEm = columnWidth / (PREVIEW_NAME_MIN_SIZE * scale);
  const natural = wrap(words, widths, columnEm).length;
  const lines = balancedWrap(words, widths, natural, columnEm) ?? wrap(words, widths, columnEm);
  return layout(PREVIEW_NAME_MIN_SIZE, PREVIEW_NAME_MIN_SIZE * scale, lines);
}
