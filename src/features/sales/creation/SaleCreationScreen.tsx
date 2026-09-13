// Souris — Sale creation (Nouvelle vente)
//
// ONE focused operational flow: optional Client, Product search + scan,
// immediate add / increment, bounded quantities, derived total, then
// "Valider la vente". The draft is local to this screen; the canonical
// Product catalog and the Sale session change ONLY through the atomic
// completion boundary (`useSaleSession().completeSale`).
//
// Live Product values (name, price, image, stock) feed the draft UI; the
// completed Sale keeps its own snapshot.
//
// Presented as a native form sheet in the canonical Souris shell like every
// other Souris creation flow (swipe-to-dismiss off; explicit « Annuler »). A
// draft with lines is guarded against « Annuler » and the hardware back by
// the shared Souris confirmation dialog.
//
// Entry contexts: Client Profile and Appointment Details open this screen with
// an `initialClientId` (resolved on the first render, never a flicker of
// « Aucune cliente »); the Produits tab opens it without one (walk-in). The
// origin is navigation-only: nothing about it reaches the Sale.

import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/products';
import {
  getSaleTotal,
  prepareSaleCompletion,
  type SaleDraft,
  type SaleDraftLine,
} from '@/domain/sales';
import { getClientDisplayName, isClientArchived } from '@/domain/clients';
import { ClientPickerSheet } from '@/features/clients/selection/ClientPickerSheet';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { findProductsByBarcode, prepareProductDirectory } from '@/features/products/search/filter-products';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { formatServicePrice } from '@/features/services/presentation';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BarcodeScannerModal } from '@/shared/ui/BarcodeScannerModal';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { describeSaleCompletionIssue } from '../presentation';
import { useSaleSession } from '../session/SaleSessionProvider';
import { SaleLineRow } from './components/SaleLineRow';
import { SaleProductRow } from './components/SaleProductRow';
import { SaleScanResultSheet, type SaleScanResult } from './components/SaleScanResultSheet';
import {
  addProductToDraft,
  getDraftQuantity,
  removeDraftLine,
  setDraftLineQuantity,
} from './draft';
import { createSaleId, createSaleItemId } from './runtime-ids';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

// Validation preview only needs a stable placeholder instant; the real
// completion instant is taken when the professional validates.
const PREVIEW_INSTANT = new Date(0);

interface SaleCreationScreenProps {
  /** Client preselected by the entry context; unknown ids fall back to none. */
  readonly initialClientId?: string;
}

