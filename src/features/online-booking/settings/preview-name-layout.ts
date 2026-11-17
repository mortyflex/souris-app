// BeautIzzy — the professional's name in the public-page preview
//
// The name is set in Fraunces 400 (docs/design/BRAND_TYPOGRAPHY.md §8).
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
// A display line height can be tighter than the font's own line box, and
// React Native on iOS then cuts the line from the top: whatever rises above
// `lineHeight − descender` on the first line is drawn outside the text frame
// and clipped — the accent of « É » would disappear. `paddingTop` gives the
// first line that room back, from the font's metrics, on both platforms
// (Android draws outside instead of clipping; the same inset keeps the two
// identical). Fraunces' accents are low enough that the 1.18em leading
// already holds them: the inset is 0 — the rule stays, should the leading or
// the face change.
//
// Pure and deterministic: same name, same width, same text scale → same layout.

/**
 * Advance widths of Fraunces 400 (em), read from Fraunces_400Regular.ttf. Where
 * the font substitutes a text-size form (`rvrn`: « & », h, m, n, s), the wider
 * of the two is kept, so the estimate never falls short.
 */
const ADVANCES: Readonly<Record<string, number>> = {
  a: 0.541, b: 0.592, c: 0.507, d: 0.605, e: 0.52, f: 0.366, g: 0.558, h: 0.621, i: 0.3, j: 0.3, k: 0.595, l: 0.303, m: 0.936,
  n: 0.621, o: 0.583, p: 0.607, q: 0.592, r: 0.452, s: 0.468, t: 0.363, u: 0.607, v: 0.549, w: 0.809, x: 0.529, y: 0.553, z: 0.474,
  A: 0.712, B: 0.677, C: 0.696, D: 0.781, E: 0.645, F: 0.595, G: 0.757, H: 0.828, I: 0.381, J: 0.469, K: 0.758, L: 0.615, M: 0.898,
  N: 0.776, O: 0.794, P: 0.664, Q: 0.794, R: 0.714, S: 0.59, T: 0.675, U: 0.743, V: 0.701, W: 1.032, X: 0.723, Y: 0.681, Z: 0.636,
  '0': 0.648, '1': 0.448, '2': 0.594, '3': 0.539, '4': 0.595, '5': 0.565, '6': 0.592, '7': 0.505, '8': 0.581, '9': 0.596,
  '.': 0.242, ',': 0.253, '-': 0.416, '–': 0.515, '—': 0.819, '’': 0.209, "'": 0.157, '&': 0.96, ':': 0.248, ';': 0.259,
  '!': 0.308, '?': 0.494, '(': 0.345, ')': 0.345, '/': 0.491, '+': 0.556, '"': 0.336, '«': 0.554, '»': 0.554, '@': 0.884,
  '#': 0.648, '*': 0.624, '°': 0.395, '·': 0.273, œ: 0.897, Œ: 0.988, æ: 0.824, Æ: 0.974,
};
const SPACE_ADVANCE = 0.225;
/** An unknown glyph is taken as a wide capital: the name steps down early rather than overflow. */
const UNKNOWN_ADVANCE = 0.8;
/** Every width is over-estimated by this share (kerning, rounding, the fallback serif). */
const SAFETY = 1.04;

/** Font metrics of Fraunces (em): the descender, and the highest French accent (« Å » 0.905, « É » 0.887). */
const DESCENDER = 0.255;
const ACCENT_TOP = 0.905;

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
