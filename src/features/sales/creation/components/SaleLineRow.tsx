// Souris — Sale line row
//
// One draft line of « Produits ajoutés », drawn inside that section's
// GroupedSurface (the surface owns the separators): thumbnail, name (two
// lines at most), brand · category, quiet stock hint, the line total aligned
// right, then a compact [−] n [+] control bounded by current stock and a
// secondary remove action. The row reads the LIVE Product for presentation
// only; the snapshot is taken at completion.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/products';
import { getSaleItemTotal, type SaleDraftLine } from '@/domain/sales';
import { ProductImage } from '@/features/products/components/ProductImage';
import { formatServicePrice } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

interface SaleLineRowProps {
  readonly line: SaleDraftLine;
  /** Undefined when the Product disappeared from the catalog while drafting. */
  readonly product: Product | undefined;
  readonly onIncrement: () => void;
  readonly onDecrement: () => void;
  readonly onRemove: () => void;
}

export function SaleLineRow({ line, product, onIncrement, onDecrement, onRemove }: SaleLineRowProps) {
  const name = product?.name ?? 'Produit indisponible';
  const canIncrement = product !== undefined && product.active && line.quantity < product.stockQuantity;
  const canDecrement = line.quantity > 1;
  const overStock = product !== undefined && line.quantity > product.stockQuantity;
  const subtotal = product ? getSaleItemTotal({ unitPrice: product.price, quantity: line.quantity }) : 0;
  const meta = product ? [product.brand, product.category].filter(Boolean).join(' · ') : '';

  return (
    <View style={styles.row} testID={`sale-line-${line.productId}`}>
      <View style={styles.summary}>
        <ProductImage
          imageUri={product?.imageUri}
          productName={product?.name}
          testID={`sale-line-image-${line.productId}`}
          variant="thumbnail"
        />
        <View style={styles.copy}>
          <AppText variant="rowTitle" numberOfLines={2} style={styles.name}>
            {name}
          </AppText>
          {product ? (
            <>
              {meta.length > 0 && (
                <AppText variant="metadata" numberOfLines={1} style={styles.meta}>
                  {meta}
                </AppText>
              )}
              <AppText
                variant="metadata"
                numberOfLines={1}
                style={[styles.meta, overStock && styles.warning]}
              >
                {product.stockQuantity > 0 ? `Stock ${product.stockQuantity}` : 'Stock épuisé'}
                {line.quantity > 1 ? ` · ${formatServicePrice(product.price)} / unité` : ''}
              </AppText>
            </>
          ) : (
            <AppText variant="metadata" numberOfLines={2} style={styles.warning}>
              Ce produit n’est plus dans le catalogue.
            </AppText>
          )}
        </View>
        <AppText
          variant="control"
          style={styles.subtotal}
          testID={`sale-line-total-${line.productId}`}
        >
          {product ? formatServicePrice(subtotal) : '—'}
        </AppText>
      </View>

      <View style={styles.controls}>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Diminuer la quantité de ${name}`}
            accessibilityState={{ disabled: !canDecrement }}
            disabled={!canDecrement}
            hitSlop={spacing.xs}
            onPress={onDecrement}
            style={({ pressed }) => [
              styles.stepButton,
              pressed && canDecrement && styles.stepButtonPressed,
            ]}
            testID={`sale-line-decrement-${line.productId}`}
          >
            <AppText
              variant="control"
              style={[styles.stepGlyph, !canDecrement && styles.stepGlyphDisabled]}
            >
              −
            </AppText>
          </Pressable>
          <AppText
            accessibilityLabel={`Quantité ${line.quantity}`}
            variant="control"
            style={styles.quantity}
            testID={`sale-line-quantity-${line.productId}`}
          >
            {line.quantity}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Augmenter la quantité de ${name}`}
            accessibilityState={{ disabled: !canIncrement }}
            disabled={!canIncrement}
            hitSlop={spacing.xs}
            onPress={onIncrement}
            style={({ pressed }) => [
              styles.stepButton,
              pressed && canIncrement && styles.stepButtonPressed,
            ]}
            testID={`sale-line-increment-${line.productId}`}
          >
            <AppText
              variant="control"
              style={[styles.stepGlyph, !canIncrement && styles.stepGlyphDisabled]}
            >
              +
            </AppText>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${name} de la vente`}
          hitSlop={spacing.sm}
          onPress={onRemove}
          style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
          testID={`sale-line-remove-${line.productId}`}
        >
          <SymbolView
            name={{ ios: 'trash', android: 'delete' }}
            size={16}
            tintColor={rose.rose600}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  summary: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  warning: { color: rose.rose600 },
  subtotal: {
    color: semanticColors.foreground,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 2,
  },
  stepButton: {
    alignItems: 'center',
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 44,
  },
  stepButtonPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  stepGlyph: { color: semanticColors.accent, fontSize: 18, lineHeight: 21 },
  stepGlyphDisabled: { color: semanticColors.foregroundMuted },
  quantity: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'center',
  },
  removeButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  removeButtonPressed: {
    backgroundColor: semanticColors.surfaceRose,
    transform: [{ scale: interaction.pressedScale }],
  },
});
