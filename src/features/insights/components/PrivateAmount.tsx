// BeautIzzy — PrivateAmount
//
// A private amount of « Tops & tendances »: a frosted lilac capsule holding
// soft digit-shaped marks and a readable `€` (DESIGN_OVERRIDES.md §35). The
// shape never depends on the value — no number is ever rendered, so nothing
// can be read back from the screen or an exported image.
//
//   large        « Encaissé sur la période » on the share card
//   small        « Panier moyen » on the share card
//   podiumFirst  a hidden client amount under the #1 place (ticket and card)
//   podium       a hidden client amount under #2 / #3
//
// Fixed size, never following the device text size: it is a shape, not text.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

export type PrivateAmountSize = 'large' | 'small' | 'podiumFirst' | 'podium';

const SHAPES = {
  large: { marks: [18, 18, 18, 18], pill: { gap: 6, height: 40, marginTop: spacing.xs, paddingHorizontal: spacing.base }, mark: 14 },
  small: { marks: [9, 9, 9], pill: { gap: 3, height: 20, paddingHorizontal: spacing.sm }, mark: 7 },
  podiumFirst: { marks: [8, 8, 8], pill: { gap: 3, height: 18, paddingHorizontal: spacing.sm }, mark: 6 },
  podium: { marks: [7, 7, 7], pill: { gap: 2, height: 16, paddingHorizontal: spacing.xs + 2 }, mark: 5 },
} as const;

interface PrivateAmountProps {
  readonly size: PrivateAmountSize;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function PrivateAmount({ size, style, testID }: PrivateAmountProps) {
  const shape = SHAPES[size];
  return (
    <View style={[styles.private, shape.pill, style]} testID={testID}>
      {shape.marks.map((width, index) => (
        <View key={index} style={[styles.mark, { height: shape.mark, width }]} />
      ))}
      <AppText
        allowFontScaling={false}
        style={[styles.currency, size === 'podiumFirst' || size === 'podium' ? styles.currencyPodium : null]}
        variant={size === 'large' ? 'sectionTitle' : 'metadata'}
      >
        €
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Frosted private amount: soft lilac, no border, no gradient.
  private: {
    alignItems: 'center',
    backgroundColor: lavender.lav100,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    flexDirection: 'row',
  },
  mark: { backgroundColor: lavender.lav200, borderRadius: radii.pill },
  currency: { color: semanticColors.accent, marginLeft: 2, opacity: 0.8 },
  // The podium capsules are shorter than a metadata line: a smaller `€` keeps it inside.
  currencyPodium: { fontSize: 11, lineHeight: 14 },
});
