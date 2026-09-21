// Souris — Appointment Creation screen
//
// Three-step creation flow: Cliente → Prestations → Résumé.
// The draft (client, selected services, appointment-specific price and
// processing overrides) lives in this screen's state and survives every
// step transition. The Agenda startAt is shown as appointment context on
// every step and is never recalculated or replaced.
//
// Birthday: when the APPOINTMENT date (never today's date) is the birthday of
// the Client just chosen, the Cliente step says so at once — a compact
// reminder under the context row, plus one short confetti burst and one
// success haptic. The celebration belongs to the SELECTION EVENT (a tap on a
// different Client, or a Client created from the picker): a re-render or a
// step change never replays it, choosing her again after another Client does.
// The actionable reminder next to « Réduction » stays on the Résumé.
//
// Presented as a native form sheet in the canonical Souris shell
// (SheetScreen + SheetHeader + SheetActionBar). The route disables
// swipe-to-dismiss (`src/app/(app)/_layout.tsx`): scrolling the Client list
// never abandons the draft — leaving goes through the explicit « Annuler ».

import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import type { AppointmentDiscount, Service } from '@/domain/appointments';
import { getClientDisplayName, isClientBirthdayOnDate, type Client } from '@/domain/clients';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { BirthdayConfetti } from '@/features/clients/birthday/BirthdayConfetti';
import { BirthdayNotice } from '@/features/clients/birthday/BirthdayNotice';
import {
  SELECTION_BIRTHDAY_SUGGESTION,
  formatBirthdayMessage,
} from '@/features/clients/birthday/presentation';
import { isSameLocalDay, useToday } from '@/features/clients/birthday/use-today';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import { agenda, foregroundSoft, gutter, lavender, spacing } from '@/shared/ui/theme';

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
import {
  getStartHourRange,
  setStartTimeOfDay,
  stepStartAt,
  type StartTimeBounds,
  type StartTimeOfDay,
} from './draft-start';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';

import { createAppointmentId, createAppointmentItemId } from './runtime-ids';
import { getAppointmentCreationSummary } from './presentation';
import { formatSelectedServiceNames, formatSelectionCountLabel } from '../editor/presentation';
import { canNavigateTo, stepLabels, type CreationStep } from './steps';

interface AppointmentCreationScreenProps {
  readonly startAt: Date;
}

// Single-professional V1: the staff identifier stays a stable placeholder
// until staff members become a real concept.
const staffMemberId = 'staff-amelie';
/**
 * Valid manual start times begin at the operational Agenda day start and
 * stay on the selected local date: with 5-minute minutes the latest start is
 * 23:55. The normal 20:00 Agenda boundary is a display default, not a
 * scheduling limit — a late Appointment simply extends the visible day.
 */
const startTimeBounds: StartTimeBounds = {
  minMinutes: agenda.dayStartHour * 60,
  maxMinutes: 24 * 60 - 5,
};

