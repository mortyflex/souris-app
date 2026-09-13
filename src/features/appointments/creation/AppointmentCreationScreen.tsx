// Souris — Appointment Creation screen
//
// Three-step creation flow: Cliente → Prestations → Résumé.
// The draft (client, selected services, appointment-specific price and
// processing overrides) lives in this screen's state and survives every
// step transition. The Agenda startAt is shown as appointment context on
// every step and is never recalculated or replaced.
//
// Presented as a native form sheet in the canonical Souris shell
// (SheetScreen + SheetHeader + SheetActionBar). The route disables
// swipe-to-dismiss (`src/app/(app)/_layout.tsx`): scrolling the Client list
// never abandons the draft — leaving goes through the explicit « Annuler ».

import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Service } from '@/domain/appointments';
import { getClientDisplayName, type Client } from '@/domain/clients';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import { agenda, gutter, lavender, spacing } from '@/shared/ui/theme';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';
import { AppointmentContextRow } from './components/AppointmentContextRow';
import { ClientPickerStep } from '@/features/clients/selection/ClientPickerStep';
import { CreationStepper } from './components/CreationStepper';
import { ServiceSelectionGrid } from '../editor/components/ServiceSelectionGrid';
import { SummaryStep } from './components/SummaryStep';
import {
  createSelectedServiceDraft,
  getSelectedServiceDraftKey,
  reorderDrafts,
  toServiceSnapshotSource,
  updateDraftPhaseDuration,
  updateDraftPrice,
  type SelectedServiceDraft,
} from './draft';
import { stepStartAt, type StartTimeBounds } from './draft-start';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';

import { createAppointmentId, createAppointmentItemId } from './runtime-ids';
import { getAppointmentCreationSummary } from './presentation';
import { formatSelectionCountLabel } from '../editor/presentation';
import { canNavigateTo, stepLabels, type CreationStep } from './steps';

interface AppointmentCreationScreenProps {
  readonly startAt: Date;
}

// Single-professional V1: the staff identifier stays a stable placeholder
// until staff members become a real concept.
const staffMemberId = 'staff-amelie';
/**
 * Valid manual start times begin at the operational Agenda day start and
 * stay on the selected local date: with ±5-minute steps the latest start is
 * 23:55. The normal 20:00 Agenda boundary is a display default, not a
 * scheduling limit — a late Appointment simply extends the visible day.
 */
