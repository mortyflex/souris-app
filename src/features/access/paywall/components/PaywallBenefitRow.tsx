// BeautIzzy — one approved benefit of BeautIzzy Plus
//
// An accent glyph in a compact lavender disc and the sentence beside it; the
// glyph is decorative, the sentence is read. Three of them make the benefit
// list, which follows the plan cards: the offer is the decision of the screen.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

interface PaywallBenefitRowProps {
  readonly icon: PlatformSymbolName;
  readonly text: string;
  readonly testID?: string;
}

export function PaywallBenefitRow({ icon, text, testID }: PaywallBenefitRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.glyph}
      >
        <SymbolView name={icon} size={16} tintColor={semanticColors.accent} />
      </View>
      <AppText style={styles.text} variant="rowTitle">
        {text}
      </AppText>
    </View>
  );
}

/** The lavender disc: compact, so three rows stay light under the plans. */
const GLYPH_SIZE = 30;

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: GLYPH_SIZE },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: GLYPH_SIZE,
    justifyContent: 'center',
    width: GLYPH_SIZE,
  },
  text: { color: semanticColors.foreground, flex: 1, minWidth: 0 },
});
