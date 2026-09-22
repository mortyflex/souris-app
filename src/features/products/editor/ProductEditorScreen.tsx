// Souris — Product editor screen (create + details + edit)
//
// Modes:
// - create: empty shared Product form, "Ajouter le produit";
// - existing read mode (Product Details): the detail-sheet header of
//   Appointment Details (name + « ••• » + ×), price + state pill, ONE grouped
//   Informations surface, the Stock surface with the direct [−] n [+]
//   adjustment, and the sticky « Modifier le produit ». Désactiver /
//   Réactiver and Supprimer live in the « ••• » drawer;
// - existing edit mode: the SAME form hydrated with current values,
//   "Annuler" / "Enregistrer les modifications".
//
// id/businessId are stable across edits. Current stock is direct V1 state —
// stock-movement history belongs to the future Sales/Inventory domain. The
// details stepper writes each step through the catalog's `setProductStock`
// (SQLite first, then state, then sync), with the same selector rules as the
// form; a failed write keeps the persisted count and alerts.
//
// Presented in the canonical Souris sheet shell, sized to its content: the
// read-first details never leave a blank middle area, and the form grows up
// to the standard detent. The keyboard stays closed until a field is tapped.
// Deactivation and deletion use the shared Souris confirmation dialog.
// Swipe-to-dismiss is allowed while reading and disabled while a draft is
// being edited (`dismissible` on the sheet shell).

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import type { Product } from "@/domain/products";
import { ProductImage } from "@/features/products/components/ProductImage";
import { useCurrentBusiness } from "@/features/business/session/CurrentBusinessProvider";
import { formatServicePrice } from "@/features/services/presentation";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { BarcodeScannerModal } from "@/shared/ui/BarcodeScannerModal";
import { ConfirmationDialog } from "@/shared/ui/ConfirmationDialog";
import { GlassIconButton, glassIcons } from "@/shared/ui/GlassIconButton";
import { GroupedSeparator, GroupedSurface } from "@/shared/ui/GroupedSurface";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetActionBar } from "@/shared/ui/SheetActionBar";
import { SheetEditingHeader } from "@/shared/ui/SheetEditingHeader";
import { SheetHeader } from "@/shared/ui/SheetHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import { TextField } from "@/shared/ui/TextField";
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import { ProductStatePill } from "../components/ProductStatePill";
import { useProductCatalog } from "../session/ProductCatalogProvider";
import {
  ProductActionsSheet,
  type ProductSecondaryAction,
} from "./components/ProductActionsSheet";
import { ProductPhotoField } from "./components/ProductPhotoField";
import { StockStepper } from "./components/StockStepper";
import {
  buildProductFromForm,
  EMPTY_PRODUCT_FORM,
  toProductFormValues,
  validateProductForm,
  type ProductFormValues,
} from "./product-form";
import { createProductId } from "./runtime-ids";

export type ProductEditorMode = "create" | "existing";

interface ProductEditorScreenProps {
  readonly mode: ProductEditorMode;
  readonly productId?: string;
  readonly initialBarcode?: string;
}

type ProductConfirmation = "deactivate" | "delete";

const horizontalGutter =
  Platform.OS === "android" ? gutter.android : gutter.ios;

