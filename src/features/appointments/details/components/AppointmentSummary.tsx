import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, peach, radii, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailSummary } from '../presentation';
import { formatDurationMinutes, formatPrice } from '../presentation';

interface AppointmentSummaryProps {
  readonly summary: AppointmentDetailSummary;
}

export function AppointmentSummary({ summary }: AppointmentSummaryProps) {
  return (
    <View style={styles.container}>
      <AppText variant="control" style={styles.label}>
        Temps
      </AppText>
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
          <AppText variant="control" selectable style={styles.finalValue}>
            {formatDurationMinutes(summary.elapsedMinutes)}
          </AppText>
        </View>
        <View style={styles.priceColumn}>
          <AppText variant="metadata" style={styles.finalLabel}>
            Total
          </AppText>
          <AppText variant="control" selectable style={styles.totalValue}>
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
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  label: { color: colors.foreground, marginBottom: spacing.sm },
  timeSurface: {
    backgroundColor: colors.surface,
    borderColor: lavender.lav100,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  rowAccent: { borderRadius: radii.ios.pill, height: 8, marginRight: spacing.sm, width: 8 },
  rowLabel: { flex: 1 },
  value: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  finalSummary: {
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: colors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end' },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
