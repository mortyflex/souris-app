// Souris — Sale creation (Nouvelle vente)
//
// ONE focused operational flow: a Client, Product search + scan, immediate
// add / increment, bounded quantities, derived total, then « Valider la
// vente ». The draft is local to this screen; the canonical Product catalog
// and the Sale session change ONLY through the atomic completion boundary
// (`useSaleSession().completeSale`).
//
// Live Product values (name, price, image, stock) feed the draft UI; the
// completed Sale keeps its own snapshot.
//
// Presented as a native form sheet in the canonical Souris shell like every
// other Souris creation flow (swipe-to-dismiss off; explicit « Annuler »). A
// draft with lines is guarded against « Annuler » and the hardware back by
// the shared Souris confirmation dialog.
//
// Entry contexts (docs/domain/SALES.md §4), decided by the resolved
// Appointment id, never by UI state:
// - Appointment Details (« Revente ») passes the Appointment id. When it
//   resolves to a known Appointment, the Sale belongs to THAT Appointment's
//   Client: the « Cliente » row is read-only (no chevron, no picker, no
//   removal) and the completed Sale carries the Appointment id so the
//   Appointment can list its Products.
// - Produits (and the Client Profile, which preselects its Client) open an
//   editable « Cliente » row: the whole row opens the shared picker, and a
//   selection replaces the current Client. A Client is required to validate;
//   there is no walk-in sale and no « Retirer ».
// An Appointment is never inferred from the Client.
//
// Header: the shared editing header (« Annuler » leading, « Nouvelle vente »),
// like « Nouveau rendez-vous » — no eyebrow.
//
// Layout: « Produits ajoutés » (the visual source of truth of the draft)
// sits ABOVE « Ajouter un produit » and its « Résultats », so what is in the
// sale never depends on the query length; the query is kept after an add.
// The footer always states units and total above « Valider la vente ».
//
// Payment: a STANDALONE Sale records what was received (card / cash) in the
// shared checkout sheet before it completes; a Sale sold during an
// Appointment skips that step because the Appointment checkout records the
// whole amount received.

import { useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { eurosToCents } from "@/domain/appointments";
import {
  getClientDisplayName,
  isClientArchived,
  type Client,
} from "@/domain/clients";
import type { Product } from "@/domain/products";
import {
  getSaleTotal,
  prepareSaleCompletion,
  type SaleDraft,
  type SaleDraftLine,
  type SalePaymentAmounts,
} from "@/domain/sales";
import { useOptionalAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { useCurrentBusiness } from "@/features/business/session/CurrentBusinessProvider";
import { ClientPickerSheet } from "@/features/clients/selection/ClientPickerSheet";
import { useClientSession } from "@/features/clients/session/ClientSessionProvider";
import {
  findProductsByBarcode,
  prepareProductDirectory,
} from "@/features/products/search/filter-products";
import { useProductCatalog } from "@/features/products/session/ProductCatalogProvider";
import { formatServicePrice } from "@/features/services/presentation";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { BarcodeScannerModal } from "@/shared/ui/BarcodeScannerModal";
import { ConfirmationDialog } from "@/shared/ui/ConfirmationDialog";
import { GroupedDataRow } from "@/shared/ui/GroupedDataRow";
import { GroupedSeparator, GroupedSurface } from "@/shared/ui/GroupedSurface";
import { SearchField } from "@/shared/ui/SearchField";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetActionBar } from "@/shared/ui/SheetActionBar";
import { SheetEditingHeader } from "@/shared/ui/SheetEditingHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import {
  describeSaleCompletionIssue,
  formatSaleUnitCount,
} from "../presentation";
import { useSaleSession } from "../session/SaleSessionProvider";
import { SaleLineRow } from "./components/SaleLineRow";
import { SalePaymentSheet } from "./components/SalePaymentSheet";
import {
  SALE_ROW_SEPARATOR_INSET,
  SaleProductRow,
} from "./components/SaleProductRow";
import {
  SaleScanResultSheet,
  type SaleScanResult,
} from "./components/SaleScanResultSheet";
import {
  addProductToDraft,
  getDraftQuantity,
  removeDraftLine,
  setDraftLineQuantity,
} from "./draft";
import { createSaleId, createSaleItemId } from "./runtime-ids";

const horizontalGutter =
  Platform.OS === "android" ? gutter.android : gutter.ios;
const clientIcon: SymbolViewProps["name"] = {
  ios: "person",
  android: "person",
};

// Validation preview only needs a stable placeholder instant; the real
// completion instant is taken when the professional validates.
const PREVIEW_INSTANT = new Date(0);

interface SaleCreationScreenProps {
  /** Client preselected by the entry context; unknown ids fall back to none. */
  readonly initialClientId?: string;
  /** Appointment the Sale is sold during (Revente); unknown ids fall back to none. */
  readonly initialAppointmentId?: string;
}

/** An archived Client is historical: she is never attached to a NEW Sale. */
function activeClientId(client: Client | undefined): string | undefined {
  return client && !isClientArchived(client) ? client.id : undefined;
}

