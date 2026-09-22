// Souris — Appointment Details summary
//
// One compact surface, two columns: « Durée totale » and « Nombre de
// prestations », each with a quiet accent glyph. Deliberately no amount:
// the amount to charge is the checkout footer's, never repeated here. The
// per-phase timing (active / processing) stays inside each Prestation.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailSummary } from '../presentation';
import { formatDurationMinutes } from '../presentation';

const durationIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };
const servicesIcon: SymbolViewProps['name'] = { ios: 'square.stack.3d.up', android: 'layers' };

interface AppointmentSummaryProps {
  readonly summary: AppointmentDetailSummary;
}

export function AppointmentSummary({ summary }: AppointmentSummaryProps) {
  return (
    <View style={styles.surface} testID="appointment-summary">
      <SummaryColumn
        icon={durationIcon}
        label="Durée totale"
        testID="appointment-total-duration"
        value={formatDurationMinutes(summary.elapsedMinutes)}
      />
      <View style={styles.divider} />
      <SummaryColumn
        icon={servicesIcon}
        label="Nombre de prestations"
        testID="appointment-service-count"
        value={String(summary.serviceCount)}
      />
    </View>
  );
}

function SummaryColumn({
  icon,
  label,
  value,
  testID,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`} style={styles.column}>
      <SymbolView name={icon} size={20} tintColor={semanticColors.accent} />
      <View style={styles.copy}>
        <AppText variant="metadata" numberOfLines={2} style={styles.label}>
          {label}
        </AppText>
        <AppText variant="rowTitle" selectable style={styles.value} testID={testID}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: spacing.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  column: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  divider: {
    alignSelf: 'stretch',
    backgroundColor: semanticColors.borderSubtle,
    marginHorizontal: spacing.md,
    width: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  label: { color: semanticColors.foregroundSoft },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
