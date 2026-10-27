// BeautIzzy — the profession cards of onboarding (presentation)
//
// The professions of the domain (`PROFESSIONS`), in product order, each with
// its French label, one short line of what it covers, its availability and a
// pictogram: SF Symbols ≤ 4.0 on iOS (16.4 deployment target), Material
// Symbols on Android — never emoji. The vocabulary and the availability are
// the domain's; this only dresses them. Nothing here is persisted.
//
// A `COMING_SOON` profession is shown so the professional knows BeautIzzy is
// coming for them, and reads « Bientôt disponible »: it is never selectable.
// The pictogram table still covers EVERY stored activity: an existing
// Business created with an identifier that onboarding no longer offers keeps
// its glyph wherever the activity is recalled.

import { PROFESSIONS, type BusinessActivityType, type ProfessionAvailability, type ProfessionId } from '@/domain/business';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';

import { formatBusinessActivityType } from '../presentation';

export const COMING_SOON_LABEL = 'Bientôt disponible';

export interface ActivityOption {
  readonly type: ProfessionId;
  readonly label: string;
  readonly description: string;
  readonly availability: ProfessionAvailability;
  readonly icon: PlatformSymbolName;
}

const activityIcons = {
  HAIRDRESSING: { ios: 'scissors', android: 'content_cut' },
  NAILS: { ios: 'hand.raised', android: 'back_hand' },
  ESTHETICS: { ios: 'leaf', android: 'spa' },
  LASHES_BROWS: { ios: 'eye', android: 'visibility' },
  MAKEUP: { ios: 'paintbrush.pointed', android: 'brush' },
  BARBER: { ios: 'mustache', android: 'face' },
  WELLNESS: { ios: 'figure.mind.and.body', android: 'self_improvement' },
  OTHER: { ios: 'ellipsis.circle', android: 'more_horiz' },
} as const satisfies Record<BusinessActivityType, PlatformSymbolName>;

/** One short line per profession: what BeautIzzy covers for it — never a promise of a feature. */
const activityDescriptions: Record<ProfessionId, string> = {
  HAIRDRESSING: 'Coupes, colorations, techniques et temps de pose.',
  NAILS: 'Poses, remplissages, semi-permanent et nail art.',
  ESTHETICS: 'Soins du visage et du corps, épilations.',
};

export const ACTIVITY_OPTIONS: readonly ActivityOption[] = PROFESSIONS.map((profession) => ({
  type: profession.id,
  label: formatBusinessActivityType(profession.id),
  description: activityDescriptions[profession.id],
  availability: profession.availability,
  icon: activityIcons[profession.id],
}));

export function getActivityIcon(activityType: BusinessActivityType): PlatformSymbolName {
  return activityIcons[activityType];
}
