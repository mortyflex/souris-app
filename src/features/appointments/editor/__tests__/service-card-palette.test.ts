import { lavender, mint, serviceCardColors } from '@/shared/ui/theme';

import { getServiceCardFamily, getServiceCardPalette } from '../service-card-palette';

const mintTones: readonly string[] = Object.values(mint);
const violetTones: readonly string[] = [...Object.values(lavender), serviceCardColors.other.selectedBorder];

describe('service card palette', () => {
  it('reads the family from the Service type: SERVICE is simple, anything else is other', () => {
    expect(getServiceCardFamily('SERVICE')).toBe('simple');
    expect(getServiceCardFamily('TECHNIQUE')).toBe('other');
  });

  it('resolves a simple service to the mint palette', () => {
    expect(getServiceCardPalette('SERVICE', false)).toEqual({
      family: 'simple',
      background: mint.mint050,
      border: mint.mint200,
      title: mint.mint700,
      subtitle: mint.mint650,
      accent: mint.mint600,
    });
  });

  it('resolves a non-simple service to the existing lavender palette', () => {
    const palette = getServiceCardPalette('TECHNIQUE', false);

    expect(palette.family).toBe('other');
    expect(palette.background).toBe(lavender.lav050);
    expect(palette.border).toBe(lavender.lav200);
    expect(palette.title).toBe(lavender.lav700);
  });

  it('keeps a selected simple service in the mint family, only stronger', () => {
    const idle = getServiceCardPalette('SERVICE', false);
    const selected = getServiceCardPalette('SERVICE', true);

    expect(selected.family).toBe('simple');
    expect(mintTones).toEqual(
      expect.arrayContaining([selected.background, selected.border, selected.accent]),
    );
    expect(selected.background).not.toBe(idle.background);
    expect(selected.border).not.toBe(idle.border);
    expect(selected.title).toBe(idle.title);
    expect(selected.subtitle).toBe(idle.subtitle);
  });

  it('keeps a selected non-simple service in the violet family, only stronger', () => {
    const idle = getServiceCardPalette('TECHNIQUE', false);
    const selected = getServiceCardPalette('TECHNIQUE', true);

    expect(selected.family).toBe('other');
    expect(violetTones).toEqual(
      expect.arrayContaining([selected.background, selected.border, selected.accent]),
    );
    expect(selected.background).not.toBe(idle.background);
    expect(selected.border).not.toBe(idle.border);
    expect(selected.title).toBe(idle.title);
  });

  it('never shares a colour between the two families, selected or not', () => {
    for (const selected of [false, true]) {
      const simple = getServiceCardPalette('SERVICE', selected);
      const other = getServiceCardPalette('TECHNIQUE', selected);

      expect(simple.background).not.toBe(other.background);
      expect(simple.border).not.toBe(other.border);
      expect(simple.title).not.toBe(other.title);
      expect(simple.accent).not.toBe(other.accent);
    }
  });
});
