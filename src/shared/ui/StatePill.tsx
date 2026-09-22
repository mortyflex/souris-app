// Souris — StatePill
//
// The small state pill of detail sheets — a dot and the label on a light fill
// of the same family, the shape of the Appointment Details status. Used for
// Product Actif / Inactif and En stock / Stock épuisé, Prestation Active /
// Inactive, and the Service / Technique category (whose colours come from
// `serviceCategoryColors`). The label is always written, so a state never
// relies on colour alone.

import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { mint, radii, rose, semanticColors, spacing } from './theme';

export interface StatePillColors {
  readonly fill: string;
  readonly dot: string;
  readonly text: string;
}

/** The status tones; a category passes its own colours. */
export const statePillTones = {
  positive: { fill: mint.mint050, dot: mint.mint600, text: mint.mint650 },
  neutral: { fill: semanticColors.surface, dot: semanticColors.foregroundMuted, text: semanticColors.foregroundSoft },
  exception: { fill: rose.rose050, dot: rose.rose600, text: rose.rose700 },
} as const satisfies Record<string, StatePillColors>;

interface StatePillProps {
  readonly label: string;
  readonly colors: StatePillColors;
  readonly accessibilityLabel: string;
  readonly testID: string;
}

export function StatePill({ label, colors, accessibilityLabel, testID }: StatePillProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, { backgroundColor: colors.fill }]}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: colors.dot }]} testID={`${testID}-dot`} />
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
