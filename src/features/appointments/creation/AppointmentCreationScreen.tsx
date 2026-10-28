// BeautIzzy — Appointment Creation screen
//
// Three-step creation flow: Cliente → Prestations → Résumé.
// The draft (client, selected services, appointment-specific price and
// processing overrides) lives in this screen's state and survives every
// step transition. The Agenda startAt is shown as appointment context on
// every step and is never recalculated or replaced: on Cliente and
// Prestations as the read-only Date + editable Heure group (the Client is
// not repeated — it was chosen on the previous step). Prestations uses the
// shared card catalogue of « Modifier le rendez-vous »: a tap toggles.
//
// Birthday: when the APPOINTMENT date (never today's date) is the birthday of
// the Client just chosen, the Cliente step says so at once — a compact
// reminder under the Date / Heure group, plus one short confetti burst and one
// success haptic. The celebration belongs to the SELECTION EVENT (a tap on a
// different Client, or a Client created from the picker): a re-render or a
// step change never replays it, choosing her again after another Client does.
// The actionable reminder next to « Réduction » stays on the Résumé.
//
// No-shows: choosing a Client who has missed Appointments shows a compact,
// non-blocking warning in the FIXED FOOTER — above « Continuer » on the Client
// step (visible whatever the list scrolled to, the chosen row may be far
// down) and again above « Créer le rendez-vous » on the Résumé, the two
// decision points; never on Prestations. « Dernier rendez-vous non honoré »
// when the latest known outcome is a NO_SHOW, « Historique d'absences »
// otherwise. Derived ONCE per render from the Appointment session (the same
// data as the profile's « Absences ») and the selected Client: a changed or
// cleared selection updates or removes it at once, on every step. It suggests
// a deposit in words only — never a button, never a prefilled amount: the
// « Acompte » row of the Résumé is where the professional decides.
//
// Deposit (« Ajouter un acompte reçu »): the Résumé offers ONE optional row to
// record money ALREADY received for the new Appointment. The draft (id,
// amount as typed, method) lives here with the rest of the draft and survives
// every step transition; its validity is derived on every render from the
// current services total, so a changed price or discount re-validates it at
// once and an entry that no longer fits holds « Créer le rendez-vous ». It is
// saved with the Appointment in ONE transaction (`addAppointment(entry,
// deposit)`): never an Appointment without its deposit, never a deposit
// twice. The row is offered only while the new Appointment will be
// financially open — an Appointment of a previous day is finalized on save
// and receives no deposit (docs/domain/APPOINTMENTS.md §25d).
//
// Client Profile entry: `initialClientId` opens the SAME flow on the Cliente
// step with that Client already selected (the Agenda entries pass none).
// Nothing is created until « Créer le rendez-vous » on the Résumé.
//
// Type choice: the sheet opens on « Cliente » — the three-step flow above,
// unchanged. « Personnel » replaces the WHOLE flow by ONE direct form that
// blocks the slot as unavailable (a Calendar Block: no client, no service, no
// price — docs/domain/CALENDAR_BLOCKS.md). The two drafts never meet: the
// Personal form is mounted only in its mode, receives nothing from the client
// draft but the Agenda start time, and writes through its own session. A
// client Appointment that would run into a Calendar Block of the same staff
// member is explained inline on the Résumé and cannot be created.
//
// Presented as a native form sheet in the canonical BeautIzzy shell
// (SheetScreen + SheetActionBar) under the editing header of « Modifier le
// rendez-vous ». The route disables
// swipe-to-dismiss (`src/app/(app)/_layout.tsx`): scrolling the Client list
// never abandons the draft — leaving goes through the explicit « Annuler ».

