// BeautIzzy — Client purchase history row
//
// One completed Sale of a Client — ONE transaction, whatever its number of
// products — shared by the profile « Achats » preview and the complete purchase
// history. Rendered EXCLUSIVELY from the Sale snapshot (productName, quantity,
// unitPrice): later Product edits, deactivation, or deletion never change what
// the professional sees here. The amount is the Sale's total as sold; what its
// refunds amount to is said in accent (« Remboursée en partie »…), from the SAME
// summary as the Sale detail. The whole row opens that Sale detail (the one the
// Caisse opens); the complete history spells out every line of a multi-product
// Sale (`showLines`).

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

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
  /** What its refunds amount to (« Remboursée »…), when it has some. */
  readonly refundStatus?: string;
  /** Opens the Sale detail. */
  readonly onPress: () => void;
}

export function ClientSaleRow({ sale, showLines = false, refundStatus, onPress }: ClientSaleRowProps) {
  const summary = formatSaleSummary(sale);
  const meta = `${formatSaleDate(sale.completedAt)} · ${formatSaleQuantitySummary(sale)}`;
  const total = formatServicePrice(getSaleTotal(sale));
  const lines = showLines && sale.items.length > 1 ? sale.items : [];

  return (
    <Pressable
      accessibilityHint="Ouvre le détail de la vente"
      accessibilityLabel={[
        `Achat du ${formatSaleDate(sale.completedAt)}`,
        summary,
        formatSaleQuantitySummary(sale),
        `total ${total}`,
        refundStatus,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`client-sale-${sale.id}`}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <AppText variant="body" numberOfLines={2} style={styles.summary}>
              {summary}
            </AppText>
            <AppText variant="metadata" numberOfLines={1} style={styles.meta}>
              {meta}
            </AppText>
            {refundStatus && (
              <AppText variant="metadata" numberOfLines={1} style={styles.status} testID={`client-sale-status-${sale.id}`}>
                {refundStatus}
              </AppText>
            )}
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
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={13}
        tintColor={semanticColors.foregroundMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingLeft: spacing.base,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  body: { flex: 1, gap: spacing.sm, minWidth: 0 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  copy: { flex: 1, gap: 1, minWidth: 0 },
  summary: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  status: { color: semanticColors.accent },
  total: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  lines: { gap: 2 },
  line: { flexDirection: 'row', gap: spacing.sm },
  lineName: { color: foregroundSoft, flex: 1, minWidth: 0 },
  lineTotal: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
});