export function SaleCreationScreen({
  initialClientId,
  initialAppointmentId,
}: SaleCreationScreenProps) {
  const router = useRouter();
  const business = useCurrentBusiness();
  const { products, activeProducts, getProductById } = useProductCatalog();
  const { getClientById } = useClientSession();
  const { completeSale } = useSaleSession();
  const appointmentSession = useOptionalAppointmentSession();
  // The link is kept only for an Appointment that actually exists; a stale
  // or foreign route parameter never becomes Sale history. Its Client is
  // authoritative and fixed for the whole draft.
  const [linkedAppointment] = useState(
    () =>
      appointmentSession?.getAppointmentById(initialAppointmentId)?.appointment,
  );
  const appointmentId = linkedAppointment?.id;
  const clientLocked = linkedAppointment !== undefined;

  const [saleId] = useState(() => createSaleId());
  const lineSequence = useRef(0);
  const [lines, setLines] = useState<readonly SaleDraftLine[]>([]);
  const [clientId, setClientId] = useState<string | undefined>(() =>
    activeClientId(
      getClientById(
        linkedAppointment ? linkedAppointment.clientId : initialClientId,
      ),
    ),
  );
  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanResult, setScanResult] = useState<SaleScanResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const client = getClientById(clientId);
  const trimmedQuery = query.trim();
  const searchResults =
    trimmedQuery.length > 0
      ? prepareProductDirectory(activeProducts, trimmedQuery)
      : [];

  const buildDraft = (
    completedAt: Date,
    payment?: SalePaymentAmounts,
  ): SaleDraft => ({
    id: saleId,
    businessId: business.id,
    clientId,
    appointmentId,
    ...(payment ? { payment } : {}),
    completedAt,
    lines,
  });

  const validation = prepareSaleCompletion(
    buildDraft(PREVIEW_INSTANT),
    products,
  );
  // The canonical model still accepts historical walk-in Sales; this flow
  // creates Sales for a Client only.
  const canValidate = validation.ok && clientId !== undefined;
  const issues = validation.ok
    ? []
    : validation.issues.filter((issue) => issue.kind !== "EMPTY_SALE");
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

    if (result.outcome === "added" || result.outcome === "incremented") {
      setLines(result.lines);
      setNotice(null);
      haptics.selection();
      return;
    }

    haptics.warning();
    setNotice(
      result.outcome === "inactive"
        ? "Ce produit est inactif."
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
      setScanResult({ kind: "unknown", barcode });
      return;
    }
    if (active.length === 0) {
      setScanResult({ kind: "inactive", barcode });
      return;
    }
    setScanResult({ kind: "multiple", barcode, matches: active });
  };

  const changeQuantity = (line: SaleDraftLine, delta: number) => {
    setLines((current) =>
      setDraftLineQuantity(current, line.id, line.quantity + delta),
    );
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

  const complete = (payment?: SalePaymentAmounts) => {
    let result: ReturnType<typeof completeSale>;
    try {
      result = completeSale(buildDraft(new Date(), payment));
    } catch {
      alertPersistenceFailure();
      return;
    }
    if (!result.ok) {
      haptics.warning();
      return;
    }
    setPaymentVisible(false);
    haptics.success();
    setIsLeaving(true);
  };

  // A standalone Sale records its payment first; a Sale sold during an
  // Appointment completes directly (the Appointment checkout records the money).
  const validate = () => {
    if (!canValidate) return;
    if (appointmentId === undefined) {
      setPaymentVisible(true);
      return;
    }
    complete();
  };

  const cancel = () => {
    if (lines.length === 0) {
      setIsLeaving(true);
      return;
    }
    requestDiscard();
  };

  const clientName = client ? getClientDisplayName(client) : undefined;

  const scanAccessory = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scanner un code-barres"
      hitSlop={spacing.sm}
      onPress={() => {
        setScanResult(null);
        setScannerVisible(true);
      }}
      style={({ pressed }) => [
        styles.scanAction,
        pressed && styles.scanActionPressed,
      ]}
      testID="sale-open-barcode-scanner"
    >
      <SymbolView
        name={{ ios: "barcode.viewfinder", android: "barcode_scanner" }}
        size={19}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );

  return (
    <SheetScreen keyboardAvoiding testID="sale-creation-sheet">
      <View style={styles.headerZone}>
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler la vente"
          onCancel={cancel}
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
          <GroupedSurface testID="sale-client">
            {clientLocked ? (
              <GroupedDataRow
                detail="Liée au rendez-vous"
                icon={clientIcon}
                label="Cliente"
                testID="sale-client-row"
                value={clientName ?? "—"}
              />
            ) : (
              <GroupedDataRow
                accessibilityHint={
                  clientName ? "Changer la cliente" : undefined
                }
                icon={clientIcon}
                label="Cliente"
                onPress={() => setClientPickerVisible(true)}
                testID="sale-client-row"
                value={clientName ?? "Choisir une cliente"}
              />
            )}
          </GroupedSurface>
        </View>

        <View style={styles.section} testID="sale-lines-section">
          {lines.length === 0 ? (
            <View style={styles.emptyLines} testID="sale-lines-empty">
              <AppText variant="rowTitle" style={styles.emptyLinesTitle}>
                Aucun produit ajouté
              </AppText>
              <AppText variant="metadata" style={styles.emptyLinesText}>
                Recherchez ou scannez un produit pour l’ajouter à la vente.
              </AppText>
            </View>
          ) : (
            <GroupedSurface testID="sale-lines">
              {lines.map((line, index) => (
                <View key={line.id}>
                  {index > 0 && (
                    <GroupedSeparator inset={SALE_ROW_SEPARATOR_INSET} />
                  )}
                  <SaleLineRow
                    line={line}
                    onDecrement={() => changeQuantity(line, -1)}
                    onIncrement={() => changeQuantity(line, 1)}
                    onRemove={() => removeLine(line)}
                    product={getProductById(line.productId)}
                  />
                </View>
              ))}
            </GroupedSurface>
          )}

          {issues.length > 0 && (
            <View style={styles.issues} testID="sale-issues">
              {issues.map((issue, index) => (
                <AppText
                  key={`${issue.kind}-${index}`}
                  variant="metadata"
                  style={styles.issueText}
                >
                  {describeSaleCompletionIssue(
                    issue,
                    (productId) => getProductById(productId)?.name,
                  )}
                </AppText>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Ajouter un produit" />
          <SearchField
            accessibilityLabel="Rechercher un produit"
            onChangeText={setQuery}
            placeholder="Rechercher un produit"
            trailingAccessory={scanAccessory}
            value={query}
          />

          {notice && (
            <AppText
              variant="metadata"
              style={styles.notice}
              testID="sale-notice"
            >
              {notice}
            </AppText>
          )}
        </View>

        {trimmedQuery.length > 0 && (
          <View style={styles.section} testID="sale-search-results">
            <SectionHeader title="Résultats" />
            {searchResults.length === 0 ? (
              <AppText variant="metadata" style={styles.emptyResults}>
                Aucun produit actif ne correspond.
              </AppText>
            ) : (
              <GroupedSurface>
                {searchResults.map((product, index) => (
                  <View key={product.id}>
                    {index > 0 && (
                      <GroupedSeparator inset={SALE_ROW_SEPARATOR_INSET} />
                    )}
                    <SaleProductRow
                      draftQuantity={getDraftQuantity(lines, product.id)}
                      onPress={() => addProduct(product)}
                      product={product}
                    />
                  </View>
                ))}
              </GroupedSurface>
            )}
          </View>
        )}
      </ScrollView>

      <SheetActionBar>
        <View
          accessible
          accessibilityLabel={`${formatSaleUnitCount(unitCount)}, total ${formatServicePrice(total)}`}
          style={styles.summary}
          testID="sale-summary"
        >
          <AppText
            variant="body"
            style={styles.summaryCount}
            testID="sale-unit-count"
          >
            {`${formatSaleUnitCount(unitCount)} · `}
          </AppText>
          <AppText
            variant="control"
            style={styles.summaryTotal}
            testID="sale-total"
          >
            {formatServicePrice(total)}
          </AppText>
        </View>
        <AppButton
          accessibilityLabel="Valider la vente"
          disabled={!canValidate}
          onPress={validate}
          testID="validate-sale"
          title="Valider la vente"
        />
      </SheetActionBar>

      <SalePaymentSheet
        onClose={() => setPaymentVisible(false)}
        onConfirm={complete}
        totalCents={eurosToCents(total)}
        visible={paymentVisible}
      />

      {!clientLocked && (
        <ClientPickerSheet
          onClose={() => setClientPickerVisible(false)}
          onSelectClient={(selectedClientId) => {
            setClientId(selectedClientId);
            setClientPickerVisible(false);
          }}
          selectedClientId={clientId}
          visible={clientPickerVisible}
        />
      )}

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
    paddingBottom: spacing["3xl"],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  section: { gap: spacing.md },
  scanAction: {
    alignItems: "center",
    borderRadius: radii.small,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  scanActionPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    opacity: interaction.pressedOpacity,
  },
  notice: { color: rose.rose600 },
  emptyResults: { color: foregroundSoft },
  emptyLines: {
    alignItems: "center",
    backgroundColor: semanticColors.surface,
    borderCurve: "continuous",
    borderRadius: radii.large,
    gap: 2,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  emptyLinesTitle: { color: semanticColors.foreground },
  emptyLinesText: { color: foregroundSoft, textAlign: "center" },
  issues: {
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: "continuous",
    borderRadius: radii.medium,
    gap: spacing.xs,
    padding: spacing.md,
  },
  issueText: { color: rose.rose600 },
  summary: { alignItems: "baseline", flexDirection: "row" },
  summaryCount: { color: foregroundSoft, fontVariant: ["tabular-nums"] },
  summaryTotal: {
    color: semanticColors.foreground,
    fontVariant: ["tabular-nums"],
  },
});
