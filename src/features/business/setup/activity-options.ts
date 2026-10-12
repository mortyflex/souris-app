// BeautIzzy — the primary-activity tiles of onboarding (presentation)
//
// The eight activities in the order the onboarding grid shows them, each
// with its French label and a pictogram: SF Symbols ≤ 4.0 on iOS (16.4
// deployment target), Material Symbols on Android — never emoji. The
// vocabulary itself is the domain's (`BUSINESS_ACTIVITY_TYPES`); this only
// orders and dresses it. Nothing here is persisted.

import type { BusinessActivityType } from '@/domain/business';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';

import { formatBusinessActivityType } from '../presentation';

export interface ActivityOption {
  readonly type: BusinessActivityType;
  readonly label: string;
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

/** The grid order of the onboarding step: the common beauty professions first, « Autre » last. */
const ONBOARDING_ACTIVITY_ORDER: readonly BusinessActivityType[] = [
  'HAIRDRESSING',
  'NAILS',
  'ESTHETICS',
  'LASHES_BROWS',
  'MAKEUP',
  'BARBER',
  'WELLNESS',
  'OTHER',
];

export const ACTIVITY_OPTIONS: readonly ActivityOption[] = ONBOARDING_ACTIVITY_ORDER.map((type) => ({
  type,
  label: formatBusinessActivityType(type),
  icon: activityIcons[type],
}));

export function getActivityIcon(activityType: BusinessActivityType): PlatformSymbolName {
  return activityIcons[activityType];
}
