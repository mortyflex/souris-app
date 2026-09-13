// Souris — « Produits vendus » of one Appointment
//
// The Products sold during the Appointment (Sales carrying its id), read
// from Sale snapshots only: catalog edits or deletion never change what is
// shown. One concise list, then the derived Product total.

import { StyleSheet, View } from 'react-native';

import type { AppointmentSaleLine } from '@/features/sales/presentation';
import { formatSaleQuantity } from '@/features/sales/presentation';
import { formatEuros } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentProductsSectionProps {
  readonly lines: readonly AppointmentSaleLine[];
  readonly total: number;
}

export function AppointmentProductsSection({ lines, total }: AppointmentProductsSectionProps) {
  if (lines.length === 0) return null;

  return (
    <View style={styles.section} testID="appointment-products">
      <SectionHeader count={lines.reduce((count, line) => count + line.quantity, 0)} title="Produits vendus" />
      <View style={styles.surface}>
        {lines.map((line) => (
          <View accessible key={line.key} style={styles.line} testID="appointment-product-line">
            <View style={styles.copy}>
              <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
                {line.productName}
              </AppText>
              <AppText variant="metadata" style={styles.meta}>
                {formatSaleQuantity(line.quantity)} · {formatEuros(line.unitPrice)}
              </AppText>
            </View>
            <AppText variant="control" style={styles.lineTotal}>
              {formatEuros(line.total)}
            </AppText>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <AppText variant="control" style={styles.totalLabel}>
            Total produits
          </AppText>
          <AppText variant="control" style={styles.totalValue} testID="appointment-products-total">
            {formatEuros(total)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.xl },
  surface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  line: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  lineTotal: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  divider: { backgroundColor: semanticColors.borderSubtle, height: StyleSheet.hairlineWidth },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: foregroundSoft },
  totalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
