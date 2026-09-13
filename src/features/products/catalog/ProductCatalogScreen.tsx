// Souris — Products catalog screen (Produits tab)
//
// Light operational product catalog: search, Actifs/Inactifs groups,
// deterministic French alphabetical order. The shared floating + is the
// single creation entry: it expands into « Nouvelle vente » (the single Sale
// entry point) and « Ajouter un produit ». No dashboard KPIs, no sales
// metrics. Stock is visible but restrained. This screen's header is the
// reference composition of every main tab (docs/design/DESIGN_OVERRIDES.md §17).

import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import type { Product } from '@/domain/products';
import { ProductImage } from '@/features/products/components/ProductImage';
import { formatServicePrice } from '@/features/services/presentation';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BarcodeScannerModal } from '@/shared/ui/BarcodeScannerModal';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { MainScreenHeader } from '@/shared/ui/MainScreenHeader';
import { Screen } from '@/shared/ui/Screen';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { findProductsByBarcode, prepareProductDirectory } from '../search/filter-products';
import { useProductCatalog } from '../session/ProductCatalogProvider';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface CatalogSection {
  readonly key: 'active' | 'inactive';
  readonly title: string;
  readonly data: readonly Product[];
}

interface ScanResult {
  readonly barcode: string;
  readonly matches: readonly Product[];
}

