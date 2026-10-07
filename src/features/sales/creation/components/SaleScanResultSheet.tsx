// BeautIzzy — Sale scan result
//
// The Sale-specific interpretation of one scanned barcode, presented in the
// shared BottomSheet. A unique ACTIVE match never reaches this sheet (it is
// added immediately); here we only show: unknown barcode, inactive-only
// matches, or several active matches to choose from. Sale creation never
// opens Product creation.

import { ScrollView, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/products';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { SALE_ROW_SEPARATOR_INSET, SaleProductRow } from './SaleProductRow';

export type SaleScanResult =
  | { readonly kind: 'unknown'; readonly barcode: string }
  | { readonly kind: 'inactive'; readonly barcode: string }
  | { readonly kind: 'multiple'; readonly barcode: string; readonly matches: readonly Product[] };

interface SaleScanResultSheetProps {
  readonly result: SaleScanResult | null;
  readonly draftQuantityOf: (productId: string) => number;
  readonly onSelectProduct: (product: Product) => void;
  readonly onClose: () => void;
}

function titleOf(result: SaleScanResult): string {
  switch (result.kind) {
    case 'multiple':
      return 'Plusieurs produits trouvés';
    case 'unknown':
      return 'Produit introuvable';
    case 'inactive':
      return 'Produit inactif';
  }
}

export function SaleScanResultSheet({
  result,
  draftQuantityOf,
  onSelectProduct,
  onClose,
}: SaleScanResultSheetProps) {
  return (
    <BottomSheet
      backdropLabel="Fermer le résultat du scan"
      header={
        result ? (
          <SheetHeader action={{ label: 'Fermer', onPress: onClose }} eyebrow="SCAN" title={titleOf(result)} />
        ) : undefined
      }
      onClose={onClose}
      testID="sale-scan-result"
      visible={result !== null}
    >
      {result && (
        <View style={styles.content}>
          {result.kind === 'multiple' ? (
            <>
              <AppText variant="metadata" style={styles.copy}>
                Choisissez le produit à ajouter à la vente.
              </AppText>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.matches}
              >
                <GroupedSurface>
                  {result.matches.map((product, index) => (
                    <View key={product.id}>
                      {index > 0 && <GroupedSeparator inset={SALE_ROW_SEPARATOR_INSET} />}
                      <SaleProductRow
                        draftQuantity={draftQuantityOf(product.id)}
                        onPress={() => onSelectProduct(product)}
                        product={product}
                      />
                    </View>
                  ))}
                </GroupedSurface>
              </ScrollView>
            </>
          ) : (
            <AppText variant="metadata" style={styles.copy}>
              {result.kind === 'unknown'
                ? 'Aucun produit ne correspond à ce code-barres.'
                : 'Ce produit est inactif.'}
            </AppText>
          )}
          <AppText selectable variant="control" style={styles.barcode}>
            {result.barcode}
          </AppText>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.base,
    paddingTop: spacing.xs,
  },
  copy: { color: foregroundSoft },
  matches: { flexGrow: 0, maxHeight: 320 },
  barcode: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    padding: spacing.md,
    textAlign: 'center',
  },
});
