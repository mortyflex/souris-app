// Souris — Products catalog screen (Produits tab)
//
// Light operational product catalog: search, Actifs/Inactifs groups,
// deterministic French alphabetical order. No dashboard KPIs, no fake sales
// metrics. Stock is visible but restrained.

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Modal,
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
import { Screen } from '@/shared/ui/Screen';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
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
    <Screen>
      <AppText variant="screenTitle" accessibilityRole="header">
        Produits
      </AppText>

      <View style={styles.searchArea}>
        <SearchField
          accessibilityLabel="Rechercher un produit"
          onChangeText={setQuery}
          placeholder="Rechercher un produit"
          trailingAccessory={scanAccessory}
          value={query}
        />
        <AppButton
          accessibilityLabel="Ajouter un produit"
          onPress={() => router.push('/products/new')}
          title="Ajouter un produit"
        />
      </View>

      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <AppText variant="stateTitle">Aucun produit enregistré.</AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            Ajoutez votre premier produit pour préparer la future vente.
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

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        visible={scannerVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setScanResult(null)}
        transparent
        visible={scanResult !== null}
      >
        <View accessibilityViewIsModal style={styles.resultOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer le résultat du scan"
            onPress={() => setScanResult(null)}
            style={StyleSheet.absoluteFill}
          />
          {scanResult && (
            <View style={styles.resultCard} testID="barcode-result">
              {scanResult.matches.length === 0 ? (
                <>
                  <AppText variant="sheetTitle">Produit introuvable</AppText>
                  <AppText variant="metadata" style={styles.resultCopy}>
                    Aucun produit ne correspond à ce code-barres.
                  </AppText>
                  <AppText selectable variant="control" style={styles.scannedBarcode}>
                    {scanResult.barcode}
                  </AppText>
                  <View style={styles.resultActions}>
                    <AppButton
                      onPress={() => setScanResult(null)}
                      style={styles.resultButton}
                      title="Fermer"
                      variant="secondary"
                    />
                    <AppButton
                      onPress={() => {
                        const barcode = scanResult.barcode;
                        setScanResult(null);
                        router.push({ pathname: '/products/new', params: { barcode } });
                      }}
                      style={styles.resultButton}
                      title="Ajouter un produit"
                    />
                  </View>
                </>
              ) : (
                <>
                  <AppText variant="sheetTitle">Plusieurs produits trouvés</AppText>
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
                  <AppButton
                    onPress={() => setScanResult(null)}
                    title="Fermer"
                    variant="secondary"
                  />
                </>
              )}
            </View>
          )}
        </View>
      </Modal>
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
  searchArea: {
    gap: spacing.md,
    paddingTop: spacing.base,
  },
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
  listContent: { paddingBottom: spacing['3xl'] },
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
  resultOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(25, 22, 63, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: horizontalGutter,
  },
  resultCard: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.md,
    maxHeight: '80%',
    padding: spacing.lg,
    width: '100%',
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
  resultActions: { flexDirection: 'row', gap: spacing.sm },
  resultButton: { flex: 1 },
  matchesList: { flexGrow: 0 },
});
