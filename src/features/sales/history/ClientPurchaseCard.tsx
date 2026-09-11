// Souris — Client purchase card
//
// One completed Sale inside the Client Profile "Produits achetés" section.
// Rendered EXCLUSIVELY from the Sale snapshot (productName, quantity,
// unitPrice): later Product edits, deactivation, or deletion never change
// what the professional sees here.

import { StyleSheet, View } from 'react-native';

import { getSaleItemTotal, getSaleTotal, type Sale } from '@/domain/sales';
import { formatServicePrice } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { formatSaleDate, formatSaleQuantity } from '../presentation';

interface ClientPurchaseCardProps {
  readonly sale: Sale;
}

export function ClientPurchaseCard({ sale }: ClientPurchaseCardProps) {
  return (
    <View
      accessible
      accessibilityLabel={`Achat du ${formatSaleDate(sale.completedAt)}, total ${formatServicePrice(getSaleTotal(sale))}`}
      style={styles.card}
      testID={`client-sale-${sale.id}`}
    >
      <AppText variant="metadata" style={styles.date}>
        {formatSaleDate(sale.completedAt)}
      </AppText>
      <View style={styles.items}>
        {sale.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <AppText variant="rowTitle" numberOfLines={1} style={styles.itemName}>
              {item.productName}
            </AppText>
            <AppText variant="metadata" style={styles.itemQuantity}>
              {formatSaleQuantity(item.quantity)}
            </AppText>
            <AppText variant="control" style={styles.itemTotal}>
              {formatServicePrice(getSaleItemTotal(item))}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <AppText variant="control" style={styles.totalLabel}>
          Total
        </AppText>
        <AppText variant="control" style={styles.totalValue}>
          {formatServicePrice(getSaleTotal(sale))}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  date: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  items: { gap: spacing.xs },
  itemRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  itemName: { color: semanticColors.foreground, flex: 1, minWidth: 0 },
  itemQuantity: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  itemTotal: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 72,
    textAlign: 'right',
  },
  divider: { backgroundColor: semanticColors.borderSubtle, height: StyleSheet.hairlineWidth },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: foregroundSoft },
  totalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