import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import type { AppointmentDiscount, Service } from '@/domain/appointments';
import { findAppointmentCalendarBlockConflict } from '@/domain/calendar-blocks';
import { isUsableCommunicationEmail } from '@/domain/communications';
import { getClientDisplayName, isClientBirthdayOnDate, type Client } from '@/domain/clients';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { createInitialBlockTimes } from '@/features/calendar-blocks/editor/block-times';
import {
  CalendarBlockForm,
  type CalendarBlockFormValues,
} from '@/features/calendar-blocks/editor/CalendarBlockForm';
import { ScheduleConflictNotice } from '@/features/calendar-blocks/editor/ScheduleConflictNotice';
import {
  CALENDAR_BLOCK_TITLE,
  describeCalendarBlockInTheWay,
} from '@/features/calendar-blocks/presentation';
import { createCalendarBlockId } from '@/features/calendar-blocks/runtime-ids';
import { useCalendarBlockSession } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useOptionalCommunicationPreferences } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { BirthdayConfetti } from '@/features/clients/birthday/BirthdayConfetti';
import { BirthdayNotice } from '@/features/clients/birthday/BirthdayNotice';
import {
  SELECTION_BIRTHDAY_SUGGESTION,
  formatBirthdayMessage,
} from '@/features/clients/birthday/presentation';
import { isSameLocalDay, useToday } from '@/features/clients/birthday/use-today';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { getClientAttendanceHistory } from '@/features/clients/no-shows/attendance';
import { NoShowWarningNotice } from '@/features/clients/no-shows/NoShowWarningNotice';
import { getClientNoShowWarning } from '@/features/clients/no-shows/presentation';
import { prepareClientDirectory } from '@/features/clients/directory/sort-clients';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import {
  agenda,
  foregroundSoft,
  gutter,
  lavender,
  spacing,
} from '@/shared/ui/theme';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';
import {
  canOfferCreationDeposit,
  deriveCreationDepositState,
  type CreationDepositDraft,
} from './deposit-draft';
import { AppointmentScheduleSection } from './components/AppointmentScheduleSection';
import { ClientPickerStep } from '@/features/clients/selection/ClientPickerStep';
import { CreationStepper } from './components/CreationStepper';
import { ServiceCatalogPicker } from '../editor/components/ServiceCatalogPicker';
import { useCatalogueView } from '@/features/services/use-catalogue-view';
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
import { canNavigateTo, type CreationStep } from './steps';

interface AppointmentCreationScreenProps {
  readonly startAt: Date;
  /**
   * Client the draft starts with (Client Profile): selected on the Cliente
   * step, exactly as if chosen there. Unknown or archived ids fall back to none.
   */
  readonly initialClientId?: string;
}

/** What the sheet creates: a client Appointment, or personal unavailability. */
type CreationMode = 'client' | 'personal';

const MODE_OPTIONS: readonly SegmentedControlOption<CreationMode>[] = [
  { value: 'client', label: 'Client', accessibilityLabel: 'Rendez-vous client' },
  { value: 'personal', label: 'Personnel', accessibilityLabel: 'Rendez-vous personnel' },
];

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

