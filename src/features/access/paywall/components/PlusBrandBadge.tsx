// BeautIzzy — the BeautIzzy Plus identification
//
// One lavender capsule: the canonical brand symbol (BrandMark, decorative —
// the text beside it says the name) and « BeautIzzy Plus » in the brand
// violet. The only way the paywall names the product; never a redrawn logo.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { PLUS_BRAND_NAME } from '../paywall-copy';

/** Rendered width of the symbol; its height follows the PNG (portrait). */
const SYMBOL_WIDTH = 14;

export function PlusBrandBadge() {
  return (
    <View accessible accessibilityLabel={PLUS_BRAND_NAME} style={styles.badge} testID="paywall-brand">
      <BrandMark decorative size={SYMBOL_WIDTH} variant="symbol" />
      <AppText style={styles.label} variant="control">
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
    minHeight: 30,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs,
  },
  label: { color: semanticColors.accent },
});
