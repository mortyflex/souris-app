// BeautIzzy — the BeautIzzy Plus identification
//
// One lavender capsule: the canonical brand symbol (BrandMark, decorative —
// the text beside it says the name) and « BeautIzzy Plus » in the brand
// violet — the identity of the premium product, never a redrawn logo. The
// only way the paywall and the subscription status name the product, in two
// weights, because the brand does not carry the same role everywhere:
//
//   hero    30 pt, the `control` name (16 pt semibold), the symbol 16 pt wide,
//           12 pt side padding: the paywall, where the capsule introduces the
//           product above the illustration and the headline — present, still
//           clearly under the headline;
//   label   24 pt, a 14 pt semibold name, the symbol 13 pt wide, 10 pt side
//           padding: « Mon abonnement », a small brand label above the status —
//           the status title, the plan and the dated sentence are the focus.
//
// Centred in the paywall hero; the status card aligns it with its own text
// (`align="start"`).

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { PLUS_BRAND_NAME } from '../paywall-copy';

export type PlusBrandBadgeVariant = 'hero' | 'label';

/** Height of the capsule per variant; the symbol's height follows its portrait PNG (≈ 1.35 × its width). */
export const PLUS_BRAND_BADGE_HEIGHT: Readonly<Record<PlusBrandBadgeVariant, number>> = { hero: 30, label: 24 };

/** Rendered width of the symbol per variant. */
const SYMBOL_WIDTH: Readonly<Record<PlusBrandBadgeVariant, number>> = { hero: 16, label: 13 };

interface PlusBrandBadgeProps {
  readonly variant?: PlusBrandBadgeVariant;
  readonly align?: 'center' | 'start';
  readonly testID?: string;
}

export function PlusBrandBadge({ variant = 'hero', align = 'center', testID = 'paywall-brand' }: PlusBrandBadgeProps) {
  const label = variant === 'label';
  return (
    <View
      accessible
      accessibilityLabel={PLUS_BRAND_NAME}
      style={[styles.badge, label && styles.badgeLabel, align === 'start' && styles.badgeStart]}
      testID={testID}
    >
      <BrandMark decorative size={SYMBOL_WIDTH[variant]} variant="symbol" />
      <AppText style={[styles.name, label && styles.nameLabel]} variant="control">
        {PLUS_BRAND_NAME}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: PLUS_BRAND_BADGE_HEIGHT.hero,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeLabel: {
    gap: spacing.xs + 2,
    minHeight: PLUS_BRAND_BADGE_HEIGHT.label,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeStart: { alignSelf: 'flex-start' },
  name: { color: semanticColors.accent },
  // The label step of the control role: 14 pt semibold, as a small brand label reads.
  nameLabel: { fontSize: 14, lineHeight: 18 },
});
