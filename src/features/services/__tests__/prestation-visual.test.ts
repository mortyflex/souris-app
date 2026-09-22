import { serviceCategoryColors } from '@/shared/ui/theme';

import { getPrestationFamily, getPrestationVisual } from '../prestation-visual';

const service = (name: string) => ({ name, type: 'SERVICE' as const });
const technique = (name: string) => ({ name, type: 'TECHNIQUE' as const });

describe('getPrestationVisual', () => {
  it('gives every Brushing the same family icon', () => {
    const icons = ['Brushing 1', 'Brushing 2', 'Brushing 3'].map(
      (name) => getPrestationVisual(service(name)).icon,
    );
    expect(getPrestationFamily(service('Brushing 1'))).toBe('BLOW_DRY');
    expect(new Set(icons.map((icon) => JSON.stringify(icon))).size).toBe(1);
  });

  it('maps the haircut family, before any other word of the name', () => {
    expect(getPrestationFamily(service('Coupe Femme / Homme'))).toBe('CUT');
    expect(getPrestationFamily(technique('Coupe Brushing 2'))).toBe('CUT');
    expect(getPrestationVisual(service('Coupe Femme / Homme')).icon).toEqual(
      getPrestationVisual(technique('Coupe Brushing 1')).icon,
    );
  });

  it('maps the imported families, ignoring case and accents', () => {
    expect(getPrestationFamily(service('Chignon'))).toBe('STYLING');
    expect(getPrestationFamily(technique('Couleur Racines'))).toBe('COLOR');
    expect(getPrestationFamily(technique('Balayage 3'))).toBe('BALAYAGE');
    expect(getPrestationFamily(technique('Gloss'))).toBe('GLOSS');
    expect(getPrestationFamily(technique('Soin Profond'))).toBe('CARE');
    expect(getPrestationFamily(technique('Traitement SOS'))).toBe('CARE');
    expect(getPrestationFamily(technique('DOSE SUPPLÉMENTAIRE'))).toBe('EXTRA_DOSE');
    expect(getPrestationFamily(technique('coloration végétale'))).toBe('COLOR');
  });

  it('matches word starts only, never a word inside another', () => {
    expect(getPrestationFamily(service('Recoupe'))).toBe('SERVICE_FALLBACK');
  });

  it('falls back on the type for an unknown name, never leaving the icon empty', () => {
    const unknownService = getPrestationVisual(service('Beauté des mains'));
    const unknownTechnique = getPrestationVisual(technique('Permanente'));
    expect(unknownService.family).toBe('SERVICE_FALLBACK');
    expect(unknownService.icon).toEqual({ ios: 'scissors', android: 'content_cut' });
    expect(unknownTechnique.family).toBe('TECHNIQUE_FALLBACK');
    expect(unknownTechnique.icon).toEqual({ ios: 'sparkles', android: 'auto_awesome' });
  });

  it('colours a Service violet and a Technique azure, from the category tokens', () => {
    const brushing = getPrestationVisual(service('Brushing 1'));
    const balayage = getPrestationVisual(technique('Balayage 1'));
    expect(brushing.iconColor).toBe(serviceCategoryColors.SERVICE.accent);
    expect(brushing.tint).toBe(serviceCategoryColors.SERVICE.tint);
    expect(balayage.iconColor).toBe(serviceCategoryColors.TECHNIQUE.accent);
    expect(balayage.tint).toBe(serviceCategoryColors.TECHNIQUE.tint);
    // The same family keeps its glyph whatever the type; only colours change.
    expect(getPrestationVisual(technique('Brushing 1')).icon).toEqual(brushing.icon);
    expect(getPrestationVisual(technique('Brushing 1')).iconColor).not.toBe(brushing.iconColor);
  });
});
