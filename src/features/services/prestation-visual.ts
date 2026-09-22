// Souris — Prestation family pictogram (presentation only)
//
// Prestations are recognised by an ICON, never a photo. The Service model
// holds no family field (legacy categories are not imported — only their
// slug survives inside some legacy ids, and new Prestations get a UUID), so
// the family is read from the NAME with a small ordered keyword table:
// accent- and case-insensitive, matched on word starts, so « Brushing 1 »,
// « Brushing 2 » and « Brushing 3 » share one icon. Nothing is stored, and
// no business rule ever depends on it.
//
// The FIRST matching family wins: « Coupe Brushing 1 » is a Coupe. An unknown
// name falls back on its type — scissors for a Service, sparkles for a
// Technique — so the icon area is never empty.
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
  SERVICE_FALLBACK: { ios: 'scissors', android: 'content_cut' },
  TECHNIQUE_FALLBACK: { ios: 'sparkles', android: 'auto_awesome' },
} as const satisfies Record<PrestationFamily, PlatformSymbolName>;

/** Ordered: the first family whose keyword starts a word of the name wins. */
const familyKeywords: readonly (readonly [PrestationFamily, readonly string[]])[] = [
  ['EXTRA_DOSE', ['dose']],
  ['BALAYAGE', ['balayage', 'meche']],
  ['GLOSS', ['gloss']],
  ['COLOR', ['couleur', 'coloration', 'racine']],
  ['CARE', ['soin', 'traitement']],
  ['STYLING', ['chignon', 'coiffage']],
  ['CUT', ['coupe']],
  ['BLOW_DRY', ['brushing']],
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
