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

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Product } from "@/domain/products";
import { ProductImage } from "@/features/products/components/ProductImage";
import { DEVELOPMENT_BUSINESS_ID } from "@/features/services/data/initial-services";
import { formatServicePrice } from "@/features/services/presentation";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { BarcodeScannerModal } from "@/shared/ui/BarcodeScannerModal";
import { SectionHeader } from "@/shared/ui/SectionHeader";
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

const horizontalGutter =
  Platform.OS === "android" ? gutter.android : gutter.ios;

export function ProductEditorScreen({
  mode,
  productId,
  initialBarcode,
}: ProductEditorScreenProps) {
  const router = useRouter();
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

  if (mode === "existing" && !product) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
      </SafeAreaView>
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
      businessId: product?.businessId ?? DEVELOPMENT_BUSINESS_ID,
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

  const changeActiveState = () => {
    if (!product) return;
    const commit = (active: boolean) => {
      try {
        setProductActive(product.id, active);
      } catch {
        alertPersistenceFailure();
        return;
      }
      haptics.selection();
      router.back();
    };

    if (!product.active) {
      commit(true);
      return;
    }

    Alert.alert(
      "Désactiver ce produit ?",
      "Le produit restera dans le catalogue mais ne sera plus actif.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Désactiver", onPress: () => commit(false) },
      ],
    );
  };

  const requestDelete = () => {
    if (!product) return;

    Alert.alert(
      "Supprimer ce produit ?",
      "Il sera supprimé du catalogue.\nCette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            try {
              deleteProduct(product.id);
            } catch {
              alertPersistenceFailure();
              return;
            }
            haptics.warning();
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="eyebrow" style={styles.eyebrow}>
              {mode === "create" ? "NOUVEAU PRODUIT" : "PRODUIT"}
            </AppText>
            <AppText
              variant="sheetTitle"
              accessibilityRole="header"
              numberOfLines={1}
            >
              {title}
            </AppText>
          </View>
          <AppButton
            accessibilityLabel={closeLabel}
            onPress={close}
            style={styles.closeButton}
            title={closeLabel}
            variant="tertiary"
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
          <View style={styles.footer}>
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
          </View>
        )}

        {mode === "existing" && !editing && product && (
          <View style={styles.readFooterContainer}>
            <View style={[styles.footer, styles.readFooterRow]}>
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
              onPress={requestDelete}
              style={({ pressed }) => [
                styles.deleteAction,
                pressed && styles.deleteActionPressed,
              ]}
            >
              <AppText variant="control" style={styles.deleteText}>
                 Supprimer
              </AppText>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
      >
        <ProductPhotoField
          imageUri={values.imageUri}
          onChangeImageUri={(imageUri) => onChangeField("imageUri", imageUri)}
          productName={values.name}
        />
        <TextField
          accessibilityLabel="Nom du produit"
          autoFocus
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
        <TextField
          accessibilityLabel="Stock du produit"
          error={
            attempted && !validation.stockValid
              ? "Indiquez une quantité entière, positive ou nulle."
              : undefined
          }
          keyboardType="number-pad"
          label="Stock"
          onChangeText={(text) => onChangeField("stockQuantity", text)}
          placeholder="0"
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
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  keyboardContainer: { flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
  },
  headerCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  eyebrow: { color: semanticColors.accent },
  closeButton: { paddingHorizontal: spacing.md },
  formContent: {
    gap: spacing.base,
    paddingBottom: spacing["3xl"],
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
    gap: spacing.xl,
    paddingBottom: spacing["3xl"],
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
  footer: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  secondaryButton: { flex: 1 },
  primaryButton: { flex: 1.4 },
  readFooterContainer: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.xs,
  },
  readFooterRow: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    paddingBottom: 0,
  },
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
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  notFoundText: { color: foregroundSoft, textAlign: "center" },
});
