// Souris — Sale product result row
//
// A search / scan result inside Sale creation. Tapping adds the Product
// immediately (or increments it); the small count chip shows how many units
// the draft already holds. No intermediate "Ajouter" confirmation.

import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/products';
import { ProductImage } from '@/features/products/components/ProductImage';
import { formatServicePrice } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

interface SaleProductRowProps {
  readonly product: Product;
  /** Units already requested by the draft for this Product. */
  readonly draftQuantity: number;
  readonly onPress: () => void;
}

export function SaleProductRow({ product, draftQuantity, onPress }: SaleProductRowProps) {
  const meta = [product.brand, product.category].filter(Boolean).join(' · ');
  const stockLabel = product.stockQuantity > 0 ? `Stock ${product.stockQuantity}` : 'Stock épuisé';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ajouter ${product.name}, ${formatServicePrice(product.price)}, ${stockLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`sale-product-${product.id}`}
    >
      <ProductImage
        imageUri={product.imageUri}
        productName={product.name}
        testID={`sale-product-image-${product.id}`}
        variant="thumbnail"
      />
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
          {product.name}
        </AppText>
        {meta.length > 0 && (
          <AppText variant="metadata" numberOfLines={1} style={styles.meta}>
            {meta}
          </AppText>
        )}
        <AppText
          variant="metadata"
          numberOfLines={1}
          style={[styles.stock, product.stockQuantity === 0 && styles.stockEmpty]}
        >
          {stockLabel}
        </AppText>
      </View>
      {draftQuantity > 0 && (
        <View style={styles.countChip} testID={`sale-product-count-${product.id}`}>
          <AppText variant="chip" style={styles.countText}>
            {`×${draftQuantity}`}
          </AppText>
        </View>
      )}
      <AppText variant="control" style={styles.price}>
        {formatServicePrice(product.price)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: lavender.lav700 },
  meta: { color: foregroundSoft },
  stock: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  stockEmpty: { color: rose.rose600 },
  countChip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 32,
    paddingHorizontal: spacing.sm,
  },
  countText: { color: semanticColors.accent, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
