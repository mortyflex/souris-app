// BeautIzzy — Prestation family pictogram (presentation only)
//
// Prestations are recognised by an ICON, never a photo. The Service model
// holds no family field (legacy categories are not imported — only their
// slug survives inside some legacy ids, and new Prestations get a UUID), so
// the family is read from the NAME with a small ordered keyword table:
// accent- and case-insensitive, matched on word starts, so « Brushing 1 »,
// « Brushing 2 » and « Brushing 3 » share one icon. Nothing is stored, and
// no business rule ever depends on it.
//
// The table covers the professions BeautIzzy is built for — hairdressing
// first (the validated Production catalogue, unchanged), then nail services,
// hair removal, lashes & brows and body care — so a nail technician's « Pose
// complète gel » or an esthetician's « Épilation jambes » is recognised the
// same way a « Coupe » is. A recognised name always gives one family,
// whatever the profession; the activity only decides what an unrecognised
// name reads instead (below).
//
// The FIRST matching family wins: « Coupe Brushing 1 » is a Coupe. A few
// words name a body area that no hairdressing prestation uses — the feet, the
// face, the body — and lead the table, so « Semi-permanent pieds » reads as a
// foot and « Soin du visage » as a face rather than one more hand or bubble.
// Inside the nail families, the act decides before the material: nail art,
// removal and repair each have their own glyph; sets, infills and natural
// nails keep the hand. An unknown name falls back on its type — scissors for
// a Service, sparkles for a Technique — so the icon area is never empty.
//
// Profession- and category-aware (`PrestationVisualContext`), for the unified
// catalogue (nails, esthetics) only — the priority is deterministic:
//   1. the prestation's NAME, through the table above;
//   2. otherwise its professional CATEGORY's name, through the same table
//      (« French classique » in « Nail art et modèles » → the palette) — the
//      category is read by id from the Business's own categories
//      (`findPrestationCategory`), so a renamed category is read under its
//      current name, and a missing, deleted or foreign one is ignored;
//   3. otherwise the profession's neutral glyph: the hand for nails, the
//      care bubbles for esthetics — never scissors.
// The Services / Techniques experience (hairdressing and every other stored
// activity) ignores the context: the name, then the type fallback, exactly
// as before. Nothing is stored.
//
// A professional category reads through the same table (`getCategoryVisual`):
// « Beauté des pieds » and « Semi-permanent pieds » share the foot. An unknown
// category name falls back on a neutral grid, never on a hairdressing glyph.
//
// Colours are the validated category colours (`serviceCategoryColors`), keyed
// by the domain type: violet for a Service, azure for a Technique.

import type { Service, ServiceType } from '@/domain/appointments';
import type { BusinessActivityType } from '@/domain/business';
import { resolveServiceCategory, type ServiceCategory } from '@/domain/services';
import { getCataloguePresentation } from '@/features/services/catalogue-presentation';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { serviceCategoryColors } from '@/shared/ui/theme';

export type PrestationFamily =
  | 'EXTRA_DOSE'
  | 'BALAYAGE'
  | 'GLOSS'
  | 'COLOR'
  | 'CARE'
  | 'STYLING'
  | 'CUT'
  | 'BLOW_DRY'
  | 'FEET'
  | 'FACE'
  | 'NAIL_ART'
  | 'NAIL_REMOVAL'
  | 'NAIL_REPAIR'
  | 'NAILS'
  | 'HAIR_REMOVAL'
  | 'LASHES_BROWS'
  | 'BODY'
  | 'SERVICE_FALLBACK'
  | 'TECHNIQUE_FALLBACK'
  | 'CATEGORY_FALLBACK';

// SF Symbols ≤ 4.0 only (iOS 16.4 deployment target); Material on Android.
const familyIcons = {
  EXTRA_DOSE: { ios: 'eyedropper.halffull', android: 'colorize' },
  BALAYAGE: { ios: 'paintbrush', android: 'format_paint' },
  GLOSS: { ios: 'drop', android: 'water_drop' },
  COLOR: { ios: 'paintbrush.pointed', android: 'brush' },
  CARE: { ios: 'bubbles.and.sparkles', android: 'spa' },
  STYLING: { ios: 'comb', android: 'face_3' },
  CUT: { ios: 'scissors', android: 'content_cut' },
  // SF Symbols has no hair dryer: the blown air stands for the brushing.
  BLOW_DRY: { ios: 'wind', android: 'air' },
  FEET: { ios: 'shoeprints.fill', android: 'footprint' },
  FACE: { ios: 'face.smiling', android: 'face' },
  NAIL_ART: { ios: 'paintpalette', android: 'palette' },
  NAIL_REMOVAL: { ios: 'eraser', android: 'ink_eraser' },
  NAIL_REPAIR: { ios: 'bandage', android: 'healing' },
  // The hand of the profession card (activity-options.ts), so a nail
  // prestation is recognised with the same glyph from onboarding onwards.
  NAILS: { ios: 'hand.raised', android: 'back_hand' },
  // No wax strip in either symbol set: the leaf reads as smooth skin.
  HAIR_REMOVAL: { ios: 'leaf', android: 'spa' },
  LASHES_BROWS: { ios: 'eye', android: 'visibility' },
  BODY: { ios: 'figure.mind.and.body', android: 'self_improvement' },
  SERVICE_FALLBACK: { ios: 'scissors', android: 'content_cut' },
  TECHNIQUE_FALLBACK: { ios: 'sparkles', android: 'auto_awesome' },
  CATEGORY_FALLBACK: { ios: 'square.grid.2x2', android: 'category' },
} as const satisfies Record<PrestationFamily, PlatformSymbolName>;

