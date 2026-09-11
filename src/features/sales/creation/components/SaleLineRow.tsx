// Souris — Sale line row
//
// One compact draft line: thumbnail, name, unit price, quiet stock hint, a
// [−] n [+] quantity control bounded by current stock, the line subtotal, and
// an explicit remove action. The row reads the LIVE Product for presentation
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
  lavender,
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

  return (
    <View style={styles.row} testID={`sale-line-${line.productId}`}>
      <ProductImage
        imageUri={product?.imageUri}
        productName={product?.name}
        testID={`sale-line-image-${line.productId}`}
        variant="thumbnail"
      />
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
          {name}
        </AppText>
        {product ? (
          <AppText variant="metadata" numberOfLines={1} style={styles.unitPrice}>
            {`${formatServicePrice(product.price)} / unité`}
          </AppText>
        ) : (
          <AppText variant="metadata" numberOfLines={1} style={styles.warning}>
            Ce produit n’est plus dans le catalogue.
          </AppText>
        )}
        {product && (
          <AppText
            variant="metadata"
            numberOfLines={1}
            style={[styles.stock, overStock && styles.warning]}
          >
            {product.stockQuantity > 0 ? `Stock ${product.stockQuantity}` : 'Stock épuisé'}
          </AppText>
        )}
        <View style={styles.controls}>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer une unité de ${name}`}
              accessibilityState={{ disabled: !canDecrement }}
              disabled={!canDecrement}
              hitSlop={spacing.xs}
              onPress={onDecrement}
              style={({ pressed }) => [
                styles.stepButton,
                !canDecrement && styles.stepButtonDisabled,
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
              variant="control"
              style={styles.quantity}
              testID={`sale-line-quantity-${line.productId}`}
            >
              {line.quantity}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ajouter une unité de ${name}`}
              accessibilityState={{ disabled: !canIncrement }}
              disabled={!canIncrement}
              hitSlop={spacing.xs}
              onPress={onIncrement}
              style={({ pressed }) => [
                styles.stepButton,
                !canIncrement && styles.stepButtonDisabled,
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
          <AppText
            variant="control"
            style={styles.subtotal}
            testID={`sale-line-total-${line.productId}`}
          >
            {product ? formatServicePrice(subtotal) : '—'}
          </AppText>
        </View>
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
          name={{ ios: 'xmark', android: 'close' }}
          size={14}
          tintColor={semanticColors.foregroundSoft}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: lavender.lav700 },
  unitPrice: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  stock: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  warning: { color: rose.rose600 },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 40,
  },
  stepButtonDisabled: { backgroundColor: semanticColors.surface },
  stepButtonPressed: {
    backgroundColor: semanticColors.borderLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  stepGlyph: { color: semanticColors.accent, fontSize: 18, lineHeight: 21 },
  stepGlyphDisabled: { color: semanticColors.foregroundMuted },
  quantity: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'center',
  },
  subtotal: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  removeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  removeButtonPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
});
