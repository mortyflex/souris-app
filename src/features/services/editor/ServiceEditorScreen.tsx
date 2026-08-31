import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import type { Service, ServiceType } from '@/domain/appointments';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';
import {
  formatServiceDuration,
  formatServicePrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '@/features/services/presentation';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  peach,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

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
} from './service-form';
import { createServiceId, createServicePhaseId } from './runtime-ids';
import { ServiceTextField } from './components/ServiceTextField';
import { SortablePhaseEditor } from './components/SortablePhaseEditor';

export type ServiceEditorMode = 'create' | 'existing';

interface ServiceEditorScreenProps {
  readonly mode: ServiceEditorMode;
  readonly serviceId?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ServiceEditorScreen({ mode, serviceId }: ServiceEditorScreenProps) {
  const router = useRouter();
  const {
    addService,
    deleteService,
    getServiceById,
    setServiceActive,
    updateService,
  } = useServiceCatalog();
  const service = getServiceById(serviceId);
  const [runtimeServiceId] = useState(() =>
    mode === 'create' ? createServiceId() : serviceId ?? 'missing-service',
  );
  const [values, setValues] = useState<ServiceFormValues | null>(() =>
    mode === 'existing' && service ? toServiceFormValues(service) : null,
  );
  const [editing, setEditing] = useState(mode === 'create');
  const [attempted, setAttempted] = useState(false);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);

  if (mode === 'existing' && !service) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Prestation introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Cette prestation n&apos;est plus disponible.
          </AppText>
          <AppButton onPress={() => router.back()} title="Fermer" variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const validation = values ? validateServiceForm(values) : undefined;
  const title = mode === 'create' ? 'Ajouter une prestation' : service?.name ?? '';
  const closeLabel = mode === 'create' || editing ? 'Annuler' : 'Fermer';

  const close = () => {
    if (mode === 'existing' && editing && service) {
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
    setExpandedPhaseId(type === 'TECHNIQUE' ? firstPhaseId : null);
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
      businessId: service?.businessId ?? DEVELOPMENT_BUSINESS_ID,
      active: service?.active ?? true,
      values,
    });

    if (mode === 'create') {
      addService(nextService);
      haptics.success();
      router.back();
      return;
    }