const startHourRange = getStartHourRange(startTimeBounds);

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
  const [draftDiscount, setDraftDiscount] = useState<AppointmentDiscount>();
  const [draftStartAt, setDraftStartAt] = useState<Date>(() =>
    stepStartAt(new Date(startAt), 0, startTimeBounds),
  );
  // Incremented by each birthday selection: a new key restarts the burst.
  const [birthdayBurst, setBirthdayBurst] = useState<number>();
  const reducedMotion = useReducedMotion();
  const today = useToday();

  const selectedClient = activeClients.find((client) => client.id === selectedClientId);
  const selectedClientName = selectedClient
    ? getClientDisplayName(selectedClient)
    : undefined;
  // THE birthday truth of this draft, derived on every render: the chosen
  // Client against the APPOINTMENT date. Never stale, never today's date.
  const isBirthdayAppointment =
    selectedClient !== undefined && isClientBirthdayOnDate(selectedClient, draftStartAt);
  const birthdayMessage = selectedClient
    ? formatBirthdayMessage(
        selectedClient,
        isSameLocalDay(draftStartAt, today) ? 'TODAY' : 'THAT_DAY',
      )
    : '';

  const summaryItems: readonly BuildAppointmentItemInput[] = selectedDrafts.map(
    (draft) => ({ service: toServiceSnapshotSource(draft) }),
  );

  const summary =
    selectedDrafts.length > 0
      ? getAppointmentCreationSummary(draftStartAt, summaryItems, draftDiscount)
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

  const chooseDraftStartTime = (time: StartTimeOfDay) => {
    setDraftStartAt((current) => setStartTimeOfDay(current, time, startTimeBounds));
  };

  const create = () => {
    if (!selectedClient || selectedDrafts.length === 0 || !summary) return;

    const appointmentId = createAppointmentId();
    // The final draft is the immediate source for the Appointment snapshot.
    const appointment = buildAppointment({
      appointmentId,
      businessId: business.id,
      clientId: selectedClient.id,
      discount: draftDiscount,
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

  // The ONE way a Client gets chosen. A NEW choice of a Client whose birthday
  // is the Appointment date celebrates once: one success haptic (the row has
  // no selection haptic of its own, so nothing doubles) and, unless motion is
  // reduced, one burst. Re-tapping the chosen Client is not a new choice.
  const selectClient = (client: Client) => {
    if (client.id === selectedClientId) return;
    setSelectedClientId(client.id);
    if (!isClientBirthdayOnDate(client, draftStartAt)) {
      setBirthdayBurst(undefined);
      return;
    }
    haptics.success();
    if (!reducedMotion) setBirthdayBurst((current) => (current ?? 0) + 1);
  };

  const selectClientById = (clientId: string) => {
    const client = activeClients.find((candidate) => candidate.id === clientId);
    if (client) selectClient(client);
  };

  const endBirthdayBurst = useCallback(() => setBirthdayBurst(undefined), []);

  const handleClientCreated = (client: Client) => {
    selectClient(client);
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
          maxHour={startHourRange.maxHour}
          minHour={startHourRange.minHour}
          onStartAtChange={chooseDraftStartTime}
        />
      )}

      {step === 0 && isBirthdayAppointment && (
        <View style={styles.birthdayNotice}>
          <BirthdayNotice
            accessibilityLabel={`${birthdayMessage} ${SELECTION_BIRTHDAY_SUGGESTION}`}
            compact
            messages={[SELECTION_BIRTHDAY_SUGGESTION]}
            testID="client-selection-birthday-notice"
            title={birthdayMessage}
          />
        </View>
      )}

      {step === 0 && (
        <ClientPickerStep
          clients={visibleClients}
          query={clientQuery}
          selectedClientId={selectedClientId}
          onChangeQuery={setClientQuery}
          onAddClientPress={() => setAddClientVisible(true)}
          onSelectClient={selectClientById}
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
          // The Appointment DATE decides, never today's date: derived on every
          // render, so a changed Client or date can never leave a stale reminder.
          birthdayReminder={isBirthdayAppointment}
          discount={draftDiscount}
          onDiscountChange={setDraftDiscount}
          entries={selectedDrafts.map((draft) => ({ draft }))}
          expandedDraftId={expandedDraftId}
          startAt={draftStartAt}
          summary={summary}
          onEditClient={() => navigateToStep(0)}
          onEditServices={() => navigateToStep(1)}
          onReorder={reorderSelectedDrafts}
          maxHour={startHourRange.maxHour}
          minHour={startHourRange.minHour}
          onStartAtChange={chooseDraftStartTime}
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
          <View style={styles.selectionFooter}>
            <AppText variant="control" style={styles.selectionFooterCount} testID="selection-count">
              {formatSelectionCountLabel(selectedDrafts.length)}
            </AppText>
            {/* WHICH services, not only how many. Two lines at most, so a long
                selection never pushes the actions away; the count stays whole. */}
            {selectedDrafts.length > 0 && (
              <AppText
                accessibilityLabel={selectedDrafts.map((draft) => draft.serviceName).join(', ')}
                numberOfLines={2}
                style={styles.selectionFooterNames}
                testID="selection-names"
                variant="metadata"
              >
                {formatSelectedServiceNames(selectedDrafts)}
              </AppText>
            )}
          </View>
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

      {/* Same burst as the Client Profile; keyed so each selection restarts it. */}
      {birthdayBurst !== undefined && (
        <BirthdayConfetti key={birthdayBurst} onFinished={endBirthdayBurst} />
      )}

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
  birthdayNotice: { paddingHorizontal: horizontalGutter, paddingTop: spacing.sm },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  catalogScroll: { flex: 1 },
  catalogContent: {
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
  },
  selectionFooter: { gap: spacing.xs },
  selectionFooterNames: { color: foregroundSoft },
  selectionFooterCount: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
  },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
});
