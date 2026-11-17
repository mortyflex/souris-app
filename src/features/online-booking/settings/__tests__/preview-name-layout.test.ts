// BeautIzzy — the name of the public-page preview: size, balanced lines, inset

import {
  PREVIEW_NAME_MAX_SIZE,
  PREVIEW_NAME_MIN_SIZE,
  estimatePreviewNameWidthEm,
  layoutPreviewName,
} from '../preview-name-layout';

// The text column of the preview panel (screen − gutters − panel inset − padding).
const IPHONE_17_PRO = 402 - 40 - 24 - 40; // 298
const IPHONE_SE = 375 - 40 - 24 - 40; // 271
const ANDROID_PIXEL = 427 - 32 - 24 - 40; // 331

const LONG =
  'Institut de beauté Cœur d’Ébène — soins du visage, onglerie, extensions de cils & maquillage permanent à Aix-en-Provence';

const linesOf = (text: string) => text.split('\n');

describe('layoutPreviewName', () => {
  it('keeps a short name on one line at the largest size', () => {
    const layout = layoutPreviewName('Atelier Éléonore', IPHONE_17_PRO, 1);
    expect(layout).toMatchObject({ fontSize: PREVIEW_NAME_MAX_SIZE, lineCount: 1, text: 'Atelier Éléonore' });
  });

  it('fits « Studio Esthetique Pro » on one line, smaller where the column is narrower', () => {
    expect(layoutPreviewName('Studio Esthetique Pro', ANDROID_PIXEL, 1)).toMatchObject({ fontSize: 30, lineCount: 1 });
    expect(layoutPreviewName('Studio Esthetique Pro', IPHONE_17_PRO, 1)).toMatchObject({ fontSize: 28, lineCount: 1 });
    expect(layoutPreviewName('Studio Esthetique Pro', IPHONE_SE, 1)).toMatchObject({ fontSize: 25.5, lineCount: 1 });
  });

  it('wraps a longer name into balanced lines rather than leaving a lone last word', () => {
    const layout = layoutPreviewName('Élégance Éléonore Joséphine Rive Gauche', IPHONE_17_PRO, 1);
    expect(layout.lineCount).toBe(2);
    expect(linesOf(layout.text)).toEqual(['Élégance Éléonore', 'Joséphine Rive Gauche']);
    expect(layout.fontSize).toBeLessThanOrEqual(26);
    const [first, second] = linesOf(layout.text).map(estimatePreviewNameWidthEm);
    expect(Math.min(first ?? 0, second ?? 0) / Math.max(first ?? 0, second ?? 0)).toBeGreaterThan(0.6);
  });

  it('shows a 120-character name whole, at the floor size, every line within the column', () => {
    const layout = layoutPreviewName(LONG, IPHONE_17_PRO, 1);
    expect(layout.fontSize).toBe(PREVIEW_NAME_MIN_SIZE);
    expect(layout.text.replace(/\n/g, ' ')).toBe(LONG);
    for (const line of linesOf(layout.text)) {
      expect(estimatePreviewNameWidthEm(line) * layout.fontSize).toBeLessThanOrEqual(IPHONE_17_PRO);
    }
  });

  it('never goes above the largest or below the smallest size', () => {
    for (const name of ['A', 'Zoë', 'Studio Esthetique Pro', LONG, 'Trèslongnomsansaucuneespace'.repeat(4)]) {
      for (const column of [IPHONE_SE, IPHONE_17_PRO, ANDROID_PIXEL, 600]) {
        const { fontSize } = layoutPreviewName(name, column, 1);
        expect(fontSize).toBeGreaterThanOrEqual(PREVIEW_NAME_MIN_SIZE);
        expect(fontSize).toBeLessThanOrEqual(PREVIEW_NAME_MAX_SIZE);
      }
    }
  });

  it('keeps an unbreakable word intact rather than dropping any of it', () => {
    const word = 'Trèslongnomsansaucuneespace'.repeat(4);
    const layout = layoutPreviewName(word, IPHONE_17_PRO, 1);
    expect(layout).toMatchObject({ fontSize: PREVIEW_NAME_MIN_SIZE, text: word });
  });

  it('gives the first line room for an accented capital', () => {
    // React Native on iOS cuts a line taller than its line height from the
    // top: the first baseline sits at paddingTop + lineHeight − descender.
    // Fraunces 400: descender 0.255em, highest French accent « Å » 0.905em.
    for (const name of ['Éclat', 'Élégance Éléonore Joséphine Rive Gauche', LONG]) {
      for (const fontScale of [1, 1.2]) {
        const { fontSize, lineHeight, paddingTop } = layoutPreviewName(name, IPHONE_17_PRO, fontScale);
        const scaled = fontSize * fontScale;
        expect(paddingTop + lineHeight * fontScale - 0.255 * scaled).toBeGreaterThanOrEqual(0.905 * scaled);
      }
    }
  });

  it('follows the reader’s text size up to ×1.2, so the scaled name still fits', () => {
    const scaled = layoutPreviewName('Studio Esthetique Pro', IPHONE_17_PRO, 1.2);
    for (const line of linesOf(scaled.text)) {
      expect(estimatePreviewNameWidthEm(line) * scaled.fontSize * 1.2).toBeLessThanOrEqual(IPHONE_17_PRO);
    }
    expect(layoutPreviewName('Studio Esthetique Pro', IPHONE_17_PRO, 3)).toEqual(scaled);
    // A smaller text setting never shrinks the name below its normal layout.
    expect(layoutPreviewName('Studio Esthetique Pro', IPHONE_17_PRO, 0.8)).toEqual(
      layoutPreviewName('Studio Esthetique Pro', IPHONE_17_PRO, 1),
    );
  });

  it('is deterministic and tolerates an empty name', () => {
    expect(layoutPreviewName(LONG, IPHONE_17_PRO, 1)).toEqual(layoutPreviewName(LONG, IPHONE_17_PRO, 1));
    expect(layoutPreviewName('   ', IPHONE_17_PRO, 1)).toMatchObject({ text: '', lineCount: 0 });
  });
});
