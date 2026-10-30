import { serviceCategoryColors } from '@/shared/ui/theme';

import type { ServiceCategory } from '@/domain/services';

import {
  findPrestationCategory,
  getCategoryVisual,
  getPrestationFamily,
  getPrestationVisual,
} from '../prestation-visual';

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

  it('recognises nail prestations from the material or the nail, never from « pose » alone', () => {
    for (const name of [
      'Pose complète gel',
      'Remplissage gel',
      'Semi-permanent mains',
      'Ongles naturels',
      'Beauté des mains',
      'Manucure',
    ]) {
      expect(getPrestationFamily(service(name))).toBe('NAILS');
    }
    expect(getPrestationVisual(service('Pose complète gel')).icon).toEqual({ ios: 'hand.raised', android: 'back_hand' });
    // Hair extensions are also « posées »: the word alone decides nothing.
    expect(getPrestationFamily(service('Pose d’extensions'))).toBe('SERVICE_FALLBACK');
  });

  it('gives the feet, nail art, removal and repair their own glyph instead of one more hand', () => {
    for (const name of ['Semi-permanent pieds', 'Pédicure', 'Beauté des pieds', 'Beauté des mains et des pieds']) {
      expect(getPrestationFamily(service(name))).toBe('FEET');
    }
    expect(getPrestationVisual(service('Semi-permanent pieds')).icon).toEqual({ ios: 'shoeprints.fill', android: 'footprint' });
    expect(getPrestationFamily(service('Nail art'))).toBe('NAIL_ART');
    expect(getPrestationFamily(service('Nail art et modèles'))).toBe('NAIL_ART');
    expect(getPrestationFamily(service('Décoration strass'))).toBe('NAIL_ART');
    expect(getPrestationVisual(service('Nail art')).icon).toEqual({ ios: 'paintpalette', android: 'palette' });
    expect(getPrestationFamily(service('Dépose'))).toBe('NAIL_REMOVAL');
    expect(getPrestationFamily(service('Dépose gel'))).toBe('NAIL_REMOVAL');
    expect(getPrestationFamily(service('Déposes'))).toBe('NAIL_REMOVAL');
    expect(getPrestationVisual(service('Dépose')).icon).toEqual({ ios: 'eraser', android: 'ink_eraser' });
    expect(getPrestationFamily(service('Réparation d’un ongle'))).toBe('NAIL_REPAIR');
    expect(getPrestationVisual(service('Réparation d’un ongle')).icon).toEqual({ ios: 'bandage', android: 'healing' });

    // The demo nail catalogue no longer reads as one repeated hand.
    const icons = ['Pose complète gel', 'Semi-permanent pieds', 'Dépose', 'Nail art', 'Réparation d’un ongle'].map(
      (name) => JSON.stringify(getPrestationVisual(service(name)).icon),
    );
    expect(new Set(icons).size).toBe(5);
  });

  it('recognises esthetics prestations: hair removal, lashes & brows, face and body', () => {
    expect(getPrestationFamily(service('Épilation sourcils'))).toBe('HAIR_REMOVAL');
    expect(getPrestationFamily(service('Épilation jambes'))).toBe('HAIR_REMOVAL');
    expect(getPrestationFamily(service('Beauté du regard'))).toBe('LASHES_BROWS');
    expect(getPrestationFamily(technique('Rehaussement de cils'))).toBe('LASHES_BROWS');
    expect(getPrestationFamily(service('Restructuration sourcils'))).toBe('LASHES_BROWS');
    expect(getPrestationFamily(service('Massage 60 min'))).toBe('BODY');
    expect(getPrestationFamily(service('Gommage corps'))).toBe('BODY');
    // The body area says more than « soin »: a facial reads as a face, a body care as the body.
    expect(getPrestationFamily(technique('Soin du visage'))).toBe('FACE');
    expect(getPrestationFamily(service('Soins du corps'))).toBe('BODY');
    expect(getPrestationVisual(technique('Soin du visage')).icon).toEqual({ ios: 'face.smiling', android: 'face' });
    // Any other care stays a soin, for every profession.
    expect(getPrestationFamily(service('Soin des mains'))).toBe('CARE');
  });

  it('reads a category name with the same table and a neutral fallback', () => {
    expect(getCategoryVisual({ name: 'Beauté des pieds' }).icon).toEqual(getPrestationVisual(service('Semi-permanent pieds')).icon);
    expect(getCategoryVisual({ name: 'Déposes' }).family).toBe('NAIL_REMOVAL');
    expect(getCategoryVisual({ name: 'Extensions et poses en gel' }).family).toBe('NAILS');
    expect(getCategoryVisual({ name: 'Soins du visage' }).family).toBe('FACE');
    expect(getCategoryVisual({ name: 'Couleurs' }).family).toBe('COLOR');
    // An unknown category is never a haircut.
    const unknown = getCategoryVisual({ name: 'Forfaits' });
    expect(unknown.family).toBe('CATEGORY_FALLBACK');
    expect(unknown.icon).toEqual({ ios: 'square.grid.2x2', android: 'category' });
    expect(unknown.iconColor).toBe(serviceCategoryColors.SERVICE.accent);
  });

  it('keeps every hairdressing family and keyword ahead of the other professions', () => {
    // The Production catalogue resolves exactly as before this table grew.
    expect(getPrestationFamily(service('Coupe Femme'))).toBe('CUT');
    expect(getPrestationFamily(service('Coupe Brushing 1'))).toBe('CUT');
    expect(getPrestationFamily(service('Brushing 2'))).toBe('BLOW_DRY');
    expect(getPrestationFamily(service('Chignon'))).toBe('STYLING');
    expect(getPrestationFamily(technique('Balayage 1'))).toBe('BALAYAGE');
    expect(getPrestationFamily(technique('Couleur Racines'))).toBe('COLOR');
    expect(getPrestationFamily(technique('Dose Supplémentaire'))).toBe('EXTRA_DOSE');
    expect(getPrestationFamily(technique('Soin Classique'))).toBe('CARE');
    expect(getPrestationFamily(technique('Traitement SOS'))).toBe('CARE');
  });

  it('falls back on the type for an unknown name, never leaving the icon empty', () => {
    const unknownService = getPrestationVisual(service('Forfait découverte'));
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

// Icons that read the category, then the profession, when the name tells nothing — the
// unified catalogue (nails, esthetics, wellness) only.
describe('profession- and category-aware prestation icons', () => {
  const category = (id: string, name: string, businessId = 'business-1'): ServiceCategory => ({
    id,
    businessId,
    name,
    position: 0,
  });
  const ART = category('cat-art', 'Nail art et modèles');
  const french = { ...service('French classique'), businessId: 'business-1', categoryId: 'cat-art' };
  const familyIn = (
    activityType: 'NAILS' | 'ESTHETICS' | 'WELLNESS' | 'HAIRDRESSING',
    prestation: Parameters<typeof getPrestationFamily>[0] & Parameters<typeof findPrestationCategory>[0],
    categories: readonly ServiceCategory[],
  ) => getPrestationFamily(prestation, { activityType, category: findPrestationCategory(prestation, categories) });

  it('reads « French classique » from its category « Nail art et modèles »: the palette, never scissors', () => {
    expect(getPrestationFamily(service('French classique'))).toBe('SERVICE_FALLBACK');
    expect(familyIn('NAILS', french, [ART])).toBe('NAIL_ART');
    expect(getPrestationVisual(french, { activityType: 'NAILS', category: ART }).icon).toEqual({
      ios: 'paintpalette',
      android: 'palette',
    });
  });

  it('lets a recognised name win over its category', () => {
    const feet = { ...service('Semi-permanent pieds'), businessId: 'business-1', categoryId: 'cat-art' };
    expect(familyIn('NAILS', feet, [ART])).toBe('FEET');
    for (const [name, family] of [
      ['Dépose', 'NAIL_REMOVAL'],
      ['Dépose par dissolution', 'NAIL_REMOVAL'],
      ['Réparation d’un ongle', 'NAIL_REPAIR'],
      ['Soin du visage avec masque', 'FACE'],
    ] as const) {
      expect(familyIn('NAILS', { ...service(name), businessId: 'business-1' }, [])).toBe(family);
    }
  });

  it('reads a renamed category under its current name, and ignores a missing or foreign one', () => {
    expect(familyIn('NAILS', french, [category('cat-art', 'Beauté des pieds')])).toBe('FEET');
    // Deleted (dangling id) or uncategorised: the profession's glyph.
    expect(familyIn('NAILS', french, [])).toBe('NAILS');
    expect(familyIn('NAILS', { ...french, categoryId: undefined }, [ART])).toBe('NAILS');
    // Same id, another Business: never read.
    const foreign = category('cat-art', 'Nail art et modèles', 'business-2');
    expect(findPrestationCategory(french, [foreign])).toBeUndefined();
    expect(familyIn('NAILS', french, [foreign])).toBe('NAILS');
    // A category name the table does not know tells nothing either.
    expect(familyIn('NAILS', french, [category('cat-art', 'Mes favoris')])).toBe('NAILS');
  });

  it('falls back on the profession: the hand for nails, the care bubbles for esthetics', () => {
    const unknown = { ...service('Création sur mesure'), businessId: 'business-1' };
    expect(familyIn('NAILS', unknown, [])).toBe('NAILS');
    expect(familyIn('NAILS', { ...unknown, type: 'TECHNIQUE' }, [])).toBe('NAILS');
    expect(familyIn('ESTHETICS', unknown, [])).toBe('CARE');
    expect(getPrestationVisual(unknown, { activityType: 'ESTHETICS' }).icon).toEqual({
      ios: 'bubbles.and.sparkles',
      android: 'spa',
    });
  });

  it('keeps hairdressing exactly as before: the name, then the type — the category is not read', () => {
    const colours = category('cat-colour', 'Couleurs');
    const ombre = { ...service('Ombré'), businessId: 'business-1', categoryId: 'cat-colour' };
    expect(familyIn('HAIRDRESSING', ombre, [colours])).toBe('SERVICE_FALLBACK');
    expect(familyIn('HAIRDRESSING', { ...ombre, type: 'TECHNIQUE' }, [colours])).toBe('TECHNIQUE_FALLBACK');
    expect(familyIn('HAIRDRESSING', { ...service('Brushing 2'), businessId: 'business-1' }, [])).toBe('BLOW_DRY');
    for (const activity of ['BARBER', 'LASHES_BROWS', 'MAKEUP', 'OTHER'] as const) {
      expect(getPrestationFamily(service('Création sur mesure'), { activityType: activity })).toBe('SERVICE_FALLBACK');
    }
  });

  it('wellness reads the name, then the category, then the body at rest — never scissors', () => {
    expect(familyIn('WELLNESS', { ...service('Massage relaxant 1 h'), businessId: 'business-1' }, [])).toBe('BODY');
    expect(familyIn('WELLNESS', { ...service('Massage des pieds'), businessId: 'business-1' }, [])).toBe('FEET');
    const unknown = { ...service('Rituel signature'), businessId: 'business-1', categoryId: 'cat-face' };
    expect(familyIn('WELLNESS', unknown, [category('cat-face', 'Soins du visage')])).toBe('FACE');
    expect(familyIn('WELLNESS', unknown, [])).toBe('BODY');
    expect(getPrestationVisual(unknown, { activityType: 'WELLNESS' }).icon).toEqual({
      ios: 'figure.mind.and.body',
      android: 'self_improvement',
    });
  });
});