export function AppointmentCreationScreen({
  startAt,
  initialClientId,
}: AppointmentCreationScreenProps) {
  const catalogueView = useCatalogueView();
  const router = useRouter();
  const business = useCurrentBusiness();
  const { addAppointment, appointments } = useAppointmentSession();
  const { addCalendarBlock, calendarBlocks } = useCalendarBlockSession();
  const [mode, setMode] = useState<CreationMode>('client');
  const { activeClients } = useClientSession();
  const { activeServices } = useServiceCatalog();
  const [step, setStep] = useState<CreationStep>(0);
  const [clientQuery, setClientQuery] = useState('');
  // A preselection is not a selection EVENT: no celebration burst, but the
  // birthday reminder below still derives from it like any chosen Client.
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(() =>
    activeClients.some((client) => client.id === initialClientId) ? initialClientId : undefined,
  );
  const [addClientVisible, setAddClientVisible] = useState(false);
  const [selectedDrafts, setSelectedDrafts] = useState<readonly SelectedServiceDraft[]>([]);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [draftDiscount, setDraftDiscount] = useState<AppointmentDiscount>();
  // The deposit already received, if the professional records one: id, amount
  // as typed, method. Inactive by default; validated on every render below.
  const [depositDraft, setDepositDraft] = useState<CreationDepositDraft>();
  // ONE creation per sheet: set when « Créer le rendez-vous » starts writing,
  // cleared only when the write failed (nothing was saved, she may retry). A
  // second tap in the same frame can never create twice.
  const creating = useRef(false);
  // Per-appointment client reminder (Lot B). ON by default; only shown — and
  // only stored — while the GLOBAL preference is enabled (fail-safe reading).
  const remindersGloballyEnabled =
    useOptionalCommunicationPreferences()?.emailRemindersEnabled ?? false;
  const [draftReminderEnabled, setDraftReminderEnabled] = useState(true);
  const [editClientEmailVisible, setEditClientEmailVisible] = useState(false);
  const [draftStartAt, setDraftStartAt] = useState<Date>(() =>
    stepStartAt(new Date(startAt), 0, startTimeBounds),
  );
  // Incremented by each birthday selection: a new key restarts the burst.
  const [birthdayBurst, setBirthdayBurst] = useState<number>();
  const reducedMotion = useReducedMotion();
  const today = useToday();

  const selectedClient = activeClients.find((client) => client.id === selectedClientId);
  // Replaces the « RENDEZ-VOUS » heading on Cliente and Prestations: driven by
  // the selection itself, never by what the search currently lists.
  const selectedClientName = selectedClient ? getClientDisplayName(selectedClient) : undefined;
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

  // THE no-show truth of this draft: the chosen Client against the whole
  // Appointment session. Recomputed only when either changes; a Client with
  // no no-show yields nothing, so the step looks exactly as before.
  const noShowWarning = useMemo(
    () =>
      selectedClientId === undefined
        ? undefined
        : getClientNoShowWarning(
            getClientAttendanceHistory(
              appointments.map(({ appointment }) => appointment),
              selectedClientId,
              new Date(),
            ),
          ),
    [appointments, selectedClientId],
  );

  const summaryItems: readonly BuildAppointmentItemInput[] = selectedDrafts.map(
    (draft) => ({ service: toServiceSnapshotSource(draft) }),
  );

  const summary =
    selectedDrafts.length > 0
      ? getAppointmentCreationSummary(draftStartAt, summaryItems, draftDiscount)
      : undefined;

  // The DRAFT schedule against the Calendar Blocks of the same staff member:
  // only staff-required phases count, so processing time may cross a pause.
  const blockInTheWay =
    selectedDrafts.length > 0
      ? findAppointmentCalendarBlockConflict(
          {
            staffMemberId: currentStaffMemberId,
            startAt: draftStartAt,
            status: 'SCHEDULED',
            items: selectedDrafts.map((draft, order) => ({ order, phases: draft.phases })),
          },
          calendarBlocks,
        )
      : undefined;

  // THE deposit truth of this draft: offered only while the new Appointment
  // will be financially open (never for a previous-day Appointment, finalized
  // on save), read against the CURRENT services total — a lower price or a
  // new discount re-validates the entered amount at once.
  const depositOffered = canOfferCreationDeposit(draftStartAt, today);
  const depositState = summary
    ? deriveCreationDepositState(
        depositOffered ? depositDraft : undefined,
        'SCHEDULED',
        summary.servicesTotal,
      )
    : undefined;

  const canContinue =
    step === 0
      ? selectedClient !== undefined
      : selectedDrafts.length > 0 &&
        (step !== 2 || (blockInTheWay === undefined && depositState?.blocksCreation !== true));

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
    if (!selectedClient || selectedDrafts.length === 0 || !summary || blockInTheWay) return;
    if (!depositState || depositState.blocksCreation) return;
    if (creating.current) return;
    creating.current = true;

    const appointmentId = createAppointmentId();
    // The final draft is the immediate source for the Appointment snapshot.
    const appointment = buildAppointment({
      appointmentId,
      businessId: business.id,
      clientId: selectedClient.id,
      // Stored only when the professional actually saw the control: while the
      // global preference is off the field stays absent (= default enabled).
      ...(remindersGloballyEnabled ? { clientReminderEnabled: draftReminderEnabled } : {}),
      discount: draftDiscount,
      itemIds: selectedDrafts.map((_, index) => createAppointmentItemId(appointmentId, index)),
      items: summaryItems,
      staffMemberId: currentStaffMemberId,
      startAt: draftStartAt,
    });

    // Snapshot only: the Appointment (items + phases) — plus the deposit
    // already received, when one was entered — is the whole write, in ONE
    // transaction. Official Service timing is edited from Prestations & tarifs
    // alone. A failure saves nothing, says so, and lets her try again.
    try {
      addAppointment({ appointment }, depositState.deposit);
    } catch (error) {
      creating.current = false;
      alertPersistenceFailure(error);
      return;
    }
    haptics.success();
    router.back();
  };

  // Personal mode: a Calendar Block and NOTHING else — built from the form's own
  // values, never from the client draft (no client, service, discount or price
  // exists on the entity it could leak into).
  const blockSlot = (values: CalendarBlockFormValues) => {
    try {
      addCalendarBlock({
        id: createCalendarBlockId(),
        businessId: business.id,
        staffMemberId: currentStaffMemberId,
        ...values,
      });
    } catch (error) {
      alertPersistenceFailure(error);
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
        {/* The shared editing header (SheetEditingHeader), in both modes:
            « Annuler » leading, one title. The segment below names the mode,
            the stepper the step — no eyebrow, no step title. */}
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler la création"
          onCancel={() => router.back()}
          title={mode === 'client' ? 'Nouveau rendez-vous' : CALENDAR_BLOCK_TITLE}
        />
        <SegmentedControl
          onChange={setMode}
          options={MODE_OPTIONS}
          testID="creation-mode"
          value={mode}
        />
      </View>

      {mode === 'personal' && (
        <CalendarBlockForm
          fill
          // The Agenda context: the time the sheet was opened with (or the one
          // already chosen on the context row), then +30 minutes.
          initialTimes={createInitialBlockTimes(draftStartAt)}
          onSubmit={blockSlot}
          staffMemberId={currentStaffMemberId}
          submitLabel="Bloquer le créneau"
        />
      )}

      {mode === 'client' && (
        <CreationStepper step={step} onStepPress={(target) => navigateToStep(target)} />
      )}

      {mode === 'client' && step === 0 && (
        <ClientPickerStep
          // Date / Heure (and the birthday reminder) scroll with the list:
          // one vertical scroll, the footer stays outside it.
          header={
            <View style={styles.scheduleHeader}>
              <AppointmentScheduleSection
                clientName={selectedClientName}
                maxHour={startHourRange.maxHour}
                minHour={startHourRange.minHour}
                onStartTimeChange={chooseDraftStartTime}
                startAt={draftStartAt}
              />
              {isBirthdayAppointment && (
                <BirthdayNotice
                  accessibilityLabel={`${birthdayMessage} ${SELECTION_BIRTHDAY_SUGGESTION}`}
                  compact
                  messages={[SELECTION_BIRTHDAY_SUGGESTION]}
                  testID="client-selection-birthday-notice"
                  title={birthdayMessage}
                />
              )}
            </View>
          }
          clients={visibleClients}
          query={clientQuery}
          selectedClientId={selectedClientId}
          onChangeQuery={setClientQuery}
          onAddClientPress={() => setAddClientVisible(true)}
          onSelectClient={selectClientById}
        />
      )}
      {mode === 'client' && step === 1 && (
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.catalogContent}
          style={styles.catalogScroll}
        >
          <AppointmentScheduleSection
            clientName={selectedClientName}
            maxHour={startHourRange.maxHour}
            minHour={startHourRange.minHour}
            onStartTimeChange={chooseDraftStartTime}
            startAt={draftStartAt}
          />
          <ServiceCatalogPicker
            categories={catalogueView.categories}
            organization={catalogueView.presentation.organization}
            services={activeServices}
            selectedServiceIds={selectedDrafts.map((draft) => draft.serviceId)}
            onSelectService={toggleService}
            selectedHint="Retirer du rendez-vous"
          />
        </ScrollView>
      )}
      {mode === 'client' && step === 2 && selectedClient && summary && (
        <SummaryStep
          clientName={getClientDisplayName(selectedClient)}
          // The Appointment DATE decides, never today's date: derived on every
          // render, so a changed Client or date can never leave a stale reminder.
          birthdayReminder={isBirthdayAppointment}
          reminder={
            remindersGloballyEnabled
              ? {
                  enabled: draftReminderEnabled,
                  onChange: setDraftReminderEnabled,
                  missingClientEmail: !isUsableCommunicationEmail(selectedClient.email),
                  onAddEmail: () => setEditClientEmailVisible(true),
                }
              : undefined
          }
          discount={draftDiscount}
          onDiscountChange={setDraftDiscount}
          deposit={
            depositOffered && depositState
              ? { draft: depositDraft, state: depositState, onChange: setDepositDraft }
              : undefined
          }
          entries={selectedDrafts.map((draft) => ({ draft }))}
          expandedDraftId={expandedDraftId}
          startAt={draftStartAt}
          summary={summary}
          onEditClient={() => navigateToStep(0)}
          onEditServices={() => navigateToStep(1)}
          onReorder={reorderSelectedDrafts}
          organization={catalogueView.presentation.organization}
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

      {mode === 'client' && (
        <SheetActionBar testID="appointment-creation-actions">
          {/* The two decision points. Inside the fixed footer, so the warning
              never depends on where the Client list or the summary is scrolled. */}
          {(step === 0 || step === 2) && selectedClient && noShowWarning && (
            <NoShowWarningNotice testID="appointment-no-show-warning" warning={noShowWarning} />
          )}
          {step === 2 && blockInTheWay && (
            <ScheduleConflictNotice
              conflict={describeCalendarBlockInTheWay(blockInTheWay)}
              testID="appointment-calendar-block-conflict"
            />
          )}
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
      )}

      {/* Same burst as the Client Profile; keyed so each selection restarts it. */}
      {mode === 'client' && birthdayBurst !== undefined && (
        <BirthdayConfetti key={birthdayBurst} onFinished={endBirthdayBurst} />
      )}

      <ClientFormSheet
        mode="create"
        onClose={() => setAddClientVisible(false)}
        onSubmitted={handleClientCreated}
        visible={addClientVisible}
      />

      {/* « Ajouter l’e-mail » (missing-email warning): the EXISTING Client
          editing flow, prefilled with the selected Client. */}
      {selectedClient && (
        <ClientFormSheet
          client={selectedClient}
          mode="edit"
          onClose={() => setEditClientEmailVisible(false)}
          onSubmitted={() => setEditClientEmailVisible(false)}
          visible={editClientEmailVisible}
        />
      )}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  headerZone: { gap: spacing.xs, paddingHorizontal: horizontalGutter },
  scheduleHeader: { gap: spacing.md },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  catalogScroll: { flex: 1 },
  catalogContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
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
