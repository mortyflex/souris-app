// BeautIzzy - Existing Appointment service editing screen
//
// ONE continuous editor: editable Date/Heure context, the retained
// AppointmentItem stack (snapshot hydration only), and the shared grouped
// catalog inline for ADDING new current Services. No secondary catalog mode.
//
// Existing AppointmentItems hydrate ONLY from their snapshots; the catalog
// grid uses a separate pending-add selection. Editing an existing
// Appointment never writes the catalog.
//
// Moving the Appointment (date, time, services or durations) into a Calendar
// Block of its staff member is explained inline and cannot be saved. An edit
// that leaves the schedule alone — a price, the Client, the discount — is never
// held back by an overlap that already existed: what decides is whether the
// staff-required intervals actually moved.
//
// An edit that would LOWER the expected total below the deposits already
// received (a removed service, a lower price, a larger discount) is explained
// inline the same way and cannot be saved — THE domain deposit rule; the
// store re-verifies it. An edit that does not lower the total is never held
// back by the deposits.
//
// Presented in the canonical BeautIzzy sheet shell; swipe-to-dismiss is off
// (route options). A dirty draft is guarded against « Annuler » and the
// hardware back by the shared BeautIzzy confirmation dialog.
//
// Layout (DESIGN_OVERRIDES.md §27): an iOS editing header (« Annuler » leading,
// title), ONE vertical scroll — Rendez-vous rows, Prestations sélectionnées as
// one grouped list, Options (Réduction), Ajouter des prestations (search,
// Services / Techniques segment, dense list) — and a sticky footer outside the
// scroll: the live « N prestations · durée » summary, the net amount and the
// violet « Enregistrer les modifications ».

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  areAppointmentDiscountsEqual,
  canRemoveAppointmentItem,
  isAppointmentClientReminderEnabled,
  findAppointmentChangeDepositShortfall,
  getAppointmentServicesTotal,
  setAppointmentDiscount,
  updateAppointmentFromDrafts,
  type Appointment,
  type AppointmentDiscount,
  type Service,
} from '@/domain/appointments';
import { findAppointmentChangeCalendarBlockConflict } from '@/domain/calendar-blocks';
import { isClientBirthdayOnDate } from '@/domain/clients';
import { isUsableCommunicationEmail } from '@/domain/communications';
import { DepositShortfallNotice } from '@/features/appointments/deposits/DepositShortfallNotice';
import { describeDepositShortfall } from '@/features/appointments/deposits/presentation';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { ScheduleConflictNotice } from '@/features/calendar-blocks/editor/ScheduleConflictNotice';
import { describeCalendarBlockInTheWay } from '@/features/calendar-blocks/presentation';
import { useCalendarBlockSession } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { MissingEmailNotice } from '@/features/communications/components/MissingEmailNotice';
import { useOptionalCommunicationPreferences } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { APPOINTMENT_REMINDER_ROW_LABEL } from '@/features/communications/presentation';
import { useOptionalSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { isTerminalAppointmentStatus } from '@/features/appointments/presentation';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { foregroundSoft, gutter, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { createNewAppointmentItemId } from '../creation/runtime-ids';
import { AppointmentDiscountSection } from '../editor/components/AppointmentDiscountSection';
import { ServiceCatalogPicker } from '../editor/components/ServiceCatalogPicker';
import { SortableDraftList } from '../editor/components/SortableDraftList';
import { formatCreationDuration } from '../editor/presentation';
import {
  areDraftsEqual,
  createSelectedServiceDraft,
  getDraftDurationMinutes,
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
  const { deposits, getAppointmentById, updateAppointment } = useAppointmentSession();
  const sales = useOptionalSaleSession()?.sales ?? [];
  const { calendarBlocks } = useCalendarBlockSession();
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
  const [initialDiscount] = useState<AppointmentDiscount | undefined>(() => appointment?.discount);
  const [draftDiscount, setDraftDiscount] = useState<AppointmentDiscount | undefined>(
    initialDiscount,
  );
  // Per-appointment client reminder (Lot B): shown while the GLOBAL
  // preference is on; absent (older records) reads as enabled.
  const remindersGloballyEnabled =
    useOptionalCommunicationPreferences()?.emailRemindersEnabled ?? false;
  const [initialReminderEnabled] = useState(() =>
    appointment ? isAppointmentClientReminderEnabled(appointment) : true,
  );
  const [draftReminderEnabled, setDraftReminderEnabled] = useState(initialReminderEnabled);
  const [editClientEmailVisible, setEditClientEmailVisible] = useState(false);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const isDirty =
    !areDraftsEqual(drafts, initialDrafts) ||
    (draftStartAt !== undefined &&
      initialStartAt !== undefined &&
      !isSameStartAt(draftStartAt, initialStartAt)) ||
    draftClientId !== initialClientId ||
    !areAppointmentDiscountsEqual(draftDiscount, initialDiscount) ||
    draftReminderEnabled !== initialReminderEnabled;
  const isTerminal = appointment ? isTerminalAppointmentStatus(appointment.status) : false;
  // THE change rule (domain): the DRAFT is judged against the Calendar Blocks of
  // the same staff member only when it moves a staff-required interval — the
  // very rule the quick edits of Appointment Details go through.
  const blockInTheWay =
    appointment && draftStartAt
      ? findAppointmentChangeCalendarBlockConflict(
          appointment,
          {
            staffMemberId: appointment.staffMemberId,
            startAt: draftStartAt,
            status: appointment.status,
            items: drafts.map((draft, order) => ({ order, phases: draft.phases })),
          },
          calendarBlocks,
        )
      : undefined;
  // THE services composition the save would write (the domain editing and
  // discount actions), judged against the deposits by THE domain rule.
  const buildEditedAppointment = (source: Appointment): Appointment =>
    setAppointmentDiscount(
      updateAppointmentFromDrafts(
        source,
        drafts.map((draft, index) => toAppointmentItemEditDraft(draft, index)),
      ),
      draftDiscount,
    );
  const depositShortfall =
    appointment && drafts.length > 0
      ? findAppointmentChangeDepositShortfall({
          current: appointment,
          candidate: buildEditedAppointment(appointment),
          sales,
          deposits,
        })
      : undefined;
  const draftClient = getClientById(draftClientId);
  const clientName = getResolvedClientDisplayName(draftClient);
  // The footer reads the SAME derivations as the rest of the editor: the draft
  // durations and THE domain services total (net of the discount).
  const servicesTotal = getAppointmentServicesTotal({ items: drafts, discount: draftDiscount });
  const totalMinutes = drafts.reduce((total, draft) => total + getDraftDurationMinutes(draft), 0);
  const summaryLabel = `${drafts.length} prestation${drafts.length > 1 ? 's' : ''} · ${formatCreationDuration(totalMinutes)}`;
  const totalLabel = formatEuroCents(servicesTotal.netCents);

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
      <SheetScreen>
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
      <SheetScreen>
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
    if (!isDirty || isTerminal || blockInTheWay || depositShortfall) return;

    // The discount goes through THE domain discount action, never a local rule.
    const updatedAppointment = buildEditedAppointment(appointment);
    // An untouched toggle keeps the stored field exactly as it was (absent
    // stays absent); only an actual change stores the explicit choice.
    const reminderChanged = draftReminderEnabled !== initialReminderEnabled;
    try {
      updateAppointment({
        ...entry,
        appointment: {
          ...updatedAppointment,
          clientId: draftClientId ?? appointment.clientId,
          startAt: new Date(draftStartAt),
          ...(reminderChanged ? { clientReminderEnabled: draftReminderEnabled } : {}),
        },
      });
    } catch (error) {
      alertPersistenceFailure(error);
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
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler les modifications"
          cancelTestID="cancel-appointment-edit"
          onCancel={cancel}
          title="Modifier le rendez-vous"
        />
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editorContent, { paddingHorizontal: horizontalGutter }]}
        testID="appointment-editing-scroll"
      >
        <View style={styles.section}>
          <AppText variant="eyebrow" style={styles.eyebrow}>
            RENDEZ-VOUS
          </AppText>
          <EditableAppointmentContext
            clientName={clientName}
            startAt={draftStartAt}
            onEditClient={() => setClientPickerVisible(true)}
            onStartAtChange={setDraftStartAt}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader count={drafts.length} title="Prestations sélectionnées" />
          <GroupedSurface testID="appointment-selected-services">
            <SortableDraftList
              canRemove={drafts.length > 1}
              entries={drafts.map((draft) => ({ draft }))}
              expandedDraftId={expandedDraftId}
              grouped
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
          </GroupedSurface>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Options" />
          <AppointmentDiscountSection
            // The DRAFT date and the DRAFT Client decide, derived on every render:
            // moving the Appointment or changing the Client updates it at once.
            birthdayReminder={
              draftClient !== undefined && isClientBirthdayOnDate(draftClient, draftStartAt)
            }
            discount={draftDiscount}
            editorStyle={styles.discountRow}
            onChange={setDraftDiscount}
            servicesTotal={servicesTotal}
          />
          {remindersGloballyEnabled && (
            <GroupedSurface testID="appointment-edit-reminder">
              <SwitchRow
                description="E-mail 24 h avant le rendez-vous"
                label={APPOINTMENT_REMINDER_ROW_LABEL}
                onValueChange={setDraftReminderEnabled}
                testID="appointment-reminder-toggle"
                value={draftReminderEnabled}
              />
            </GroupedSurface>
          )}
          {remindersGloballyEnabled &&
            draftReminderEnabled &&
            !isUsableCommunicationEmail(draftClient?.email) && (
              <MissingEmailNotice
                onAddEmail={() => setEditClientEmailVisible(true)}
                testID="editing-missing-email-notice"
              />
            )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Ajouter des prestations" />
          <ServiceCatalogPicker
            services={activeServices}
            selectedServiceIds={drafts.map((draft) => draft.serviceId)}
            onSelectService={addServiceImmediately}
          />
        </View>
      </ScrollView>

      <SheetActionBar style={styles.footer} testID="appointment-edit-footer">
        {blockInTheWay && (
          <ScheduleConflictNotice
            conflict={describeCalendarBlockInTheWay(blockInTheWay)}
            testID="appointment-calendar-block-conflict"
          />
        )}
        {depositShortfall && (
          <DepositShortfallNotice
            shortfall={describeDepositShortfall(depositShortfall)}
            testID="appointment-edit-deposit-shortfall"
          />
        )}
        <View
          accessible
          accessibilityLabel={`${summaryLabel}, total ${totalLabel}`}
          style={styles.summary}
          testID="appointment-edit-summary"
        >
          <AppText
            variant="control"
            numberOfLines={1}
            style={styles.summaryLabel}
            testID="appointment-edit-summary-label"
          >
            {summaryLabel}
          </AppText>
          <AppText
            variant="sectionTitle"
            numberOfLines={1}
            style={styles.summaryTotal}
            testID="appointment-edit-summary-total"
          >
            {totalLabel}
          </AppText>
        </View>
        <AppButton
          disabled={!isDirty || blockInTheWay !== undefined || depositShortfall !== undefined}
          onPress={save}
          testID="save-appointment-edit"
          title="Enregistrer les modifications"
        />
      </SheetActionBar>

      {/* « Ajouter l’e-mail » (missing-email warning): the EXISTING Client
          editing flow, prefilled with the draft Client. */}
      {draftClient && (
        <ClientFormSheet
          client={draftClient}
          mode="edit"
          onClose={() => setEditClientEmailVisible(false)}
          onSubmitted={() => setEditClientEmailVisible(false)}
          visible={editClientEmailVisible}
        />
      )}

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
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  section: { gap: spacing.sm },
  eyebrow: { color: foregroundSoft },
  // The discount block as a white grouped row, like the lists around it.
  discountRow: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summary: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  summaryLabel: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  summaryTotal: { color: semanticColors.accent, fontVariant: ['tabular-nums'] },
  notFound: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'] },
  notFoundText: { color: semanticColors.foregroundMuted, textAlign: 'center' },
});
