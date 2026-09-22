// Souris — state pill of Product Details
//
// The same pill as the Appointment Details status (a small dot and the label
// on a light fill of the same family), for the two Product states the sheet
// shows: Actif / Inactif and En stock / Stock épuisé. The label is always
// written, so a state never relies on colour alone.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { mint, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

export type ProductStateTone = 'positive' | 'neutral' | 'exception';

const toneColors: Record<ProductStateTone, { fill: string; dot: string; text: string }> = {
  positive: { fill: mint.mint050, dot: mint.mint600, text: mint.mint650 },
  neutral: { fill: semanticColors.surface, dot: semanticColors.foregroundMuted, text: semanticColors.foregroundSoft },
  exception: { fill: rose.rose050, dot: rose.rose600, text: rose.rose700 },
};

interface ProductStatePillProps {
  readonly label: string;
  readonly tone: ProductStateTone;
  readonly accessibilityLabel: string;
  readonly testID: string;
}

export function ProductStatePill({ label, tone, accessibilityLabel, testID }: ProductStatePillProps) {
  const colors = toneColors[tone];

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, { backgroundColor: colors.fill }]}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <AppText variant="chip" numberOfLines={1} style={{ color: colors.text }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: 28,
    paddingHorizontal: spacing.md,
  },
  dot: { borderRadius: radii.pill, height: 6, width: 6 },
});
