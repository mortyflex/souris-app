// Souris — Product editor screen (create + details + edit)
//
// Modes:
// - create: empty shared Product form, "Ajouter le produit";
// - existing read mode: identity, price, optional informations, stock, then
//   [Désactiver|Réactiver][Modifier] and the tertiary "Supprimer
//   définitivement";
// - existing edit mode: the SAME form hydrated with current values,
//   "Annuler" / "Enregistrer les modifications".
//
// id/businessId are stable across edits. Current stock is direct V1 state —
// stock-movement history belongs to the future Sales/Inventory domain.
//
// Presented in the canonical Souris sheet shell, sized to its content: the
// read-first details never leave a blank middle area, and the form grows up
// to the standard detent. The keyboard stays closed until a field is tapped.
// Deactivation and deletion use the shared Souris confirmation dialog.
// Swipe-to-dismiss is allowed while reading and disabled while a draft is
// being edited (navigation option toggled here).

import { useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

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
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetActionBar } from "@/shared/ui/SheetActionBar";
import { SheetHeader } from "@/shared/ui/SheetHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import { TextField } from "@/shared/ui/TextField";
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import { useProductCatalog } from "../session/ProductCatalogProvider";
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
  const navigation = useNavigation();
  const business = useCurrentBusiness();
  const {
    addProduct,
    deleteProduct,
    getProductById,
    products,
    setProductActive,
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

  // A draft under edition must not be lost to a swipe; reading may dismiss.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !editing });
  }, [editing, navigation]);

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
  const title =
    mode === "create" ? "Ajouter un produit" : (product?.name ?? "");
  const closeLabel = mode === "create" || editing ? "Annuler" : "Fermer";

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
    <SheetScreen fit="content" keyboardAvoiding testID="product-sheet">
      <View style={styles.headerZone}>
        <SheetHeader
          action={{ label: closeLabel, onPress: close }}
          divider
          eyebrow={mode === "create" ? "NOUVEAU PRODUIT" : "PRODUIT"}
          title={title}
          titleNumberOfLines={1}
        />
      </View>

      {editing && values && validation ? (
        <ProductForm
          attempted={attempted}
          duplicateBarcodeProduct={duplicateBarcodeProduct}
          validation={validation}
          values={values}
          onChangeField={updateField}
        />
      ) : product ? (
        <ProductReadView product={product} />
      ) : null}

      {values && editing && (
        <SheetActionBar direction="row">
          {mode === "existing" && (
            <AppButton
              onPress={close}
              style={styles.secondaryButton}
              testID="cancel-product-edit"
              title="Annuler"
              variant="secondary"
            />
          )}
          <AppButton
            disabled={!validation?.valid || saving}
            onPress={() => void save()}
            style={styles.primaryButton}
            testID="save-product"
            title={
              mode === "create"
                ? "Ajouter le produit"
                : "Enregistrer les modifications"
            }
          />
        </SheetActionBar>
      )}

      {mode === "existing" && !editing && product && (
        <SheetActionBar testID="product-read-actions">
          <View style={styles.readFooterRow}>
            <AppButton
              onPress={changeActiveState}
              style={styles.secondaryButton}
              title={product.active ? "Désactiver" : "Réactiver"}
              variant="secondary"
            />
            <AppButton
              onPress={() => {
                setValues(toProductFormValues(product));
                setAttempted(false);
                setEditing(true);
              }}
              style={styles.primaryButton}
              testID="edit-product"
              title="Modifier"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer ce produit"
            onPress={() => setConfirmation("delete")}
            style={({ pressed }) => [
              styles.deleteAction,
              pressed && styles.deleteActionPressed,
            ]}
          >
            <AppText variant="control" style={styles.deleteText}>
              Supprimer
            </AppText>
          </Pressable>
        </SheetActionBar>
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
      accessibilityLabel="Scanner le code-barres"
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
        <StockStepper
          onChange={(stockQuantity) => onChangeField("stockQuantity", stockQuantity)}
          value={values.stockQuantity}
        />
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

function ProductReadView({ product }: { readonly product: Product }) {
  const hasInformation = Boolean(
    product.brand || product.category || product.barcode,
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.readContent}
      style={styles.scroll}
      testID="product-read-view"
    >
      {product.imageUri && (
        <ProductImage
          imageUri={product.imageUri}
          productName={product.name}
          testID="product-detail-image"
          variant="detail"
        />
      )}

      <View style={styles.productSummary}>
        <View style={styles.statusLine}>
          <View
            style={[styles.statusDot, !product.active && styles.inactiveDot]}
          />
          <AppText variant="metadata" style={styles.statusText}>
            {product.active ? "Actif" : "Inactif"}
          </AppText>
        </View>

        <AppText variant="summaryValue" style={styles.priceValue}>
          {formatServicePrice(product.price)}
        </AppText>
      </View>

      {hasInformation && (
        <View style={styles.infoSection}>
          <SectionHeader title="Informations" />
          <View style={styles.infoSurface}>
            <ReadRow label="Marque" value={product.brand} />
            <ReadRow label="Catégorie" value={product.category} />
            <ReadRow label="Code-barres" value={product.barcode} />
          </View>
        </View>
      )}

      <View style={styles.stockSection}>
        <SectionHeader title="Stock" />
        <View style={styles.stockSurface}>
          <AppText variant="summaryValue" style={styles.stockValue}>
            {product.stockQuantity}
          </AppText>
          <AppText
            variant="metadata"
            style={
              product.stockQuantity === 0
                ? styles.stockEmpty
                : styles.stockLabel
            }
          >
            {product.stockQuantity === 0 ? "Stock épuisé" : "en stock"}
          </AppText>
        </View>
      </View>
    </ScrollView>
  );
}

function ReadRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string;
}) {
  if (!value) return null;

  return (
    <View style={styles.readRow}>
      <AppText variant="metadata" style={styles.readLabel}>
        {label}
      </AppText>
      <AppText
        variant="control"
        numberOfLines={1}
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
    gap: spacing.base,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
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
  readContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  productSummary: { gap: spacing.sm },
  statusLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  statusDot: {
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  inactiveDot: { backgroundColor: semanticColors.foregroundMuted },
  statusText: { color: semanticColors.foregroundSoft },
  priceValue: { color: semanticColors.foreground },
  infoSection: { gap: spacing.sm },
  infoSurface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: "continuous",
    borderRadius: radii.large,
    gap: spacing.sm,
    padding: spacing.md,
  },
  readRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  readLabel: { color: semanticColors.foregroundSoft, width: 104 },
  readValue: { color: semanticColors.foreground, flex: 1 },
  stockSection: { gap: spacing.sm },
  stockSurface: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: "continuous",
    borderRadius: radii.large,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  stockValue: {
    color: semanticColors.foreground,
    fontVariant: ["tabular-nums"],
  },
  stockLabel: { color: semanticColors.foregroundSoft },
  stockEmpty: { color: rose.rose600 },
  secondaryButton: { flex: 1 },
  primaryButton: { flex: 1.4 },
  readFooterRow: { flexDirection: "row", gap: spacing.sm },
  deleteAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.base,
  },
  deleteActionPressed: {
    backgroundColor: semanticColors.surfaceRose,
    borderRadius: radii.small,
  },
  deleteText: { color: rose.rose600 },
  notFound: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["3xl"],
  },
  notFoundText: { color: foregroundSoft, textAlign: "center" },
});