    updateService(nextService);
    setValues(toServiceFormValues(nextService));
    setAttempted(false);
    setEditing(false);
    haptics.success();
  };

  const changeActiveState = () => {
    if (!service) return;
    const commit = (active: boolean) => {
      setServiceActive(service.id, active);
      haptics.selection();
      router.back();
    };

    if (!service.active) {
      commit(true);
      return;
    }

    Alert.alert(
      'Désactiver cette prestation ?',
      'La prestation ne sera plus proposée lors de la création d’un rendez-vous.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Désactiver', onPress: () => commit(false) },
      ],
    );
  };

  const requestDelete = () => {
    if (!service) return;

    Alert.alert(
      'Supprimer définitivement cette prestation ?',
      'Elle sera supprimée du catalogue et ne pourra plus être ajoutée à de nouveaux rendez-vous.\n\nLes rendez-vous existants qui utilisent cette prestation resteront inchangés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: () => {
            deleteService(service.id);
            haptics.warning();
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="eyebrow" style={styles.eyebrow}>
              {mode === 'create' ? 'NOUVELLE PRESTATION' : 'PRESTATION'}
            </AppText>
            <AppText variant="sheetTitle" accessibilityRole="header" numberOfLines={1}>
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

        {mode === 'create' && !values ? (
          <ServiceKindPicker onSelect={chooseType} />
        ) : editing && values && validation ? (
          <ServiceForm
            attempted={attempted}
            expandedPhaseId={expandedPhaseId}
            validation={validation}
            values={values}
            onAddPhase={addPhase}
            onChangeName={(name) => updateField('name', name)}
            onChangePrice={(price) => updateField('price', price)}
            onChangeSimpleDuration={(duration) =>
              updateField('simpleDurationMinutes', duration)
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
          <View style={styles.footer}>
            {mode === 'existing' && (
              <AppButton
                onPress={close}
                style={styles.secondaryButton}
                title="Annuler"
                variant="secondary"
              />
            )}
            <AppButton
              disabled={!validation?.valid}
              onPress={save}
              style={styles.primaryButton}
              testID="save-service"
              title={
                mode === 'create'
                  ? 'Ajouter la prestation'
                  : 'Enregistrer les modifications'
              }
            />
          </View>
        )}

        {mode === 'existing' && !editing && service && (
          <View style={styles.readFooterContainer}>
            <View style={[styles.footer, styles.readFooterRow]}>
              <AppButton
                onPress={changeActiveState}
                style={styles.secondaryButton}
                title={service.active ? 'Désactiver' : 'Réactiver'}
                variant="secondary"
              />
              <AppButton
                onPress={() => {
                  setValues(toServiceFormValues(service));
                  setAttempted(false);
                  setExpandedPhaseId(null);
                  setEditing(true);
                }}
                style={styles.primaryButton}
                testID="edit-service"
                title="Modifier"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Supprimer définitivement cette prestation"
              onPress={requestDelete}
              style={({ pressed }) => [
                styles.deleteAction,
                pressed && styles.deleteActionPressed,
              ]}
            >
              <AppText variant="control" style={styles.deleteText}>
                Supprimer définitivement
              </AppText>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    >
      <AppText variant="sectionTitle">Type de prestation</AppText>
      <AppText variant="metadata" style={styles.kindIntro}>
        Choisissez la structure qui correspond au déroulé réel.
      </AppText>
      <KindChoice
        description="Une seule durée, la professionnelle reste occupée."
        icon={{ ios: 'clock', android: 'schedule' }}
        label="Prestation simple"
        onPress={() => onSelect('SERVICE')}
      />
      <KindChoice
        description="Plusieurs phases, avec ou sans temps de pose."
        icon={{ ios: 'list.number', android: 'format_list_numbered' }}
        label="Prestation technique"
        onPress={() => onSelect('TECHNIQUE')}
      />
    </ScrollView>
  );
}

function KindChoice({
  label,
  description,
  icon,
  onPress,
}: {
  readonly label: string;
  readonly description: string;
  readonly icon: SymbolViewProps['name'];
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.kindChoice, pressed && styles.kindChoicePressed]}
    >
      <View style={styles.kindIcon}>
        <SymbolView name={icon} size={20} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.kindCopy}>
        <AppText variant="rowTitle">{label}</AppText>
        <AppText variant="metadata" style={styles.kindDescription}>
          {description}
        </AppText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
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
    update: Partial<Omit<ServiceFormValues['phases'][number], 'id'>>,
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
    >
      <View style={styles.kindLabel}>
        <AppText variant="metadata" style={styles.kindLabelText}>
          {values.type === 'SERVICE' ? 'Prestation simple' : 'Prestation technique'}
        </AppText>
      </View>
      <ServiceTextField
        accessibilityLabel="Nom de la prestation"
        autoFocus
        error={attempted && !validation.nameValid ? 'Le nom est requis.' : undefined}
        label="Nom"
        onChangeText={onChangeName}
        placeholder="Ex. Coupe"
        value={values.name}
      />
      <ServiceTextField
        accessibilityLabel="Prix de la prestation"
        error={
          attempted && !validation.priceValid
            ? 'Indiquez un prix valide, positif ou nul.'
            : undefined
        }
        keyboardType="decimal-pad"
        label="Prix"
        onChangeText={onChangePrice}
        placeholder="42,00"
        suffix="€"
        value={values.price}
      />

      {values.type === 'SERVICE' ? (
        <ServiceTextField
          accessibilityLabel="Durée de la prestation"
          error={
            attempted && !validation.simpleDurationValid
              ? 'Indiquez une durée positive en minutes.'
              : undefined
          }
          keyboardType="number-pad"
          label="Durée"
          onChangeText={onChangeSimpleDuration}
          placeholder="45"
          suffix="min"
          value={values.simpleDurationMinutes}
        />
      ) : (
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
          {attempted && !validation.phasesValid && values.phases.length === 0 && (
            <AppText variant="metadata" style={styles.formError}>
              Ajoutez au moins une phase.
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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.readContent}
    >
      <View style={styles.statusLine}>
        <View style={[styles.statusDot, !service.active && styles.inactiveDot]} />
        <AppText variant="metadata" style={styles.statusText}>
          {service.active ? 'Active' : 'Inactive'}
        </AppText>
      </View>
      <View style={styles.summarySurface}>
        <ReadMetric label="Prix" value={formatServicePrice(service.price)} />
        <ReadMetric label="Durée" value={formatServiceDuration(duration)} />
        {processing > 0 && (
          <ReadMetric
            label="Temps de pose"
            processing
            value={formatServiceDuration(processing)}
          />
        )}
      </View>

      {service.type === 'TECHNIQUE' && (
        <View style={styles.readPhases}>
          <SectionHeader count={service.phases.length} title="Phases" />
          {service.phases.map((phase, index) => (
            <View
              key={phase.id}
              style={[
                styles.readPhase,
                phase.requiresStaff ? styles.readActivePhase : styles.readProcessingPhase,
              ]}
            >
              <View style={styles.readPhaseIndex}>
                <AppText variant="chip">{index + 1}</AppText>
              </View>
              <View style={styles.readPhaseCopy}>
                <AppText variant="control">{phase.name}</AppText>
                {phase.requiresStaff && (
                  <AppText variant="metadata" style={styles.activeLabel}>
                    Temps actif
                  </AppText>
                )}
              </View>
              <AppText variant="control" style={styles.phaseDuration}>
                {formatServiceDuration(phase.durationMinutes)}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ReadMetric({
  label,
  value,
  processing = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly processing?: boolean;
}) {
  return (
    <View style={[styles.readMetric, processing && styles.processingMetric]}>
      <AppText variant="summaryValue" style={processing && styles.processingLabel}>
        {value}
      </AppText>
      <AppText variant="metadata" style={processing && styles.processingLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  keyboardContainer: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  eyebrow: { color: semanticColors.accent },
  closeButton: { paddingHorizontal: spacing.md },
  kindContent: {
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.xl,
  },
  kindIntro: { color: foregroundSoft, marginBottom: spacing.sm },
  kindChoice: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.base,
  },
  kindChoicePressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  kindIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  kindCopy: { flex: 1, gap: spacing.xs },
  kindDescription: { color: foregroundSoft, lineHeight: 18 },
  formContent: {
    gap: spacing.base,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  kindLabel: {
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  kindLabelText: { color: semanticColors.accent },
  phasesSection: { gap: spacing.md, paddingTop: spacing.sm },
  formError: { color: semanticColors.foregroundSoft },
  readContent: {
    gap: spacing.xl,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  statusLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  statusDot: {
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  inactiveDot: { backgroundColor: semanticColors.foregroundMuted },
  statusText: { color: semanticColors.foregroundSoft },
  summarySurface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  readMetric: { flex: 1, gap: 2 },
  processingMetric: {
    backgroundColor: semanticColors.surfacePeachStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    padding: spacing.sm,
  },
  readPhases: { gap: spacing.sm },
  readPhase: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    padding: spacing.md,
  },
  readActivePhase: { backgroundColor: semanticColors.surfaceLavender },
  readProcessingPhase: { backgroundColor: semanticColors.surfacePeach },
  readPhaseIndex: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  readPhaseCopy: { flex: 1, gap: 2, minWidth: 0 },
  activeLabel: { color: semanticColors.accent },
  processingLabel: { color: peach.peach700 },
  phaseDuration: { fontVariant: ['tabular-nums'] },
  footer: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
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
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingBottom: 0,
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.base,
  },
  deleteActionPressed: {
    backgroundColor: semanticColors.surfaceRose,
    borderRadius: radii.small,
  },
  deleteText: { color: rose.rose600 },
  notFound: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  notFoundText: { color: foregroundSoft, textAlign: 'center' },
});
