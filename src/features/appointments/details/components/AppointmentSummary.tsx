import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, lavender, peach, radii, semanticColors, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailSummary } from '../presentation';
import { formatDurationMinutes, formatPrice } from '../presentation';

interface AppointmentSummaryProps {
  readonly summary: AppointmentDetailSummary;
}

export function AppointmentSummary({ summary }: AppointmentSummaryProps) {
  return (
    <View style={styles.container}>
      <SectionHeader style={styles.label} title="Temps" />
      <View style={styles.timeSurface}>
        {summary.activeMinutes > 0 && (
          <SummaryRow
            accent={lavender.lav700}
            label="Temps actif"
            value={formatDurationMinutes(summary.activeMinutes)}
          />
        )}
        {summary.processingMinutes > 0 && (
          <SummaryRow
            accent={peach.peach700}
            label="Temps de pose"
            value={formatDurationMinutes(summary.processingMinutes)}
          />
        )}
      </View>
      <View style={styles.finalSummary}>
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
    </View>
  );
}

function SummaryRow({
  accent,
  label,
  value,
}: {
  readonly accent: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowAccent, { backgroundColor: accent }]} />
      <AppText variant="metadata" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  label: { marginBottom: spacing.sm },
  timeSurface: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  rowAccent: { borderRadius: radii.pill, height: 8, marginRight: spacing.sm, width: 8 },
  rowLabel: { flex: 1 },
  value: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  finalSummary: {
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.large,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
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