const startTimeBounds: StartTimeBounds = {
  minMinutes: agenda.dayStartHour * 60,
  maxMinutes: 24 * 60 - 5,
};

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function AppointmentCreationScreen({ startAt }: AppointmentCreationScreenProps) {
  const router = useRouter();
  const business = useCurrentBusiness();
  const { addAppointment } = useAppointmentSession();
  const { activeClients } = useClientSession();
  const { activeServices } = useServiceCatalog();
  const [step, setStep] = useState<CreationStep>(0);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>();
  const [addClientVisible, setAddClientVisible] = useState(false);
  const [selectedDrafts, setSelectedDrafts] = useState<readonly SelectedServiceDraft[]>([]);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [draftStartAt, setDraftStartAt] = useState<Date>(() =>
    stepStartAt(new Date(startAt), 0, startTimeBounds),
  );

  const selectedClient = activeClients.find((client) => client.id === selectedClientId);
  const selectedClientName = selectedClient
    ? getClientDisplayName(selectedClient)
    : undefined;

  const summaryItems: readonly BuildAppointmentItemInput[] = selectedDrafts.map(
    (draft) => ({ service: toServiceSnapshotSource(draft) }),
  );

  const summary =
    selectedDrafts.length > 0
      ? getAppointmentCreationSummary(draftStartAt, summaryItems)
      : undefined;

  const canContinue =
    step === 0 ? selectedClient !== undefined : selectedDrafts.length > 0;

  const visibleClients = useMemo(
    () => prepareClientDirectory(activeClients, clientQuery),
    [activeClients, clientQuery],
  );

  const addService = (service: Service) => {
    if (selectedDrafts.some((draft) => draft.serviceId === service.id)) return;
    haptics.selection();
    setSelectedDrafts((current) => [...current, createSelectedServiceDraft(service)]);
  };

  const toggleService = (service: Service) => {
    const existing = selectedDrafts.find((draft) => draft.serviceId === service.id);
    if (existing) {
      removeDraft(getSelectedServiceDraftKey(existing));
      return;
    }
    addService(service);
  };

  const removeDraft = (draftKey: string) => {
    if (!selectedDrafts.some((draft) => getSelectedServiceDraftKey(draft) === draftKey)) return;
    haptics.selection();
    setSelectedDrafts((current) =>
      current.filter((draft) => getSelectedServiceDraftKey(draft) !== draftKey),
    );
    setExpandedDraftId((current) => (current === draftKey ? null : current));
  };

  const reorderSelectedDrafts = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSelectedDrafts((current) => reorderDrafts(current, fromIndex, toIndex));
    },
    [],
  );

  const updateDraft = (
    draftKey: string,
    updater: (draft: SelectedServiceDraft) => SelectedServiceDraft,
  ) => {
    setSelectedDrafts((current) =>
      current.map((draft) =>
        getSelectedServiceDraftKey(draft) === draftKey ? updater(draft) : draft,
      ),
    );
  };

  const navigateToStep = (target: number) => {
    if (canNavigateTo(step, target)) {
      // Re-entering Résumé starts with every card collapsed again.
      if (step === 2) setExpandedDraftId(null);
      setStep(target as CreationStep);
    }
  };

  const continueToNextStep = () => {
    if (!canContinue) return;
    setStep((current) => (current === 2 ? current : (current + 1) as CreationStep));
  };

  const stepDraftStartAt = (deltaMinutes: number) => {
    setDraftStartAt((current) => stepStartAt(current, deltaMinutes, startTimeBounds));
  };

  const create = () => {
    if (!selectedClient || selectedDrafts.length === 0 || !summary) return;

    const appointmentId = createAppointmentId();
    // The final draft is the immediate source for the Appointment snapshot.
    const appointment = buildAppointment({
      appointmentId,
      businessId: business.id,
      clientId: selectedClient.id,
      itemIds: selectedDrafts.map((_, index) => createAppointmentItemId(appointmentId, index)),
      items: summaryItems,
      staffMemberId,
      startAt: draftStartAt,
    });

    // Snapshot only: the Appointment (items + phases) is the whole write.
    // Official Service timing is edited from Prestations & tarifs alone.
    try {
      addAppointment({ appointment });
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.success();
    router.back();
  };

  const handleClientCreated = (client: Client) => {
    setSelectedClientId(client.id);
    setAddClientVisible(false);
  };

  return (
    <SheetScreen keyboardAvoiding testID="appointment-creation-sheet">
      <View style={styles.headerZone}>
        <SheetHeader
          action={{
            accessibilityLabel: 'Annuler la création',
            label: 'Annuler',
            onPress: () => router.back(),
          }}
          eyebrow="NOUVEAU RENDEZ-VOUS"
          title={stepLabels[step]}
        />
      </View>

      <CreationStepper step={step} onStepPress={(target) => navigateToStep(target)} />

      {step !== 2 && (
        <AppointmentContextRow
          startAt={draftStartAt}
          clientName={selectedClientName}
          onStartAtChange={stepDraftStartAt}
        />
      )}

      {step === 0 && (
        <ClientPickerStep
          clients={visibleClients}
          query={clientQuery}
          selectedClientId={selectedClientId}
          onChangeQuery={setClientQuery}
          onAddClientPress={() => setAddClientVisible(true)}
          onSelectClient={setSelectedClientId}
        />
      )}
      {step === 1 && (
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.catalogContent}
          style={styles.catalogScroll}
        >
          <ServiceSelectionGrid
            services={activeServices}
            selectedServiceIds={selectedDrafts.map((draft) => draft.serviceId)}
            onToggleService={toggleService}
          />
        </ScrollView>
      )}
      {step === 2 && selectedClient && summary && (
        <SummaryStep
          clientName={getClientDisplayName(selectedClient)}
          entries={selectedDrafts.map((draft) => ({ draft }))}
          expandedDraftId={expandedDraftId}
          startAt={draftStartAt}
          summary={summary}
          onEditClient={() => navigateToStep(0)}
          onEditServices={() => navigateToStep(1)}
          onReorder={reorderSelectedDrafts}
          onStartAtChange={stepDraftStartAt}
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
      )}

      <SheetActionBar testID="appointment-creation-actions">
        {step === 1 && (
          <AppText variant="control" style={styles.selectionFooterCount} testID="selection-count">
            {formatSelectionCountLabel(selectedDrafts.length)}
          </AppText>
        )}
        <View style={styles.footerButtons}>
          {step > 0 && (
            <AppButton
              accessibilityLabel="Étape précédente"
              onPress={() => navigateToStep(step - 1)}
              style={styles.secondaryButton}
              title="Précédent"
              variant="secondary"
            />
          )}
          <AppButton
            disabled={!canContinue}
            onPress={step === 2 ? create : continueToNextStep}
            style={styles.primaryButton}
            title={step === 2 ? 'Créer le rendez-vous' : 'Continuer'}
          />
        </View>
      </SheetActionBar>

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={handleClientCreated}
        visible={addClientVisible}
      />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  catalogScroll: { flex: 1 },
  catalogContent: {
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
  },
  selectionFooterCount: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
  },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
});
