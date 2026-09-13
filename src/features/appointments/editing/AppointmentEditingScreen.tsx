// Souris - Existing Appointment service editing screen
//
// ONE continuous editor: editable Date/Heure context, the retained
// AppointmentItem stack (snapshot hydration only), and the shared grouped
// catalog inline for ADDING new current Services. No secondary catalog mode.
//
// Existing AppointmentItems hydrate ONLY from their snapshots; the catalog
// grid uses a separate pending-add selection. Editing an existing
// Appointment never writes the catalog.
//
// Presented in the canonical Souris sheet shell; swipe-to-dismiss is off
// (route options). A dirty draft is guarded against « Annuler » and the
// hardware back by the shared Souris confirmation dialog.

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

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
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

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
import { ClientPickerSheet } from '@/features/clients/selection/ClientPickerSheet';
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
  const { activeServices } = useServiceCatalog();
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
  const [discardRequested, setDiscardRequested] = useState(false);
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
    setDiscardRequested(true);
  };

  usePreventRemove(isDirty && !isLeaving && !isTerminal, requestDiscard);

  useEffect(() => {
    if (isLeaving) {
      router.back();
    }
  }, [isLeaving, router]);

  if (!entry || !appointment || !initialStartAt || !draftStartAt || !initialClientId) {
    return (
      <SheetScreen fit="content">
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Rendez-vous introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous n&apos;est plus disponible.
          </AppText>
        </View>
      </SheetScreen>
    );
  }

  if (isTerminal) {
    return (
      <SheetScreen fit="content">
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Modification indisponible</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous a un statut final et ne peut plus être modifié.
          </AppText>
        </View>
      </SheetScreen>
    );
  }

  // Swipe-to-remove from the Prestations list: DRAFT state only. The
  // canonical Appointment (and SQLite) change solely through `save`.
  const removeDraft = (draftKey: string) => {
    if (!canRemoveAppointmentItem(drafts.length)) return;
    if (!drafts.some((draft) => getSelectedServiceDraftKey(draft) === draftKey)) return;
    haptics.destructive();
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
    try {
      updateAppointment({
        ...entry,
        appointment: {
          ...updatedAppointment,
          clientId: draftClientId ?? appointment.clientId,
          startAt: new Date(draftStartAt),
        },
      });
    } catch {
      alertPersistenceFailure();
      return;
    }
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
    <SheetScreen keyboardAvoiding testID="appointment-editing-sheet">
      <View style={styles.headerZone}>
        <SheetHeader
          action={{
            accessibilityLabel: 'Annuler les modifications',
            label: 'Annuler',
            onPress: cancel,
            testID: 'cancel-appointment-edit',
          }}
          eyebrow="RENDEZ-VOUS"
          title="Modifier le rendez-vous"
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

      <SheetActionBar direction="row">
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
      </SheetActionBar>

      <ClientPickerSheet
        selectedClientId={draftClientId}
        visible={clientPickerVisible}
        onClose={() => setClientPickerVisible(false)}
        onSelectClient={(clientId) => {
          setDraftClientId(clientId);
          setClientPickerVisible(false);
        }}
      />

      <ConfirmationDialog
        body="Les modifications non enregistrées seront perdues."
        cancelLabel="Continuer la modification"
        cancelTestID="keep-editing-appointment"
        confirmLabel="Abandonner"
        confirmTestID="discard-appointment-edit"
        eyebrow="MODIFICATIONS"
        onCancel={() => setDiscardRequested(false)}
        onConfirm={() => {
          setDiscardRequested(false);
          setIsLeaving(true);
        }}
        testID="discard-appointment-edit-dialog"
        title="Abandonner les modifications ?"
        visible={discardRequested}
      />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  editorContent: {
    gap: spacing.base,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  selectedSection: { gap: spacing.sm },
  catalogSection: { gap: spacing.sm },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
  notFound: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'] },
  notFoundText: { color: semanticColors.foregroundMuted, textAlign: 'center' },
});
