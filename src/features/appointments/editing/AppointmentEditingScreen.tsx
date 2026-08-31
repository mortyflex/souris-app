// Souris - Existing Appointment service editing screen
//
// ONE continuous editor: editable Date/Heure context, the retained
// AppointmentItem stack (snapshot hydration only), and the shared grouped
// catalog inline for ADDING new current Services. No secondary catalog mode.
//
// Existing AppointmentItems hydrate ONLY from their snapshots; the catalog
// grid uses a separate pending-add selection. Editing an existing
// Appointment never writes the catalog.

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  canRemoveAppointmentItem,
  updateAppointmentFromDrafts,
  type Service,
} from '@/domain/appointments';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { isTerminalAppointmentStatus } from '@/features/appointments/presentation';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  gutter,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { createNewAppointmentItemId } from '../creation/runtime-ids';
import { ServiceSelectionGrid } from '../editor/components/ServiceSelectionGrid';
import { SortableDraftList } from '../editor/components/SortableDraftList';
import {
  areDraftsEqual,
  createSelectedServiceDraft,
  getSelectedServiceDraftKey,
  hydrateAppointmentDrafts,
  reorderDrafts,
  toAppointmentItemEditDraft,
  updateDraftPhaseDuration,
  updateDraftPrice,
  type SelectedServiceDraft,
} from '../editor/draft';
import { ClientPickerSheet } from './components/ClientPickerSheet';
import { EditableAppointmentContext } from './components/EditableAppointmentContext';
import { isSameStartAt } from './start-at';

interface AppointmentEditingScreenProps {
  readonly appointmentId?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function AppointmentEditingScreen({ appointmentId }: AppointmentEditingScreenProps) {
  const router = useRouter();
  const { getAppointmentById, updateAppointment } = useAppointmentSession();
  const { getClientById } = useClientSession();
  const { getServiceById, activeServices } = useServiceCatalog();
  const entry = getAppointmentById(appointmentId);
  const appointment = entry?.appointment;
  const [initialDrafts] = useState<readonly SelectedServiceDraft[]>(() =>
    appointment ? hydrateAppointmentDrafts(appointment) : [],
  );
  const [initialStartAt] = useState<Date | undefined>(() =>
    appointment ? new Date(appointment.startAt) : undefined,
  );
  const [initialClientId] = useState<string | undefined>(() => appointment?.clientId);
  const [drafts, setDrafts] = useState<readonly SelectedServiceDraft[]>(initialDrafts);
  const [draftStartAt, setDraftStartAt] = useState<Date | undefined>(initialStartAt);
  const [draftClientId, setDraftClientId] = useState<string | undefined>(initialClientId);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const isDirty =
    !areDraftsEqual(drafts, initialDrafts) ||
    (draftStartAt !== undefined &&
      initialStartAt !== undefined &&
      !isSameStartAt(draftStartAt, initialStartAt)) ||
    draftClientId !== initialClientId;
  const isTerminal = appointment ? isTerminalAppointmentStatus(appointment.status) : false;
  const clientName = getResolvedClientDisplayName(getClientById(draftClientId));

  const requestDiscard = () => {
    Alert.alert(
      'Abandonner les modifications ?',
      'Les modifications non enregistrées seront perdues.',
      [
        { text: 'Continuer la modification', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: () => setIsLeaving(true) },
      ],
    );
  };

  usePreventRemove(isDirty && !isLeaving && !isTerminal, requestDiscard);

  useEffect(() => {
    if (isLeaving) {
      router.back();
    }
  }, [isLeaving, router]);

  if (!entry || !appointment || !initialStartAt || !draftStartAt || !initialClientId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Rendez-vous introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous n&apos;est plus disponible.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (isTerminal) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Modification indisponible</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous a un statut final et ne peut plus être modifié.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const removeDraft = (draftKey: string) => {
    if (!canRemoveAppointmentItem(drafts.length)) return;
    if (!drafts.some((draft) => getSelectedServiceDraftKey(draft) === draftKey)) return;
    haptics.selection();
    setDrafts((current) =>
      current.filter((draft) => getSelectedServiceDraftKey(draft) !== draftKey),
    );
    setExpandedDraftId((current) => (current === draftKey ? null : current));
  };

  const reorderSelectedDrafts = (fromIndex: number, toIndex: number) => {
    setDrafts((current) => reorderDrafts(current, fromIndex, toIndex));
  };

  const updateDraft = (
    draftKey: string,
    updater: (draft: SelectedServiceDraft) => SelectedServiceDraft,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        getSelectedServiceDraftKey(draft) === draftKey ? updater(draft) : draft,
      ),
    );
  };

