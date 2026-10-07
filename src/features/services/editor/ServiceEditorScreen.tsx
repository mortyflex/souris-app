// BeautIzzy — Prestation editor screen (create + details + edit)
//
// Modes:
// - create: « Annuler » + « Nouvelle prestation », the Service / Technique
//   type chooser (structure icons, category colours), then the shared
//   Prestation form;
// - existing read mode (Prestation Details): the detail-sheet header (name +
//   « ••• » + ×), price + Active/Inactive + the Service / Technique category,
//   ONE grouped Informations surface (Durée, Temps de pose only when there is
//   one), the ordered phases of a Technique, and the sticky « Modifier la
//   prestation ». Désactiver / Réactiver and Supprimer live in « ••• »;
// - existing edit mode: the SAME form hydrated with current values, under the
//   canonical « Annuler » + « Modifier la prestation » header, one
//   « Informations » section headed by the read-only Service / Technique pill,
//   and ONE sticky « Enregistrer ».
//
// Durations come from the catalogue presentation helpers; the details never
// compute timing of their own. Deactivation and deletion keep the shared
// BeautIzzy confirmation dialog; each runs once the « ••• » drawer is gone.

import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import type { Service, ServiceType } from "@/domain/appointments";
import { useCurrentBusiness } from "@/features/business/session/CurrentBusinessProvider";
import {
  formatServiceDuration,
  formatServicePrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from "@/features/services/presentation";
import { useServiceCatalog } from "@/features/services/session/ServiceCatalogProvider";
import { PrestationIcon } from "@/features/services/components/PrestationIcon";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { ConfirmationDialog } from "@/shared/ui/ConfirmationDialog";
import {
  DetailActionsSheet,
  type DetailAction,
} from "@/shared/ui/DetailActionsSheet";
import { DetailSheetHeader } from "@/shared/ui/DetailSheetHeader";
import {
  GROUPED_READ_ROW_SEPARATOR_INSET,
  GroupedReadRow,
} from "@/shared/ui/GroupedReadRow";
import { GroupedSeparator, GroupedSurface } from "@/shared/ui/GroupedSurface";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetActionBar } from "@/shared/ui/SheetActionBar";
import { SheetEditingHeader } from "@/shared/ui/SheetEditingHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import { StatePill, statePillTones } from "@/shared/ui/StatePill";
import {
  foregroundSoft,
  gutter,
  interaction,
  peach,
  radii,
  semanticColors,
  serviceCategoryColors,
  spacing,
} from "@/shared/ui/theme";

import { TextField } from "@/shared/ui/TextField";
import { SortablePhaseEditor } from "./components/SortablePhaseEditor";
import { createServiceId, createServicePhaseId } from "./runtime-ids";
import {
  addServicePhase,
  buildServiceFromForm,
  createEmptyServiceForm,
  removeServicePhase,
  reorderServicePhases,
  setPhaseRequiresStaff,
  toServiceFormValues,
  updateServicePhase,
  validateServiceForm,
  type ServiceFormValues,
} from "./service-form";

export type ServiceEditorMode = "create" | "existing";

type ServiceConfirmation = "deactivate" | "delete";
type ServiceSecondaryAction = "toggle-active" | "delete";

const serviceCategoryLabels: Record<ServiceType, string> = {
  SERVICE: "Service",
  TECHNIQUE: "Technique",
};

function serviceActionGroups(
  active: boolean,
): readonly (readonly DetailAction<ServiceSecondaryAction>[])[] {
  return [
    [
      {
        key: "toggle-active",
        label: active ? "Désactiver la prestation" : "Réactiver la prestation",
        icon: active
          ? { ios: "eye.slash", android: "visibility_off" }
          : { ios: "eye", android: "visibility" },
        tone: "normal",
        testID: "toggle-service-active",
      },
    ],
    [
      {
        key: "delete",
        label: "Supprimer la prestation",
        icon: { ios: "trash", android: "delete" },
        tone: "destructive",
        testID: "open-service-deletion",
        accessibilityHint: "Supprime la prestation du catalogue",
      },
    ],
  ];
}

interface ServiceEditorScreenProps {
  readonly mode: ServiceEditorMode;
  readonly serviceId?: string;
}

