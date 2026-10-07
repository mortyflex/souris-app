// BeautIzzy — Client purchase history row
//
// One completed Sale of a Client, shared by the profile « Produits achetés »
// preview and the complete purchase history. Rendered EXCLUSIVELY from the
// Sale snapshot (productName, quantity, unitPrice): later Product edits,
// deactivation, or deletion never change what the professional sees here.
// There is no Sale detail screen, so the row is read-only; the complete
// history spells out every line of a multi-product Sale (`showLines`).

import { StyleSheet, View } from 'react-native';

import { getSaleItemTotal, getSaleTotal, type Sale } from '@/domain/sales';
import {
  formatSaleDate,
  formatSaleQuantity,
  formatSaleQuantitySummary,
  formatSaleSummary,
} from '@/features/sales/presentation';
import { formatServicePrice } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

interface ClientSaleRowProps {
  readonly sale: Sale;
  /** Lists every line under the summary when the Sale has several products. */
  readonly showLines?: boolean;
}

export function ClientSaleRow({ sale, showLines = false }: ClientSaleRowProps) {
  const summary = formatSaleSummary(sale);
  const meta = `${formatSaleDate(sale.completedAt)} · ${formatSaleQuantitySummary(sale)}`;
  const total = formatServicePrice(getSaleTotal(sale));
  const lines = showLines && sale.items.length > 1 ? sale.items : [];

  return (
    <View
      accessible
      accessibilityLabel={[
        `Achat du ${formatSaleDate(sale.completedAt)}`,
        summary,
        formatSaleQuantitySummary(sale),
        `total ${total}`,
      ].join(', ')}
      style={styles.row}
      testID={`client-sale-${sale.id}`}
    >
      <View style={styles.header}>
        <View style={styles.copy}>
          <AppText variant="body" numberOfLines={2} style={styles.summary}>
            {summary}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.meta}>
            {meta}
          </AppText>
        </View>
        <AppText variant="control" style={styles.total}>
          {total}
        </AppText>
      </View>
      {lines.length > 0 && (
        <View style={styles.lines}>
          {lines.map((item) => (
            <View key={item.id} style={styles.line}>
              <AppText variant="metadata" numberOfLines={1} style={styles.lineName}>
                {`${item.productName} ${formatSaleQuantity(item.quantity)}`}
              </AppText>
              <AppText variant="metadata" style={styles.lineTotal}>
                {formatServicePrice(getSaleItemTotal(item))}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  copy: { flex: 1, gap: 1, minWidth: 0 },
  summary: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  total: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  lines: { gap: 2 },
  line: { flexDirection: 'row', gap: spacing.sm },
  lineName: { color: foregroundSoft, flex: 1, minWidth: 0 },
  lineTotal: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
});