export function ProductEditorScreen({
  mode,
  productId,
  initialBarcode,
}: ProductEditorScreenProps) {
  const router = useRouter();
  const business = useCurrentBusiness();
  const {
    addProduct,
    deleteProduct,
    getProductById,
    products,
    setProductActive,
    setProductStock,
    updateProduct,
  } = useProductCatalog();
  const product = getProductById(productId);
  const [runtimeProductId] = useState(() =>
    mode === "create" ? createProductId() : (productId ?? "missing-product"),
  );
  const [values, setValues] = useState<ProductFormValues | null>(() =>
    mode === "create"
      ? { ...EMPTY_PRODUCT_FORM, barcode: initialBarcode?.trim() ?? "" }
      : mode === "existing" && product
        ? toProductFormValues(product)
        : null,
  );
  const [editing, setEditing] = useState(mode === "create");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<ProductConfirmation>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProductSecondaryAction>();

  if (mode === "existing" && !product) {
    return (
      <SheetScreen fit="content">
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Produit introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce produit n&apos;est plus disponible.
          </AppText>
          <AppButton
            onPress={() => router.back()}
            title="Fermer"
            variant="secondary"
          />
        </View>
      </SheetScreen>
    );
  }

  const validation = values ? validateProductForm(values) : undefined;
  const duplicateBarcodeProduct = values?.barcode.trim()
    ? products.find(
        (candidate) =>
          candidate.id !== product?.id &&
          candidate.barcode === values.barcode.trim(),
      )
    : undefined;

  const close = () => {
    if (mode === "existing" && editing && product) {
      setValues(toProductFormValues(product));
      setAttempted(false);
      setEditing(false);
      return;
    }
    router.back();
  };

  const updateField = <Key extends keyof ProductFormValues>(
    key: Key,
    value: ProductFormValues[Key],
  ) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    if (!values || saving) return;
    setAttempted(true);
    const nextValidation = validateProductForm(values);
    if (!nextValidation.valid) return;

    const nextProduct = buildProductFromForm({
      id: product?.id ?? runtimeProductId,
      businessId: product?.businessId ?? business.id,
      active: product?.active ?? true,
      values,
    });

    setSaving(true);
    try {
      if (mode === "create") {
        await addProduct(nextProduct);
        haptics.success();
        router.back();
        return;
      }

      await updateProduct(nextProduct);
      setValues(toProductFormValues(nextProduct));
      setAttempted(false);
      setEditing(false);
      haptics.success();
    } catch {
      alertPersistenceFailure();
    } finally {
      setSaving(false);
    }
  };

  const commitActiveState = (active: boolean) => {
    if (!product) return;
    try {
      setProductActive(product.id, active);
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.selection();
    router.back();
  };

  const changeActiveState = () => {
    if (!product) return;
    if (!product.active) {
      commitActiveState(true);
      return;
    }
    setConfirmation("deactivate");
  };

  const confirmDeactivate = () => {
    setConfirmation(undefined);
    commitActiveState(false);
  };

  // Runs once the « ••• » drawer is gone, so no dialog races its closing.
  const runSecondaryAction = () => {
    const action = pendingAction;
    setPendingAction(undefined);
    if (action === "toggle-active") changeActiveState();
    if (action === "delete") setConfirmation("delete");
  };

  /** Direct stock adjustment; `false` tells the stepper the write failed. */
  const adjustStock = (stockQuantity: number): boolean => {
    if (!product) return false;
    try {
      setProductStock(product.id, stockQuantity);
    } catch {
      alertPersistenceFailure();
      return false;
    }
    haptics.selection();
    return true;
  };

  const startEditing = () => {
    if (!product) return;
    setValues(toProductFormValues(product));
    setAttempted(false);
    setEditing(true);
  };

  const confirmDelete = () => {
    if (!product) return;
    setConfirmation(undefined);
    try {
      deleteProduct(product.id);
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.warning();
    router.back();
  };

  return (
    <SheetScreen
      // Details and edition are two sheets: the change slides in, never swaps.
      contentKey={editing ? "edit" : "read"}
      // A draft under edition must not be lost to a swipe; reading may dismiss.
      dismissible={!editing}
      fit="content"
      keyboardAvoiding
      testID="product-sheet"
    >
      {mode === "existing" && !editing && product ? (
        // Detail sheet: name + « ••• » + ×, like Appointment Details. The
        // creation / editing header (« Annuler » + title) stays for the form.
        <View
          style={[styles.headerZone, styles.detailHeader]}
          testID="product-detail-header"
        >
          <AppText
            accessibilityRole="header"
            numberOfLines={2}
            selectable
            style={styles.detailTitle}
            variant="sheetTitle"
          >
            {product.name}
          </AppText>
          <View style={styles.headerActions}>
            <GlassIconButton
              accessibilityLabel="Actions du produit"
              icon={glassIcons.more}
              onPress={() => setMenuVisible(true)}
              testID="open-product-actions"
            />
            <GlassIconButton
              accessibilityLabel="Fermer"
              icon={glassIcons.close}
              onPress={() => router.back()}
              testID="close-product-details"
            />
          </View>
        </View>
      ) : mode === "existing" ? (
        // Editing sheet: the canonical « Annuler » + title header, the ONE
        // Cancel of the sheet (back to the details, draft discarded).
        <View style={styles.headerZone}>
          <SheetEditingHeader
            cancelTestID="cancel-product-edit"
            onCancel={close}
            title="Modifier le produit"
          />
        </View>
      ) : (
        <View style={styles.headerZone}>
          <SheetHeader
            action={{ label: "Annuler", onPress: close }}
            divider
            eyebrow="NOUVEAU PRODUIT"
            title="Ajouter un produit"
            titleNumberOfLines={1}
          />
        </View>
      )}

      {editing && values && validation ? (
        <ProductForm
          attempted={attempted}
          duplicateBarcodeProduct={duplicateBarcodeProduct}
          validation={validation}
          values={values}
          onChangeField={updateField}
        />
      ) : product ? (
        <ProductReadView onAdjustStock={adjustStock} product={product} />
      ) : null}

      {values && editing && (
        <SheetActionBar>
          <AppButton
            accessibilityLabel={
              mode === "create" ? undefined : "Enregistrer les modifications"
            }
            disabled={!validation?.valid || saving}
            onPress={() => void save()}
            testID="save-product"
            title={mode === "create" ? "Ajouter le produit" : "Enregistrer"}
          />
        </SheetActionBar>
      )}

      {mode === "existing" && !editing && product && (
        // Outside the scroll: always visible; SheetScreen clears the home indicator.
        <SheetActionBar testID="product-read-actions">
          <AppButton
            onPress={startEditing}
            testID="edit-product"
            title="Modifier le produit"
          />
        </SheetActionBar>
      )}

      {mode === "existing" && product && (
        <ProductActionsSheet
          active={product.active}
          onClose={() => setMenuVisible(false)}
          onDismissed={runSecondaryAction}
          onSelect={(action) => {
            setPendingAction(action);
            setMenuVisible(false);
          }}
          productName={product.name}
          visible={menuVisible}
        />
      )}

      <ConfirmationDialog
        body="Le produit restera dans le catalogue mais ne sera plus actif."
        cancelLabel="Annuler"
        cancelTestID="cancel-product-deactivation"
        confirmLabel="Désactiver"
        confirmTestID="confirm-product-deactivation"
        eyebrow="PRODUIT"
        onCancel={() => setConfirmation(undefined)}
        onConfirm={confirmDeactivate}
        testID="product-deactivation-dialog"
        title="Désactiver ce produit ?"
        tone="neutral"
        visible={confirmation === "deactivate"}
      />
      <ConfirmationDialog
        body="Il sera supprimé du catalogue. Cette action est irréversible."
        cancelLabel="Retour"
        cancelTestID="cancel-product-deletion"
        confirmLabel="Supprimer"
        confirmTestID="confirm-product-deletion"
        eyebrow="SUPPRESSION"
        onCancel={() => setConfirmation(undefined)}
        onConfirm={confirmDelete}
        testID="product-deletion-dialog"
        title="Supprimer ce produit ?"
        visible={confirmation === "delete"}
      />
    </SheetScreen>
  );
}

interface ProductFormProps {
  readonly values: ProductFormValues;
  readonly attempted: boolean;
  readonly validation: ReturnType<typeof validateProductForm>;
  readonly duplicateBarcodeProduct?: Product;
  readonly onChangeField: <Key extends keyof ProductFormValues>(
    key: Key,
    value: ProductFormValues[Key],
  ) => void;
}

function ProductForm({
  values,
  attempted,
  validation,
  duplicateBarcodeProduct,
  onChangeField,
}: ProductFormProps) {
  const [scannerVisible, setScannerVisible] = useState(false);

  const scanAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scanner un code-barres"
      hitSlop={spacing.sm}
      onPress={() => setScannerVisible(true)}
      style={({ pressed }) => [
        styles.scanAction,
        pressed && styles.scanActionPressed,
      ]}
      testID="open-product-barcode-scanner"
    >
      <SymbolView
        name={{ ios: "barcode.viewfinder", android: "barcode_scanner" }}
        size={19}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );

  return (
    <>
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.formContent}
        style={styles.scroll}
      >
        <ProductPhotoField
          imageUri={values.imageUri}
          onChangeImageUri={(imageUri) => onChangeField("imageUri", imageUri)}
          productName={values.name}
        />
        <View style={styles.formSection} testID="product-form-information">
          <SectionHeader title="Informations" />
          <TextField
            accessibilityLabel="Nom du produit"
            error={
              attempted && !validation.nameValid
                ? "Le nom est requis."
                : undefined
            }
            label="Nom"
            onChangeText={(text) => onChangeField("name", text)}
            placeholder="Ex. Shampooing"
            value={values.name}
          />
          <TextField
            accessibilityLabel="Marque du produit"
            label="Marque"
            onChangeText={(text) => onChangeField("brand", text)}
            placeholder="Optionnel"
            value={values.brand}
          />
          <TextField
            accessibilityLabel="Catégorie du produit"
            label="Catégorie"
            onChangeText={(text) => onChangeField("category", text)}
            placeholder="Optionnel"
            value={values.category}
          />
          <View style={styles.barcodeField}>
            <TextField
              accessibilityLabel="Code-barres du produit"
              label="Code-barres"
              onChangeText={(text) => onChangeField("barcode", text)}
              placeholder="Optionnel"
              trailingAccessory={scanAction}
              value={values.barcode}
            />
            {duplicateBarcodeProduct && (
              <AppText variant="metadata" style={styles.duplicateBarcodeHint}>
                Ce code-barres est aussi utilisé par «{" "}
                {duplicateBarcodeProduct.name} ».
              </AppText>
            )}
          </View>
        </View>
        <View style={styles.formSection} testID="product-form-sale">
          <SectionHeader title="Vente" />
          <TextField
            accessibilityLabel="Prix du produit"
            error={
              attempted && !validation.priceValid
                ? "Indiquez un prix valide, positif ou nul."
                : undefined
            }
            keyboardType="decimal-pad"
            label="Prix"
            onChangeText={(text) => onChangeField("price", text)}
            placeholder="25,00"
            suffix="€"
            value={values.price}
          />
        </View>
        <View style={styles.formSection} testID="product-form-stock">
          <SectionHeader title="Stock" />
          <StockStepper
            onChange={(stockQuantity) =>
              onChangeField("stockQuantity", stockQuantity)
            }
            showLabel={false}
            value={values.stockQuantity}
          />
        </View>
      </ScrollView>
      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={(barcode) => {
          setScannerVisible(false);
          onChangeField("barcode", barcode);
        }}
        visible={scannerVisible}
      />
    </>
  );
}

