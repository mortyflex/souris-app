// Souris — Appointment Creation screen
//
// Three-step creation flow: Cliente → Prestations → Résumé.
// The draft (client, selected services, appointment-specific price and
// processing overrides) lives in this screen's state and survives every
// step transition. The Agenda startAt is shown as appointment context on
// every step and is never recalculated or replaced.

import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { Service } from '@/domain/appointments';
import { getClientDisplayName, type Client } from '@/domain/clients';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  agenda,
  gutter,
  lavender,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';
import { AppointmentContextRow } from './components/AppointmentContextRow';
import { ClientPickerStep } from './components/ClientPickerStep';
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
import { createAppointmentId, createAppointmentItemId } from './runtime-ids';
import { collectCatalogServiceUpdates } from './commit-drafts';
import { getAppointmentCreationSummary } from './presentation';
import { formatSelectionCountLabel } from '../editor/presentation';
import { canNavigateTo, stepLabels, type CreationStep } from './steps';

interface AppointmentCreationScreenProps {
  readonly startAt: Date;
}

const businessId = 'fixture-business';
const staffMemberId = 'staff-amelie';
/**
 * Valid manual start times stay inside the operational Agenda day and
 * strictly before its end boundary. With ±5-minute steps the latest
 * visible start slot is 19:55.
 */
const startTimeBounds: StartTimeBounds = {
  minMinutes: agenda.dayStartHour * 60,
  maxMinutes: agenda.dayEndHour * 60 - 5,
};

export function AppointmentCreationScreen({ startAt }: AppointmentCreationScreenProps) {
  const router = useRouter();
  const { addAppointment } = useAppointmentSession();
  const { clients } = useClientSession();
  const { getServiceById, updateService, activeServices } = useServiceCatalog();
  const [step, setStep] = useState<CreationStep>(0);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>();
  const [addClientVisible, setAddClientVisible] = useState(false);
  const [selectedDrafts, setSelectedDrafts] = useState<readonly SelectedServiceDraft[]>([]);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [draftStartAt, setDraftStartAt] = useState<Date>(() =>
    stepStartAt(new Date(startAt), 0, startTimeBounds),
  );

  const selectedClient = clients.find((client) => client.id === selectedClientId);
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
    () => prepareClientDirectory(clients, clientQuery),
    [clients, clientQuery],
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
      businessId,
      clientId: selectedClient.id,
      itemIds: selectedDrafts.map((_, index) => createAppointmentItemId(appointmentId, index)),
      items: summaryItems,
      staffMemberId,
      startAt: draftStartAt,
    });

    // Adjusted defaults become future catalog values ONLY on success, as one
    // coherent user action with the Appointment creation above.
    for (const updated of collectCatalogServiceUpdates(selectedDrafts, getServiceById)) {
      updateService(updated);
    }

    addAppointment({ appointment });
    haptics.success();
    router.back();
  };

  const handleClientCreated = (client: Client) => {
    setSelectedClientId(client.id);
    setAddClientVisible(false);
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
              NOUVEAU RENDEZ-VOUS
            </AppText>
            <AppText variant="sheetTitle" accessibilityRole="header">
              {stepLabels[step]}
            </AppText>
          </View>
          <AppButton
            accessibilityLabel="Annuler la création"
            onPress={() => router.back()}
            style={styles.cancelButton}
            title="Annuler"
            variant="tertiary"
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

        <View style={styles.footer}>
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
        </View>

        <ClientFormSheet
          mode="create"
          onClose={() => setAddClientVisible(false)}
          onSubmitted={handleClientCreated}
          visible={addClientVisible}
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
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: semanticColors.accent },
  cancelButton: { paddingHorizontal: spacing.md },
  footer: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  catalogScroll: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  catalogContent: {
    paddingBottom: spacing.xl,
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
  },
  selectionFooterCount: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
  },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
});