export function SaleCreationScreen({ initialClientId }: SaleCreationScreenProps) {
  const router = useRouter();
  const business = useCurrentBusiness();
  const { products, activeProducts, getProductById } = useProductCatalog();
  const { getClientById } = useClientSession();
  const { completeSale } = useSaleSession();

  const [saleId] = useState(() => createSaleId());
  const lineSequence = useRef(0);
  const [lines, setLines] = useState<readonly SaleDraftLine[]>([]);
  // An archived Client is historical: she is never attached to a NEW Sale,
  // even when a stale route parameter names her.
  const [clientId, setClientId] = useState<string | undefined>(() => {
    const initialClient = getClientById(initialClientId);
    return initialClient && !isClientArchived(initialClient) ? initialClient.id : undefined;
  });
  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanResult, setScanResult] = useState<SaleScanResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const client = getClientById(clientId);
  const trimmedQuery = query.trim();
  const searchResults = trimmedQuery.length > 0 ? prepareProductDirectory(activeProducts, trimmedQuery) : [];

  const buildDraft = (completedAt: Date): SaleDraft => ({
    id: saleId,
    businessId: business.id,
    clientId,
    completedAt,
    lines,
  });

  const validation = prepareSaleCompletion(buildDraft(PREVIEW_INSTANT), products);
  const issues = validation.ok
    ? []
    : validation.issues.filter((issue) => issue.kind !== 'EMPTY_SALE');
  const total = getSaleTotal({
    items: lines.map((line) => ({
      unitPrice: getProductById(line.productId)?.price ?? 0,
      quantity: line.quantity,
    })),
  });
  const unitCount = lines.reduce((count, line) => count + line.quantity, 0);

  const addProduct = (product: Product) => {
    const result = addProductToDraft(lines, product, () => {
      lineSequence.current += 1;
      return createSaleItemId(saleId, lineSequence.current);
    });

    if (result.outcome === 'added' || result.outcome === 'incremented') {
      setLines(result.lines);
      setNotice(null);
      haptics.selection();
      return;
    }

    haptics.warning();
    setNotice(
      result.outcome === 'inactive'
        ? 'Ce produit est inactif.'
        : `Stock insuffisant pour ${product.name}.`,
    );
  };

  const handleScanned = (barcode: string) => {
    setScannerVisible(false);
    const matches = findProductsByBarcode(products, barcode);
    const active = matches.filter((product) => product.active);

    if (active.length === 1) {
      addProduct(active[0]);
      return;
    }
    if (matches.length === 0) {
      setScanResult({ kind: 'unknown', barcode });
      return;
    }
    if (active.length === 0) {
      setScanResult({ kind: 'inactive', barcode });
      return;
    }
    setScanResult({ kind: 'multiple', barcode, matches: active });
  };

  const changeQuantity = (line: SaleDraftLine, delta: number) => {
    setLines((current) => setDraftLineQuantity(current, line.id, line.quantity + delta));
    setNotice(null);
    haptics.selection();
  };

  const removeLine = (line: SaleDraftLine) => {
    setLines((current) => removeDraftLine(current, line.id));
    setNotice(null);
  };

  const requestDiscard = () => {
    setDiscardRequested(true);
  };

  // Guards the hardware back while a draft holds lines.
  usePreventRemove(lines.length > 0 && !isLeaving, requestDiscard);

  useEffect(() => {
    if (isLeaving) {
      router.back();
    }
  }, [isLeaving, router]);

  const validate = () => {
    let result: ReturnType<typeof completeSale>;
    try {
      result = completeSale(buildDraft(new Date()));
    } catch {
      alertPersistenceFailure();
      return;
    }
    if (!result.ok) {
      haptics.warning();
      return;
    }
    haptics.success();
    setIsLeaving(true);
  };

  const cancel = () => {
    if (lines.length === 0) {
      setIsLeaving(true);
      return;
    }
    requestDiscard();
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
      testID="sale-open-barcode-scanner"
    >
      <SymbolView
        name={{ ios: 'barcode.viewfinder', android: 'barcode_scanner' }}
        size={19}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );

  return (
    <SheetScreen keyboardAvoiding testID="sale-creation-sheet">
      <View style={styles.headerZone}>
        <SheetHeader
          action={{ accessibilityLabel: 'Annuler la vente', label: 'Annuler', onPress: cancel }}
          eyebrow="VENTE"
          title="Nouvelle vente"
        />
      </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <SectionHeader title="Cliente" />
            <View style={styles.clientSurface} testID="sale-client">
              <View style={styles.clientCopy}>
                <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
                  {client ? getClientDisplayName(client) : 'Aucune cliente'}
                </AppText>
                {!client && (
                  <AppText variant="metadata" style={styles.clientHint}>
                    Vente de passage, sans historique cliente.
                  </AppText>
                )}
              </View>
              <View style={styles.clientActions}>
                {client && (
                  <AppButton
                    accessibilityLabel="Retirer la cliente"
                    onPress={() => setClientId(undefined)}
                    style={styles.clientAction}
                    title="Retirer"
                    variant="tertiary"
                  />
                )}
                <AppButton
                  accessibilityLabel={client ? 'Modifier la cliente' : 'Choisir une cliente'}
                  onPress={() => setClientPickerVisible(true)}
                  style={styles.clientAction}
                  title={client ? 'Modifier' : 'Choisir une cliente'}
                  variant="tertiary"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader count={unitCount} title="Produits" />
            <SearchField
              accessibilityLabel="Rechercher un produit"
              onChangeText={setQuery}
              placeholder="Rechercher un produit"
              trailingAccessory={scanAccessory}
              value={query}
            />

            {notice && (
              <AppText variant="metadata" style={styles.notice} testID="sale-notice">
                {notice}
              </AppText>
            )}

            {trimmedQuery.length > 0 && (
              <View style={styles.results} testID="sale-search-results">
                {searchResults.length === 0 ? (
                  <AppText variant="metadata" style={styles.emptyResults}>
                    Aucun produit actif ne correspond.
                  </AppText>
                ) : (
                  searchResults.map((product) => (
                    <SaleProductRow
                      draftQuantity={getDraftQuantity(lines, product.id)}
                      key={product.id}
                      onPress={() => addProduct(product)}
                      product={product}
                    />
                  ))
                )}
              </View>
            )}

            {lines.length === 0 ? (
              <View style={styles.emptyLines}>
                <AppText variant="stateTitle">Aucun produit ajouté</AppText>
                <AppText variant="metadata" style={styles.emptyLinesText}>
                  Recherchez ou scannez un produit pour l’ajouter à la vente.
                </AppText>
              </View>
            ) : (
              <View style={styles.lines}>
                {lines.map((line) => (
                  <SaleLineRow
                    key={line.id}
                    line={line}
                    onDecrement={() => changeQuantity(line, -1)}
                    onIncrement={() => changeQuantity(line, 1)}
                    onRemove={() => removeLine(line)}
                    product={getProductById(line.productId)}
                  />
                ))}
              </View>
            )}
          </View>

          {lines.length > 0 && (
            <View style={styles.totalSurface}>
              <AppText variant="sectionTitle" style={styles.totalLabel}>
                Total
              </AppText>
              <AppText variant="summaryValue" style={styles.totalValue} testID="sale-total">
                {formatServicePrice(total)}
              </AppText>
            </View>
          )}

          {issues.length > 0 && (
            <View style={styles.issues} testID="sale-issues">
              {issues.map((issue, index) => (
                <AppText key={`${issue.kind}-${index}`} variant="metadata" style={styles.issueText}>
                  {describeSaleCompletionIssue(issue, (productId) => getProductById(productId)?.name)}
                </AppText>
              ))}
            </View>
          )}
        </ScrollView>

      <SheetActionBar>
        <AppButton
          accessibilityLabel="Valider la vente"
          disabled={!validation.ok}
          onPress={validate}
          testID="validate-sale"
          title="Valider la vente"
        />
      </SheetActionBar>

      <ClientPickerSheet
        onClose={() => setClientPickerVisible(false)}
        onSelectClient={(selectedClientId) => {
          setClientId(selectedClientId);
          setClientPickerVisible(false);
        }}
        selectedClientId={clientId}
        visible={clientPickerVisible}
      />

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        visible={scannerVisible}
      />

      <SaleScanResultSheet
        draftQuantityOf={(productId) => getDraftQuantity(lines, productId)}
        onClose={() => setScanResult(null)}
        onSelectProduct={(product) => {
          setScanResult(null);
          addProduct(product);
        }}
        result={scanResult}
      />

      <ConfirmationDialog
        body="Les produits ajoutés ne seront pas vendus."
        cancelLabel="Continuer la vente"
        cancelTestID="keep-sale"
        confirmLabel="Abandonner"
        confirmTestID="discard-sale"
        eyebrow="VENTE"
        onCancel={() => setDiscardRequested(false)}
        onConfirm={() => {
          setDiscardRequested(false);
          setIsLeaving(true);
        }}
        testID="discard-sale-dialog"
        title="Abandonner la vente ?"
        visible={discardRequested}
      />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  section: { gap: spacing.md },
  clientSurface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  clientCopy: { gap: 2 },
  clientName: { color: semanticColors.foreground },
  clientHint: { color: foregroundSoft },
  clientActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  clientAction: { paddingHorizontal: spacing.md },
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
  notice: { color: rose.rose600 },
  results: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    paddingHorizontal: spacing.md,
  },
  emptyResults: { color: foregroundSoft, paddingVertical: spacing.md },
  emptyLines: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  emptyLinesText: { color: foregroundSoft, textAlign: 'center' },
  lines: { gap: spacing.sm },
  totalSurface: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  totalLabel: { color: semanticColors.foreground },
  totalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  issues: {
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    gap: spacing.xs,
    padding: spacing.md,
  },
  issueText: { color: rose.rose600 },
});
