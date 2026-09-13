// Souris — Appointment Details summary banner
//
// One compact banner: total duration and the snapshot total. The per-phase
// timing (active / processing) is already visible inside each service's
// phases and is deliberately not repeated as a second breakdown.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailSummary } from '../presentation';
import { formatDurationMinutes, formatPrice } from '../presentation';

interface AppointmentSummaryProps {
  readonly summary: AppointmentDetailSummary;
}

export function AppointmentSummary({ summary }: AppointmentSummaryProps) {
  return (
    <View style={styles.finalSummary} testID="appointment-summary">
      <View>
        <AppText variant="metadata" style={styles.finalLabel}>
          Durée totale
        </AppText>
        <AppText variant="summaryValue" selectable style={styles.finalValue}>
          {formatDurationMinutes(summary.elapsedMinutes)}
        </AppText>
      </View>
      <View style={styles.priceColumn}>
        <AppText variant="metadata" style={styles.finalLabel}>
          Total
        </AppText>
        <AppText variant="summaryValue" selectable style={styles.totalValue}>
          {formatPrice(summary.totalPrice)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  finalSummary: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    padding: spacing.base,
  },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end' },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
