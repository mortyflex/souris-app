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
// same way a « Coupe » is. The Business activity is deliberately NOT read:
// one name always gives one family, whatever the profession.
//
// The FIRST matching family wins: « Coupe Brushing 1 » is a Coupe, « Soin du
// visage » is a Soin. An unknown name falls back on its type — scissors for a
// Service, sparkles for a Technique — so the icon area is never empty.
//
// Colours are the validated category colours (`serviceCategoryColors`), keyed
// by the domain type: violet for a Service, azure for a Technique.

import type { Service, ServiceType } from '@/domain/appointments';
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
  | 'NAILS'
  | 'HAIR_REMOVAL'
  | 'LASHES_BROWS'
  | 'BODY'
  | 'SERVICE_FALLBACK'
  | 'TECHNIQUE_FALLBACK';

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
  // The hand of the profession card (activity-options.ts), so a nail
  // prestation is recognised with the same glyph from onboarding onwards.
  NAILS: { ios: 'hand.raised', android: 'back_hand' },
  // No wax strip in either symbol set: the leaf reads as smooth skin.
  HAIR_REMOVAL: { ios: 'leaf', android: 'spa' },
  LASHES_BROWS: { ios: 'eye', android: 'visibility' },
  BODY: { ios: 'figure.mind.and.body', android: 'self_improvement' },
  SERVICE_FALLBACK: { ios: 'scissors', android: 'content_cut' },
  TECHNIQUE_FALLBACK: { ios: 'sparkles', android: 'auto_awesome' },
} as const satisfies Record<PrestationFamily, PlatformSymbolName>;

/**
 * Ordered: the first family whose keyword starts a word of the name wins.
 * The hairdressing families keep their original order and keywords; the
 * other professions follow, so no existing hair prestation changes family.
 * Keywords are compared after accent stripping (« épilation » → `epilation`).
 */
const familyKeywords: readonly (readonly [PrestationFamily, readonly string[]])[] = [
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
  ['NAILS', ['ongle', 'nail', 'gel', 'semi', 'remplissage', 'depose', 'manucure', 'pedicure', 'vernis', 'capsule', 'main', 'pied']],
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

export function getPrestationFamily(prestation: Pick<Service, 'name' | 'type'>): PrestationFamily {
  const words = nameWords(prestation.name);
  const match = familyKeywords.find(([, keywords]) =>
    words.some((word) => keywords.some((keyword) => word.startsWith(keyword))),
  );
  return match?.[0] ?? fallbackFamilies[prestation.type];
}

export function getPrestationVisual(prestation: Pick<Service, 'name' | 'type'>): PrestationVisual {
  const family = getPrestationFamily(prestation);
  const colors = serviceCategoryColors[prestation.type];
  return {
    family,
    icon: familyIcons[family],
    tint: colors.tint,
    iconColor: colors.accent,
  };
}