/**
 * Ordered: the first family whose keyword starts a word of the name wins.
 * The body-area words lead (no hairdressing prestation names a foot, a face
 * or the body); the hairdressing families then keep their original order and
 * keywords, and the other professions follow, so no existing hair prestation
 * changes family. Keywords are compared after accent stripping
 * (« épilation » → `epilation`).
 */
const familyKeywords: readonly (readonly [PrestationFamily, readonly string[]])[] = [
  ['FEET', ['pied', 'pedicure', 'orteil']],
  ['FACE', ['visage']],
  ['BODY', ['corps']],
  ['EXTRA_DOSE', ['dose']],
  ['BALAYAGE', ['balayage', 'meche']],
  ['GLOSS', ['gloss']],
  ['COLOR', ['couleur', 'coloration', 'racine']],
  ['CARE', ['soin', 'traitement']],
  ['STYLING', ['chignon', 'coiffage']],
  ['CUT', ['coupe']],
  ['BLOW_DRY', ['brushing']],
  // « pose » alone is deliberately absent: it also starts hair wording
  // (« Pose d'extensions »); the material or the nail itself is what tells.
  // The act before the material: « Nail art », « Dépose gel » and « Réparation
  // d’un ongle » are not one more hand.
  ['NAIL_ART', ['art', 'decor', 'strass', 'modele']],
  ['NAIL_REMOVAL', ['depose', 'retrait']],
  ['NAIL_REPAIR', ['reparation']],
  ['NAILS', ['ongle', 'nail', 'gel', 'semi', 'remplissage', 'manucure', 'vernis', 'capsule', 'main']],
  ['HAIR_REMOVAL', ['epilation', 'cire']],
  ['LASHES_BROWS', ['cil', 'sourcil', 'regard', 'rehaussement']],
  ['BODY', ['massage', 'modelage', 'gommage', 'corps']],
];

const fallbackFamilies: Record<ServiceType, PrestationFamily> = {
  SERVICE: 'SERVICE_FALLBACK',
  TECHNIQUE: 'TECHNIQUE_FALLBACK',
};

export interface PrestationVisual {
  readonly family: PrestationFamily;
  readonly icon: PlatformSymbolName;
  readonly tint: string;
  readonly iconColor: string;
}

function nameWords(name: string): readonly string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function matchFamily(name: string): PrestationFamily | undefined {
  const words = nameWords(name);
  const match = familyKeywords.find(([, keywords]) =>
    words.some((word) => keywords.some((keyword) => word.startsWith(keyword))),
  );
  return match?.[0];
}

/** What the unified catalogue may read beyond the name (presentation only). */
export interface PrestationVisualContext {
  readonly activityType: BusinessActivityType;
  /** The prestation's category, from `findPrestationCategory`; absent when uncategorised. */
  readonly category?: Pick<ServiceCategory, 'name'>;
}

/** The profession's neutral glyph when neither the name nor the category tells. */
const professionFallbackFamilies: Partial<Record<BusinessActivityType, PrestationFamily>> = {
  NAILS: 'NAILS',
  ESTHETICS: 'CARE',
};

/**
 * The prestation's category among the Business's categories: by id, and only
 * when it belongs to the prestation's own Business. A dangling id (a deleted
 * category, one not synced yet) gives none.
 */
export function findPrestationCategory(
  prestation: Pick<Service, 'businessId' | 'categoryId'>,
  categories: readonly ServiceCategory[],
): ServiceCategory | undefined {
  const category = resolveServiceCategory(prestation, categories);
  return category?.businessId === prestation.businessId ? category : undefined;
}

export function getPrestationFamily(
  prestation: Pick<Service, 'name' | 'type'>,
  context?: PrestationVisualContext,
): PrestationFamily {
  const named = matchFamily(prestation.name);
  if (named) return named;
  if (context && getCataloguePresentation(context.activityType).organization === 'CATEGORIES') {
    const categorised = context.category && matchFamily(context.category.name);
    if (categorised) return categorised;
    const professional = professionFallbackFamilies[context.activityType];
    if (professional) return professional;
  }
  return fallbackFamilies[prestation.type];
}

export function getPrestationVisual(
  prestation: Pick<Service, 'name' | 'type'>,
  context?: PrestationVisualContext,
): PrestationVisual {
  const family = getPrestationFamily(prestation, context);
  const colors = serviceCategoryColors[prestation.type];
  return {
    family,
    icon: familyIcons[family],
    tint: colors.tint,
    iconColor: colors.accent,
  };
}

/**
 * The pictogram of a professional category, read from its name with the same
 * table, in the neutral Service colours. An unknown name gets the category
 * grid — a category is not a haircut.
 */
export function getCategoryVisual(category: Pick<ServiceCategory, 'name'>): PrestationVisual {
  const family = matchFamily(category.name) ?? 'CATEGORY_FALLBACK';
  const colors = serviceCategoryColors.SERVICE;
  return {
    family,
    icon: familyIcons[family],
    tint: colors.tint,
    iconColor: colors.accent,
  };
}