export function ProductCatalogScreen() {
  const router = useRouter();
  const { products } = useProductCatalog();
  const [query, setQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  // Leaving the tab never leaves a detached open menu behind.
  useFocusEffect(useCallback(() => () => setCreateMenuOpen(false), []));

  const searching = query.trim().length > 0;
  const directory = prepareProductDirectory(products, query);
  const actives = directory.filter((product) => product.active);
  const inactives = directory.filter((product) => !product.active);

  const sections: readonly SectionListData<Product, CatalogSection>[] = [
    { key: 'active', title: 'Actifs', data: actives },
    { key: 'inactive', title: 'Inactifs', data: inactives },
  ];

  const openProduct = (productId: string) => {
    router.push({ pathname: '/products/[productId]', params: { productId } });
  };

  const handleScanned = (barcode: string) => {
    setScannerVisible(false);
    const matches = findProductsByBarcode(products, barcode);

    if (matches.length === 1) {
      openProduct(matches[0].id);
      return;
    }

    setScanResult({ barcode, matches });
  };

  const scanAccessory = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scanner un code-barres"
      hitSlop={spacing.sm}
      onPress={() => {
        setScanResult(null);
        setScannerVisible(true);
      }}
      style={({ pressed }) => [styles.scanAction, pressed && styles.scanActionPressed]}
      testID="open-barcode-scanner"
    >
      <SymbolView
        name={{ ios: 'barcode.viewfinder', android: 'barcode_scanner' }}
        size={19}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );

  return (
    <Screen header={<MainScreenHeader title="Produits" watermark="products" />}>
      <View style={styles.searchArea}>
        <SearchField
          accessibilityLabel="Rechercher un produit"
          onChangeText={setQuery}
          placeholder="Rechercher un produit"
          trailingAccessory={scanAccessory}
          value={query}
        />
      </View>

      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucun produit enregistré.</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Ajoutez votre premier produit pour préparer vos ventes.
          </AppText>
        </View>
      ) : searching && directory.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucun produit trouvé</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Essayez un autre nom, une marque, une catégorie ou un code-barres.
          </AppText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          initialNumToRender={80}
          keyExtractor={(product) => product.id}
          // The native tab bar overlays the page: the system bottom inset
          // keeps the last row scrollable above it (bottomClearance then
          // clears the floating +).
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <SectionHeader
              count={section.data.length}
              style={styles.sectionHeader}
              title={section.title}
            />
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <AppText variant="metadata" style={styles.emptySection}>
                {section.key === 'active'
                  ? 'Aucun produit actif.'
                  : 'Aucun produit inactif.'}
              </AppText>
            ) : null
          }
          renderItem={({ item }) => (
            <ProductRow product={item} onPress={() => openProduct(item.id)} />
          )}
        />
      )}

      <FloatingCreateButton
        accessibilityLabel="Créer"
        actions={[
          {
            icon: { ios: 'bag', android: 'shopping_bag' },
            label: 'Nouvelle vente',
            onPress: () => router.push('/sales/new'),
            testID: 'new-sale',
          },
          {
            icon: { ios: 'shippingbox', android: 'inventory_2' },
            label: 'Ajouter un produit',
            onPress: () => router.push('/products/new'),
            testID: 'new-product',
          },
        ]}
        menuOpen={createMenuOpen}
        onMenuOpenChange={setCreateMenuOpen}
        testID="products-create"
      />

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        visible={scannerVisible}
      />

      <BottomSheet
        backdropLabel="Fermer le résultat du scan"
        header={
          scanResult ? (
            <SheetHeader
              action={{ label: 'Fermer', onPress: () => setScanResult(null) }}
              eyebrow="SCAN"
              title={scanResult.matches.length === 0 ? 'Produit introuvable' : 'Plusieurs produits trouvés'}
            />
          ) : undefined
        }
        onClose={() => setScanResult(null)}
        testID="barcode-result"
        visible={scanResult !== null}
      >
        {scanResult && (
          <View style={styles.resultContent}>
            {scanResult.matches.length === 0 ? (
              <>
                <AppText variant="metadata" style={styles.resultCopy}>
                  Aucun produit ne correspond à ce code-barres.
                </AppText>
                <AppText selectable variant="control" style={styles.scannedBarcode}>
                  {scanResult.barcode}
                </AppText>
                <AppButton
                  onPress={() => {
                    const barcode = scanResult.barcode;
                    setScanResult(null);
                    router.push({ pathname: '/products/new', params: { barcode } });
                  }}
                  title="Ajouter un produit"
                />
              </>
            ) : (
              <>
                <AppText selectable variant="metadata" style={styles.resultCopy}>
                  Choisissez le produit correspondant au code-barres {scanResult.barcode}.
                </AppText>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.matchesList}
                >
                  {scanResult.matches.map((product) => (
                    <ProductRow
                      key={product.id}
                      onPress={() => {
                        setScanResult(null);
                        openProduct(product.id);
                      }}
                      product={product}
                    />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

function ProductRow({
  product,
  onPress,
}: {
  readonly product: Product;
  readonly onPress: () => void;
}) {
  const meta = [product.brand, product.category].filter(Boolean).join(' · ');
  const stockLabel =
    product.stockQuantity > 0
      ? `Stock ${product.stockQuantity}`
      : 'Stock épuisé';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatServicePrice(product.price)}, ${stockLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <ProductImage
        imageUri={product.imageUri}
        productName={product.name}
        testID={`catalog-product-image-${product.id}`}
        variant="thumbnail"
      />
      <View style={styles.rowCopy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.productName}>
          {product.name}
        </AppText>
        {meta.length > 0 && (
          <AppText variant="metadata" numberOfLines={1} style={styles.productMeta}>
            {meta}
          </AppText>
        )}
        <AppText
          variant="metadata"
          numberOfLines={1}
          style={[styles.stockLine, product.stockQuantity === 0 && styles.stockEmpty]}
        >
          {stockLabel}
        </AppText>
      </View>
      <AppText variant="control" style={styles.price}>
        {formatServicePrice(product.price)}
      </AppText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.foregroundMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchArea: { paddingTop: spacing.base },
  scanAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  scanActionPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    opacity: interaction.pressedOpacity,
  },
  listContent: { paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'] },
  sectionHeader: {
    marginTop: spacing['2xl'],
    paddingBottom: spacing.sm,
  },
  emptySection: {
    color: foregroundSoft,
    paddingVertical: spacing.md,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  productName: { color: lavender.lav700 },
  productMeta: { color: foregroundSoft },
  stockLine: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  stockEmpty: { color: rose.rose600 },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing['2xl'],
  },
  emptyStateText: {
    color: foregroundSoft,
    textAlign: 'center',
  },
  resultContent: {
    gap: spacing.md,
    paddingBottom: spacing.base,
    paddingTop: spacing.xs,
  },
  resultCopy: { color: foregroundSoft },
  scannedBarcode: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    padding: spacing.md,
    textAlign: 'center',
  },
  matchesList: { flexGrow: 0, maxHeight: 320 },
});
