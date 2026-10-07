// BeautIzzy — Sale product result row
//
// A search result inside Sale creation, drawn inside the « Résultats »
// GroupedSurface (the surface owns the separators). Every row states where
// it stands, never by colour alone:
//
// - available, not in the sale: a `+` add affordance;
// - already in the sale: `✓ Ajouté` — tapping again still adds one unit,
//   exactly like a second scan (the quantity lives in « Produits ajoutés »);
// - no stock: `Stock épuisé` + `Indisponible`, not pressable.
//
// No intermediate "Ajouter" confirmation.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/products';
import { ProductImage, productImageHeights } from '@/features/products/components/ProductImage';
import { useProductImageUri } from '@/features/products/images/use-product-image-uri';
import { formatServicePrice } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

/** Separators of the grouped surfaces start under the Product copy. */
export const SALE_ROW_SEPARATOR_INSET = spacing.base + productImageHeights.thumbnail + spacing.md;

interface SaleProductRowProps {
  readonly product: Product;
  /** Units already requested by the draft for this Product. */
  readonly draftQuantity: number;
  readonly onPress: () => void;
}

export function SaleProductRow({ product, draftQuantity, onPress }: SaleProductRowProps) {
  const meta = [product.brand, product.category].filter(Boolean).join(' · ');
  const soldOut = product.stockQuantity <= 0;
  const added = draftQuantity > 0;
  const stockLabel = soldOut ? 'Stock épuisé' : `Stock ${product.stockQuantity}`;
  const price = formatServicePrice(product.price);

  const accessibilityLabel = soldOut
    ? `${product.name}, stock épuisé, indisponible`
    : added
      ? `${product.name}, déjà ajouté, quantité ${draftQuantity}`
      : `${product.name}, ${price}, stock ${product.stockQuantity}, ajouter`;

  const imageUri = useProductImageUri(product);

  return (
    <Pressable
      accessibilityHint={added && !soldOut ? 'Ajoute une unité à la vente' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: soldOut }}
      disabled={soldOut}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`sale-product-${product.id}`}
    >
      <ProductImage
        imageUri={imageUri}
        productName={product.name}
        testID={`sale-product-image-${product.id}`}
        variant="thumbnail"
      />
      <View style={styles.copy}>
        <AppText
          variant="rowTitle"
          numberOfLines={2}
          style={[styles.name, soldOut && styles.nameSoldOut]}
        >
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
          style={[styles.stock, soldOut && styles.stockEmpty]}
        >
          {stockLabel}
        </AppText>
      </View>
      <View style={styles.trailing}>
        <AppText variant="control" style={[styles.price, soldOut && styles.priceSoldOut]}>
          {price}
        </AppText>
        {soldOut ? (
          <View style={styles.unavailableChip} testID={`sale-product-unavailable-${product.id}`}>
            <AppText variant="chip" style={styles.unavailableText}>
              Indisponible
            </AppText>
          </View>
        ) : added ? (
          <View style={styles.addedChip} testID={`sale-product-added-${product.id}`}>
            <SymbolView
              name={{ ios: 'checkmark', android: 'check' }}
              size={11}
              tintColor={semanticColors.accent}
            />
            <AppText variant="chip" style={styles.addedText}>
              Ajouté
            </AppText>
          </View>
        ) : (
          <View style={styles.addButton} testID={`sale-product-add-${product.id}`}>
            <SymbolView
              name={{ ios: 'plus', android: 'add' }}
              size={14}
              tintColor={semanticColors.accent}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  nameSoldOut: { color: foregroundSoft },
  meta: { color: foregroundSoft },
  stock: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  stockEmpty: { color: rose.rose600 },
  trailing: { alignItems: 'flex-end', flexShrink: 0, gap: spacing.xs },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  priceSoldOut: { color: foregroundSoft },
  addButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  addedChip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  addedText: { color: semanticColors.accent },
  unavailableChip: {
    alignItems: 'center',
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  unavailableText: { color: foregroundSoft },
});