interface ProductReadViewProps {
  readonly product: Product;
  readonly onAdjustStock: (stockQuantity: number) => boolean;
}

function ProductReadView({ product, onAdjustStock }: ProductReadViewProps) {
  const informationRows = [
    { label: "Marque", value: product.brand },
    { label: "Catégorie", value: product.category },
    { label: "Code-barres", value: product.barcode },
  ].filter((row): row is { label: string; value: string } =>
    Boolean(row.value),
  );
  const price = formatServicePrice(product.price);
  const soldOut = product.stockQuantity === 0;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.readContent}
      style={styles.scroll}
      testID="product-read-view"
    >
      {/* Identity: the catalogue's image (or its placeholder), read-only —
          the photo is changed in « Modifier le produit ». */}
      <View style={styles.productIdentity} testID="product-identity">
        <ProductImage
          imageUri={product.imageUri}
          productName={product.name}
          testID="product-detail-image"
          variant="detail"
        />
        <View style={styles.productSummary}>
          <AppText
            accessibilityLabel={`Prix, ${price}`}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            selectable
            style={styles.priceValue}
            testID="product-price"
            variant="summaryValue"
          >
            {price}
          </AppText>
          <ProductStatePill
            accessibilityLabel={
              product.active ? "Produit actif" : "Produit inactif"
            }
            label={product.active ? "Actif" : "Inactif"}
            testID="product-status-pill"
            tone={product.active ? "positive" : "neutral"}
          />
        </View>
      </View>

      {informationRows.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Informations" />
          <GroupedSurface testID="product-information">
            {informationRows.map((row, index) => (
              <View key={row.label}>
                {index > 0 && <GroupedSeparator inset={spacing.base} />}
                <ReadRow label={row.label} value={row.value} />
              </View>
            ))}
          </GroupedSurface>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader title="Stock" />
        <GroupedSurface style={styles.stockSurface} testID="product-stock">
          <View
            accessible
            accessibilityLabel={`Stock, ${product.stockQuantity} unité${product.stockQuantity > 1 ? "s" : ""}, ${soldOut ? "stock épuisé" : "en stock"}`}
            style={styles.stockHeader}
          >
            <View style={styles.stockIcon}>
              <SymbolView
                name={{ ios: "shippingbox", android: "inventory_2" }}
                size={19}
                tintColor={semanticColors.accent}
              />
            </View>
            <AppText variant="rowTitle" style={styles.stockTitle}>
              Stock
            </AppText>
            <ProductStatePill
              accessibilityLabel={soldOut ? "Stock épuisé" : "En stock"}
              label={soldOut ? "Stock épuisé" : "En stock"}
              testID="product-stock-state"
              tone={soldOut ? "exception" : "positive"}
            />
          </View>
          <StockStepper
            onChange={onAdjustStock}
            showLabel={false}
            testIDPrefix="product-stock"
            value={product.stockQuantity}
          />
        </GroupedSurface>
      </View>
    </ScrollView>
  );
}

function ReadRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.readRow}>
      <AppText variant="body" style={styles.readLabel}>
        {label}
      </AppText>
      <AppText
        variant="control"
        numberOfLines={2}
        selectable
        style={styles.readValue}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  scroll: { flexShrink: 1 },
  formContent: {
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  formSection: { gap: spacing.md },
  barcodeField: { gap: spacing.xs },
  duplicateBarcodeHint: { color: semanticColors.foregroundSoft },
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
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  detailTitle: { color: semanticColors.foreground, flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  readContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  productIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.base,
  },
  productSummary: { flex: 1, gap: spacing.sm, minWidth: 0 },
  priceValue: {
    color: semanticColors.foreground,
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  section: { gap: spacing.sm },
  readRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  readLabel: { color: foregroundSoft, width: 112 },
  readValue: { color: semanticColors.foreground, flex: 1 },
  stockSurface: { gap: spacing.md, padding: spacing.base },
  stockHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  stockIcon: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: "continuous",
    borderRadius: radii.medium,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  stockTitle: { color: semanticColors.foreground, flex: 1 },
  notFound: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["3xl"],
  },
  notFoundText: { color: foregroundSoft, textAlign: "center" },
});