const horizontalGutter =
  Platform.OS === "android" ? gutter.android : gutter.ios;

export function ServiceEditorScreen({
  mode,
  serviceId,
}: ServiceEditorScreenProps) {
  const router = useRouter();
  const business = useCurrentBusiness();
  const {
    addService,
    deleteService,
    getServiceById,
    setServiceActive,
    updateService,
  } = useServiceCatalog();
  const service = getServiceById(serviceId);
  const [runtimeServiceId] = useState(() =>
    mode === "create" ? createServiceId() : (serviceId ?? "missing-service"),
  );
  const [values, setValues] = useState<ServiceFormValues | null>(() =>
    mode === "existing" && service ? toServiceFormValues(service) : null,
  );
  const [editing, setEditing] = useState(mode === "create");
  const [attempted, setAttempted] = useState(false);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ServiceConfirmation>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<ServiceSecondaryAction>();

  if (mode === "existing" && !service) {
    return (
      <SheetScreen fit="content">
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Prestation introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Cette prestation n&apos;est plus disponible.
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

  const validation = values ? validateServiceForm(values) : undefined;

  const close = () => {
    if (mode === "existing" && editing && service) {
      setValues(toServiceFormValues(service));
      setAttempted(false);
      setEditing(false);
      return;
    }
    router.back();
  };

  const chooseType = (type: ServiceType) => {
    const firstPhaseId = createServicePhaseId(runtimeServiceId);
    setValues(createEmptyServiceForm(type, firstPhaseId));
    setAttempted(false);
    setExpandedPhaseId(type === "TECHNIQUE" ? firstPhaseId : null);
  };

  const addPhase = () => {
    const phaseId = createServicePhaseId(runtimeServiceId);
    setExpandedPhaseId(phaseId);
    setValues((current) =>
      current ? addServicePhase(current, phaseId) : current,
    );
  };

  const removePhase = (phaseId: string) => {
    setExpandedPhaseId((current) => (current === phaseId ? null : current));
    setValues((current) =>
      current ? removeServicePhase(current, phaseId) : current,
    );
  };

  const updateField = <Key extends keyof ServiceFormValues>(
    key: Key,
    value: ServiceFormValues[Key],
  ) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = () => {
    if (!values) return;
    setAttempted(true);
    const nextValidation = validateServiceForm(values);
    if (!nextValidation.valid) return;

    const nextService = buildServiceFromForm({
      id: service?.id ?? runtimeServiceId,
      businessId: service?.businessId ?? business.id,
      active: service?.active ?? true,
      values,
    });

    try {
      if (mode === "create") {
        addService(nextService);
      } else {
        updateService(nextService);
      }
    } catch {
      alertPersistenceFailure();
      return;
    }

    if (mode === "create") {
      haptics.success();
      router.back();
      return;
    }

    setValues(toServiceFormValues(nextService));
    setAttempted(false);
    setEditing(false);
    haptics.success();
  };

  const commitActiveState = (active: boolean) => {
    if (!service) return;
    try {
      setServiceActive(service.id, active);
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.selection();
    router.back();
  };

  const changeActiveState = () => {
    if (!service) return;
    if (!service.active) {
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

  const startEditing = () => {
    if (!service) return;
    setValues(toServiceFormValues(service));
    setAttempted(false);
    setExpandedPhaseId(null);
    setEditing(true);
  };

  const confirmDelete = () => {
    if (!service) return;
    setConfirmation(undefined);
    try {
      deleteService(service.id);
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.warning();
    router.back();
  };

  return (
    <SheetScreen
      // Type chooser, form and details are distinct sheets: each change slides
      // in, never swaps.
      contentKey={
        mode === "create" && !values ? "kind" : editing ? "edit" : "read"
      }
      // A draft under edition must not be lost to a swipe; reading may dismiss.
      dismissible={!editing}
      fit="content"
      keyboardAvoiding
      // Glass Sheet Pilot (DESIGN_OVERRIDES.md §40), experimental.
      material="glass"
      testID="service-sheet"
    >
      {mode === "existing" && !editing && service ? (
        // Detail sheet: name + « ••• » + ×, like Product Details.
        <View style={styles.headerZone}>
          <DetailSheetHeader
            actionsAccessibilityLabel="Actions de la prestation"
            actionsTestID="open-service-actions"
            closeTestID="close-service-details"
            onClose={() => router.back()}
            onOpenActions={() => setMenuVisible(true)}
            testID="service-detail-header"
            title={service.name}
          />
        </View>
      ) : mode === "existing" ? (
        // Editing sheet: the canonical « Annuler » + title header, the ONE
        // Cancel of the sheet (back to the details, draft discarded).
        <View style={styles.headerZone}>
          <SheetEditingHeader
            cancelTestID="cancel-service-edit"
            onCancel={close}
            title="Modifier la prestation"
          />
        </View>
      ) : (
        // Creation sheet: the same canonical header, on the type chooser and
        // on the form that follows it. « Annuler » leaves the creation.
        <View style={styles.headerZone}>
          <SheetEditingHeader
            cancelTestID="cancel-service-creation"
            onCancel={close}
            title="Nouvelle prestation"
          />
        </View>
      )}

      {mode === "create" && !values ? (
        <ServiceKindPicker onSelect={chooseType} />
      ) : editing && values && validation ? (
        <ServiceForm
          attempted={attempted}
          expandedPhaseId={expandedPhaseId}
          validation={validation}
          values={values}
          onAddPhase={addPhase}
          onChangeName={(name) => updateField("name", name)}
          onChangePrice={(price) => updateField("price", price)}
          onChangeSimpleDuration={(duration) =>
            updateField("simpleDurationMinutes", duration)
          }
          onChangePhase={(phaseId, update) =>
            setValues((current) =>
              current ? updateServicePhase(current, phaseId, update) : current,
            )
          }
          onChangeRequiresStaff={(phaseId, requiresStaff) =>
            setValues((current) =>
              current
                ? setPhaseRequiresStaff(current, phaseId, requiresStaff)
                : current,
            )
          }
          onRemovePhase={removePhase}
          onReorderPhases={(fromIndex, toIndex) =>
            setValues((current) =>
              current
                ? reorderServicePhases(current, fromIndex, toIndex)
                : current,
            )
          }
          onToggleExpanded={setExpandedPhaseId}
        />
      ) : service ? (
        <ServiceReadView service={service} />
      ) : null}

      {values && editing && (
        <SheetActionBar>
          <AppButton
            accessibilityLabel={
              mode === "create"
                ? undefined
                : "Enregistrer les modifications de la prestation"
            }
            disabled={!validation?.valid}
            onPress={save}
            testID="save-service"
            title={mode === "create" ? "Ajouter la prestation" : "Enregistrer"}
          />
        </SheetActionBar>
      )}

      {mode === "existing" && !editing && service && (
        // Outside the scroll: always visible; SheetScreen clears the home indicator.
        <SheetActionBar testID="service-read-actions">
          <AppButton
            onPress={startEditing}
            testID="edit-service"
            title="Modifier la prestation"
          />
        </SheetActionBar>
      )}

      {mode === "existing" && service && (
        <DetailActionsSheet
          groups={serviceActionGroups(service.active)}
          onClose={() => setMenuVisible(false)}
          onDismissed={runSecondaryAction}
          onSelect={(action) => {
            setPendingAction(action);
            setMenuVisible(false);
          }}
          testID="service-actions-sheet"
          title={service.name}
          visible={menuVisible}
        />
      )}

      <ConfirmationDialog
        body="La prestation ne sera plus proposée lors de la création d’un rendez-vous."
        cancelLabel="Annuler"
        cancelTestID="cancel-service-deactivation"
        confirmLabel="Désactiver"
        confirmTestID="confirm-service-deactivation"
        eyebrow="PRESTATION"
        onCancel={() => setConfirmation(undefined)}
        onConfirm={confirmDeactivate}
        testID="service-deactivation-dialog"
        title="Désactiver cette prestation ?"
        tone="neutral"
        visible={confirmation === "deactivate"}
      />
      <ConfirmationDialog
        body="Elle sera supprimée du catalogue et ne pourra plus être ajoutée à de nouveaux rendez-vous. Les rendez-vous existants qui utilisent cette prestation resteront inchangés."
        cancelLabel="Retour"
        cancelTestID="cancel-service-deletion"
        confirmLabel="Supprimer"
        confirmTestID="confirm-service-deletion"
        eyebrow="SUPPRESSION"
        onCancel={() => setConfirmation(undefined)}
        onConfirm={confirmDelete}
        testID="service-deletion-dialog"
        title="Supprimer cette prestation ?"
        visible={confirmation === "delete"}
      />
    </SheetScreen>
  );
}

function ServiceKindPicker({
  onSelect,
}: {
  readonly onSelect: (type: ServiceType) => void;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.kindContent}
      style={styles.scroll}
    >
      <View style={styles.kindIntroBlock}>
        <AppText variant="sectionTitle" accessibilityRole="header">
          Choisir le type de prestation
        </AppText>
        <AppText variant="metadata" style={styles.kindIntro}>
          Sélectionnez la structure qui correspond le mieux au déroulé de votre
          prestation.
        </AppText>
      </View>
      {/* Structure icons (one duration / ordered phases) — never the family
          pictograms of the catalogue. */}
      <KindChoice
        description="Une seule durée, la professionnelle reste occupée."
        icon={{ ios: "clock", android: "schedule" }}
        onPress={() => onSelect("SERVICE")}
        type="SERVICE"
      />
      <KindChoice
        description="Plusieurs phases, avec ou sans temps de pose."
        icon={{ ios: "list.number", android: "format_list_numbered" }}
        onPress={() => onSelect("TECHNIQUE")}
        type="TECHNIQUE"
      />
    </ScrollView>
  );
}

/** The whole card is the choice; its colours are the category's. */
function KindChoice({
  type,
  description,
  icon,
  onPress,
}: {
  readonly type: ServiceType;
  readonly description: string;
  readonly icon: SymbolViewProps["name"];
  readonly onPress: () => void;
}) {
  const colors = serviceCategoryColors[type];
  const label = serviceCategoryLabels[type];
  // « Une seule durée, … » is spoken lower-cased after the label.
  const spokenDescription =
    description.charAt(0).toLowerCase() +
    description.slice(1).replace(/\.$/, "");

  return (
    <Pressable
      accessibilityLabel={`${label}, ${spokenDescription}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.kindChoice,
        { borderColor: colors.border },
        pressed && [styles.kindChoicePressed, { backgroundColor: colors.tint }],
      ]}
      testID={`choose-service-type-${type}`}
    >
      <View
        style={[styles.kindIcon, { backgroundColor: colors.tint }]}
        testID={`choose-service-type-${type}-icon`}
      >
        <SymbolView name={icon} size={22} tintColor={colors.accent} />
      </View>
      <View style={styles.kindCopy}>
        <AppText variant="rowTitle" style={styles.kindTitle}>
          {label}
        </AppText>
        <AppText variant="metadata" style={styles.kindDescription}>
          {description}
        </AppText>
      </View>
      <SymbolView
        name={{ ios: "chevron.right", android: "chevron_right" }}
        size={15}
        tintColor={semanticColors.foregroundMuted}
      />
    </Pressable>
  );
}

interface ServiceFormProps {
  readonly values: ServiceFormValues;
  readonly attempted: boolean;
  readonly validation: ReturnType<typeof validateServiceForm>;
  readonly expandedPhaseId: string | null;
  readonly onToggleExpanded: (phaseId: string | null) => void;
  readonly onChangeName: (name: string) => void;
  readonly onChangePrice: (price: string) => void;
  readonly onChangeSimpleDuration: (duration: string) => void;
  readonly onChangePhase: (
    phaseId: string,
    update: Partial<Omit<ServiceFormValues["phases"][number], "id">>,
  ) => void;
  readonly onChangeRequiresStaff: (
    phaseId: string,
    requiresStaff: boolean,
  ) => void;
  readonly onAddPhase: () => void;
  readonly onRemovePhase: (phaseId: string) => void;
  readonly onReorderPhases: (fromIndex: number, toIndex: number) => void;
}

function ServiceForm({
  values,
  attempted,
  validation,
  expandedPhaseId,
  onToggleExpanded,
  onChangeName,
  onChangePrice,
  onChangeSimpleDuration,
  onChangePhase,
  onChangeRequiresStaff,
  onAddPhase,
  onRemovePhase,
  onReorderPhases,
}: ServiceFormProps) {
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.formContent}
      style={styles.scroll}
    >
      <View style={styles.formSection} testID="service-form-information">
        {/* The type is chosen at creation and never edited: a read-only pill in
          the validated category colours, next to the section title. */}
        <SectionHeader title="Informations">
          <StatePill
            accessibilityLabel={`Catégorie, ${serviceCategoryLabels[values.type]}`}
            colors={{
              fill: serviceCategoryColors[values.type].tint,
              dot: serviceCategoryColors[values.type].accent,
              text: serviceCategoryColors[values.type].strong,
            }}
            label={serviceCategoryLabels[values.type]}
            testID="service-form-category-pill"
          />
        </SectionHeader>
        <TextField
          accessibilityLabel="Nom de la prestation"
          error={
            attempted && !validation.nameValid
              ? "Le nom est requis."
              : undefined
          }
          label="Nom"
          onChangeText={onChangeName}
          placeholder="Ex. Coupe"
          value={values.name}
        />
        <TextField
          accessibilityLabel="Prix de la prestation"
          error={
            attempted && !validation.priceValid
              ? "Indiquez un prix valide, positif ou nul."
              : undefined
          }
          keyboardType="decimal-pad"
          label="Prix"
          onChangeText={onChangePrice}
          placeholder="42,00"
          suffix="€"
          value={values.price}
        />

        {values.type === "SERVICE" && (
          <TextField
            accessibilityLabel="Durée de la prestation"
            error={
              attempted && !validation.simpleDurationValid
                ? "Indiquez une durée positive en minutes."
                : undefined
            }
            keyboardType="number-pad"
            label="Durée"
            onChangeText={onChangeSimpleDuration}
            placeholder="45"
            suffix="min"
            value={values.simpleDurationMinutes}
          />
        )}
      </View>

      {/* A Technique's timing — Temps de pose included — is its ordered
          phases; a Service has one duration and no pose. */}
      {values.type === "TECHNIQUE" && (
        <View style={styles.phasesSection}>
          <SectionHeader count={values.phases.length} title="Phases" />
          <SortablePhaseEditor
            attempted={attempted}
            expandedPhaseId={expandedPhaseId}
            onChangeDuration={(phaseId, durationMinutes) =>
              onChangePhase(phaseId, { durationMinutes })
            }
            onChangeName={(phaseId, name) => onChangePhase(phaseId, { name })}
            onChangeRequiresStaff={onChangeRequiresStaff}
            onRemove={onRemovePhase}
            onReorder={onReorderPhases}
            onToggleExpanded={onToggleExpanded}
            phases={values.phases}
            validation={validation}
          />
          <AppButton
            onPress={onAddPhase}
            title="Ajouter une phase"
            variant="secondary"
          />
          {attempted &&
            !validation.phasesValid &&
            values.phases.length === 0 && (
              <AppText variant="metadata" style={styles.formError}>
                Ajoutez au moins une phase.
              </AppText>
            )}
          {values.phases.length > 0 &&
            !validation.hasProcessingPhase &&
            validation.phaseValidities.every(
              (phase) => phase.nameValid && phase.durationValid,
            ) && (
              <AppText variant="metadata" style={styles.formError}>
                Une technique doit contenir au moins un temps de pose.
              </AppText>
            )}
        </View>
      )}
    </ScrollView>
  );
}

function ServiceReadView({ service }: { readonly service: Service }) {
  const duration = getServiceDurationMinutes(service);
  const processing = getServiceProcessingMinutes(service);
  const price = formatServicePrice(service.price);
  const category = serviceCategoryColors[service.type];
  const categoryLabel = serviceCategoryLabels[service.type];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.readContent}
      style={styles.scroll}
      testID="service-read-view"
    >
      {/* Identity: the decorative family pictogram, then price and pills. */}
      <View style={styles.identity} testID="service-identity">
        <PrestationIcon prestation={service} testID="service-family-icon" />
        <View style={styles.summary} testID="service-summary">
          <AppText
            accessibilityLabel={`Prix, ${price}`}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            selectable
            style={styles.priceValue}
            testID="service-price"
            variant="summaryValue"
          >
            {price}
          </AppText>
          <View style={styles.summaryPills}>
            <StatePill
              accessibilityLabel={
                service.active ? "Prestation active" : "Prestation inactive"
              }
              colors={
                service.active
                  ? statePillTones.positive
                  : statePillTones.neutral
              }
              label={service.active ? "Active" : "Inactive"}
              testID="service-status-pill"
            />
            {/* The category keeps its own validated colours, never the status ones. */}
            <StatePill
              accessibilityLabel={`Catégorie, ${categoryLabel}`}
              colors={{
                fill: category.tint,
                dot: category.accent,
                text: category.strong,
              }}
              label={categoryLabel}
              testID="service-category-pill"
            />
          </View>
        </View>
      </View>

      <View style={styles.readSection}>
        <SectionHeader title="Informations" />
        <GroupedSurface testID="service-information">
          <GroupedReadRow
            label="Durée"
            testID="service-duration"
            value={formatServiceDuration(duration)}
          />
          {processing > 0 && (
            <>
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow
                label="Temps de pose"
                testID="service-processing"
                value={formatServiceDuration(processing)}
              />
            </>
          )}
        </GroupedSurface>
      </View>

      {service.type === "TECHNIQUE" && (
        <View style={styles.readSection}>
          <SectionHeader count={service.phases.length} title="Phases" />
          <GroupedSurface testID="service-phases">
            {service.phases.map((phase, index) => (
              <View key={phase.id}>
                {index > 0 && (
                  <GroupedSeparator inset={PHASE_SEPARATOR_INSET} />
                )}
                <View style={styles.readPhase}>
                  <View
                    style={[
                      styles.readPhaseIndex,
                      !phase.requiresStaff && styles.readProcessingIndex,
                    ]}
                  >
                    <AppText
                      variant="chip"
                      style={
                        phase.requiresStaff
                          ? styles.activeLabel
                          : styles.processingLabel
                      }
                    >
                      {index + 1}
                    </AppText>
                  </View>
                  <View style={styles.readPhaseCopy}>
                    <AppText variant="control" numberOfLines={2}>
                      {phase.name}
                    </AppText>
                    <AppText
                      variant="metadata"
                      style={
                        phase.requiresStaff
                          ? styles.activeLabel
                          : styles.processingLabel
                      }
                    >
                      {phase.requiresStaff ? "Temps actif" : "Temps de pose"}
                    </AppText>
                  </View>
                  <AppText variant="control" style={styles.phaseDuration}>
                    {formatServiceDuration(phase.durationMinutes)}
                  </AppText>
                </View>
              </View>
            ))}
          </GroupedSurface>
        </View>
      )}
    </ScrollView>
  );
}

const PHASE_INDEX_SIZE = 28;
const PHASE_SEPARATOR_INSET = spacing.base + PHASE_INDEX_SIZE + spacing.md;

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  scroll: { flexShrink: 1 },
  kindContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.xl,
  },
  kindIntroBlock: { gap: spacing.xs, marginBottom: spacing.sm },
  kindIntro: { color: foregroundSoft },
  kindChoice: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: "continuous",
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.base,
  },
  kindChoicePressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  kindIcon: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.medium,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  kindCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  kindTitle: { color: semanticColors.foreground },
  kindDescription: { color: foregroundSoft, lineHeight: 18 },
  formContent: {
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  formSection: { gap: spacing.md },
  phasesSection: { gap: spacing.md },
  formError: { color: semanticColors.foregroundSoft },
  readContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  identity: { alignItems: "center", flexDirection: "row", gap: spacing.base },
  summary: { flex: 1, gap: spacing.sm, minWidth: 0 },
  priceValue: {
    color: semanticColors.foreground,
    fontVariant: ["tabular-nums"],
  },
  summaryPills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  readSection: { gap: spacing.sm },
  readPhase: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  readPhaseIndex: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: PHASE_INDEX_SIZE,
    justifyContent: "center",
    width: PHASE_INDEX_SIZE,
  },
  readProcessingIndex: { backgroundColor: semanticColors.surfacePeach },
  readPhaseCopy: { flex: 1, gap: 2, minWidth: 0 },
  activeLabel: { color: semanticColors.accent },
  processingLabel: { color: peach.peach700 },
  phaseDuration: { fontVariant: ["tabular-nums"] },
  notFound: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["3xl"],
  },
  notFoundText: { color: foregroundSoft, textAlign: "center" },
});