  const addServiceImmediately = (service: Service) => {
    // No duplicate copies of a Service already present in the draft.
    if (drafts.some((draft) => draft.serviceId === service.id)) return;
    haptics.selection();
    setDrafts((current) => [
      ...current,
      {
        ...createSelectedServiceDraft(service),
        appointmentItemId: createNewAppointmentItemId(appointment.id),
        order: current.length,
      },
    ]);
  };

  const save = () => {
    if (!isDirty || isTerminal) return;

    const updatedAppointment = updateAppointmentFromDrafts(
      appointment,
      drafts.map((draft, index) => toAppointmentItemEditDraft(draft, index)),
    );
    updateAppointment({
      ...entry,
      appointment: {
        ...updatedAppointment,
        clientId: draftClientId ?? appointment.clientId,
        startAt: new Date(draftStartAt),
      },
    });
    haptics.success();
    setIsLeaving(true);
  };

  const cancel = () => {
    if (isDirty) {
      requestDiscard();
      return;
    }
    setIsLeaving(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>
              MODIFIER LE RENDEZ-VOUS
            </AppText>
          </View>
          <AppButton
            accessibilityLabel="Annuler les modifications"
            onPress={cancel}
            style={styles.cancelButton}
            testID="cancel-appointment-edit"
            title="Annuler"
            variant="tertiary"
          />
        </View>

        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.editorContent, { paddingHorizontal: horizontalGutter }]}
        >
          <EditableAppointmentContext
            clientName={clientName}
            startAt={draftStartAt}
            onEditClient={() => setClientPickerVisible(true)}
            onStartAtChange={setDraftStartAt}
          />

          <View style={styles.selectedSection}>
            <SectionHeader count={drafts.length} title="Prestations" />
            <SortableDraftList
              canRemove={drafts.length > 1}
              entries={drafts.map((draft) => ({ draft }))}
              expandedDraftId={expandedDraftId}
              onRemove={removeDraft}
              onReorder={reorderSelectedDrafts}
              onToggleExpanded={(draftKey) =>
                setExpandedDraftId((current) => (current === draftKey ? null : draftKey))
              }
              onUpdatePhaseDuration={(draftKey, phaseId, durationMinutes) =>
                updateDraft(draftKey, (draft) =>
                  updateDraftPhaseDuration(draft, phaseId, durationMinutes),
                )
              }
              onUpdatePrice={(draftKey, price) =>
                updateDraft(draftKey, (draft) => updateDraftPrice(draft, price))
              }
            />
          </View>

          <View style={styles.catalogSection}>
            <ServiceSelectionGrid
              services={activeServices}
              selectedServiceIds={drafts.map((draft) => draft.serviceId)}
              onToggleService={addServiceImmediately}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <AppButton
            onPress={cancel}
            style={styles.secondaryButton}
            title="Annuler"
            variant="secondary"
          />
          <AppButton
            disabled={!isDirty}
            onPress={save}
            style={styles.primaryButton}
            testID="save-appointment-edit"
            title="Enregistrer les modifications"
          />
        </View>

        <ClientPickerSheet
          selectedClientId={draftClientId}
          visible={clientPickerVisible}
          onClose={() => setClientPickerVisible(false)}
          onSelectClient={(clientId) => {
            setDraftClientId(clientId);
            setClientPickerVisible(false);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  keyboardContainer: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: semanticColors.accent },
  cancelButton: { paddingHorizontal: spacing.md },
  editorContent: {
    gap: spacing.base,
    paddingBottom: spacing.xl,
    paddingTop: spacing.base,
  },
  selectedSection: { gap: spacing.sm },
  catalogSection: { gap: spacing.sm },
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
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: semanticColors.foregroundMuted, marginTop: spacing.sm, textAlign: 'center' },
});
