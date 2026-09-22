import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";

import {
  canCancelAppointment,
  canCheckoutAppointment,
  canEditAppointment,
  canEditAppointmentPayment,
  canMarkAppointmentNoShow,
  canRemoveAppointmentItem,
  cancelAppointment,
  completeAppointment,
  getAppointmentExpectedTotal,
  getAppointmentProductLines,
  getOrderedItems,
  markAppointmentNoShow,
  removeAppointmentItem as removeItemFromAppointment,
  reorderAppointmentItemsByIds,
  shouldAutoCompleteAppointment,
  updateAppointmentItemPhaseDurations,
  type Appointment,
  type AppointmentDiscount,
  type AppointmentPaymentAmounts,
  type AppointmentPhaseDurationUpdate,
  type AppointmentProductLine,
} from "@/domain/appointments";
import {
  findAppointmentChangeCalendarBlockConflict,
  type CalendarBlock,
} from "@/domain/calendar-blocks";
import type { Sale } from "@/domain/sales";
import { isClientArchived, isClientBirthdayOnDate } from "@/domain/clients";
import {
  AppointmentCheckoutSheet,
  type AppointmentCheckoutMode,
} from "@/features/appointments/checkout/AppointmentCheckoutSheet";
import { SortableRowList } from "@/features/appointments/editor/components/SortableRowList";
import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { ScheduleConflictNotice } from "@/features/calendar-blocks/editor/ScheduleConflictNotice";
import { describeAppointmentChangeIntoCalendarBlock } from "@/features/calendar-blocks/presentation";
import { useCalendarBlockSession } from "@/features/calendar-blocks/session/CalendarBlockSessionProvider";
import { getResolvedClientDisplayName } from "@/features/clients/presentation";
import { useClientSession } from "@/features/clients/session/ClientSessionProvider";
import { useSaleSession } from "@/features/sales/session/SaleSessionProvider";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppText } from "@/shared/ui/AppText";
import { GlassIconButton, glassIcons } from "@/shared/ui/GlassIconButton";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import { SwipeToDeleteRow, useSwipeHintTarget } from "@/shared/ui/SwipeToDeleteRow";
import {
  foregroundSoft,
  gutter,
  radii,
  rose,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import {
  AppointmentActionsSheet,
  type AppointmentSecondaryAction,
} from "./components/AppointmentActionsSheet";
import { AppointmentCheckoutFooter } from "./components/AppointmentCheckoutFooter";
import {
  AppointmentDeletionDialog,
  type AppointmentDeletionDialogMode,
} from "./components/AppointmentDeletionDialog";
import {
  AppointmentCancellationSheet,
  AppointmentNoShowSheet,
} from "./components/AppointmentLifecycleSheets";
import { AppointmentMeta } from "./components/AppointmentMeta";
import { AppointmentPaymentSummary } from "./components/AppointmentPaymentSummary";
import { AppointmentProductsSection } from "./components/AppointmentProductsSection";
import { AppointmentSaleRow } from "./components/AppointmentSaleRow";
import { AppointmentServiceSection } from "./components/AppointmentServiceSection";
import { AppointmentSummary } from "./components/AppointmentSummary";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  getAppointmentDetailServices,
  getAppointmentDetailSummary,
  getAppointmentDisplayStatus,
  getAppointmentEnd,
  isTerminalAppointmentStatus,
} from "./presentation";

interface AppointmentDetailsScreenProps {
  readonly appointmentId?: string;
}

/**
 * The ONE swipe-hint target of a Details instance, decided when the screen
 * opens: the first removable Service (editable Appointment with several
 * items) — the gesture is learned there — otherwise the first sold Product.
 * Never both, never replayed.
 */
function getInitialSwipeHintTarget(
  appointment: Appointment | undefined,
  sales: readonly Sale[],
): string | undefined {
  if (!appointment) return undefined;
  const items = getOrderedItems(appointment);
  if (canEditAppointment(appointment) && canRemoveAppointmentItem(items.length) && items[0]) {
    return `service:${items[0].id}`;
  }
  const firstLine = getAppointmentProductLines(sales, appointment.id)[0];
  return firstLine ? `product:${firstLine.key}` : undefined;
}

export function AppointmentDetailsScreen({
  appointmentId,
}: AppointmentDetailsScreenProps) {
  const router = useRouter();
  const [expandedItemIds, setExpandedItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [now, setNow] = useState(() => new Date());
  const [activeSheet, setActiveSheet] = useState<"cancellation" | "no-show">();
  const [checkoutMode, setCheckoutMode] = useState<AppointmentCheckoutMode>();
  const [deletionMode, setDeletionMode] = useState<AppointmentDeletionDialogMode>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<AppointmentSecondaryAction>();
  const [deletedByCurrentScreen, setDeletedByCurrentScreen] = useState(false);
  // The Calendar Block the LAST quick edit would have run into (nothing was
  // written). Replaced or cleared by the next quick edit.
  const [refusedByBlock, setRefusedByBlock] = useState<CalendarBlock>();
  const horizontalGutter =
    Platform.OS === "android" ? gutter.android : gutter.ios;
  const {
    checkoutAppointment,
    deleteAppointment,
    getAppointmentById,
    getAppointmentDeletionEligibility,
    removeAppointmentItem,
    reorderAppointmentItems,
    updateAppointment,
    updateAppointmentItemTiming,
    updateAppointmentPayment,
  } = useAppointmentSession();
  const { calendarBlocks } = useCalendarBlockSession();
  const { getClientById } = useClientSession();
  const { sales, deleteAppointmentProduct } = useSaleSession();
  const entry = getAppointmentById(appointmentId);
  // ONE coordinated swipe hint per screen instance (Services first, else Products).
  const swipeHintTarget = useSwipeHintTarget(
    getInitialSwipeHintTarget(entry?.appointment, sales),
  );

  useEffect(() => {
    let minuteTimer: ReturnType<typeof setTimeout>;
    const scheduleNextMinute = () => {
      const untilNextMinute = 60_000 - (Date.now() % 60_000);
      minuteTimer = setTimeout(() => {
        setNow(new Date());
        scheduleNextMinute();
      }, untilNextMinute);
    };
    scheduleNextMinute();
    return () => clearTimeout(minuteTimer);
  }, []);

  const toggleItem = (itemId: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  if (!entry) {
    if (deletedByCurrentScreen) return null;

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

  const { appointment } = entry;
  const client = getClientById(appointment.clientId);
  const clientDisplayName = getResolvedClientDisplayName(client);
  // « Ajouter une vente » (a Revente) opens a NEW Sale for the Client: an
  // archived Client keeps her history readable here but is never attached to
  // new business actions.
  // Encaisser stays possible: an existing Appointment can still be finalized.
  const canSellToClient = client !== undefined && !isClientArchived(client);
  const services = getAppointmentDetailServices(appointment);
  const summary = getAppointmentDetailSummary(appointment);
  // Product rows aggregated across every Revente of this Appointment (domain
  // derivation over the linked Sale snapshots; the Sales stay separate).
  const productLines = getAppointmentProductLines(sales, appointment.id);
  // THE expected total: service snapshots + linked Sale snapshots, in cents.
  // The checkout sheet derives the same value from the same Appointment (with
  // its discount draft applied through the domain).
  const expectedTotal = getAppointmentExpectedTotal(appointment, sales);
  const endAt = getAppointmentEnd(appointment);
  const isTerminal = isTerminalAppointmentStatus(appointment.status);
  const isException =
    appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";
  // The Appointment DATE decides (never today's date). A static, read-only
  // mention: no confetti, no discount control in the body — « Modifier » and
  // the checkout sheet own the discount. A cancelled or missed visit is not a
  // birthday visit.
  const isBirthdayAppointment =
    client !== undefined &&
    !isException &&
    isClientBirthdayOnDate(client, appointment.startAt);
  const canCheckout = canCheckoutAppointment(appointment, now);
  const canEditPayment = canEditAppointmentPayment(appointment);
  const canCancel = canCancelAppointment(appointment);
  const canMarkNoShow = canMarkAppointmentNoShow(appointment, now);
  // The ONE editing eligibility rule (domain): timing accordions and the
  // Modifier action open together and close together.
  const canModify = canEditAppointment(appointment);
  // Same editing rule as « Modifier »: an Appointment always keeps one Service.
  const canRemoveService = canModify && canRemoveAppointmentItem(services.length);

  // Every lifecycle write goes through the persisted session; a failed write
  // leaves the record unchanged and is reported once.
  const persist = (task: () => void): boolean => {
    try {
      task();
      return true;
    } catch {
      alertPersistenceFailure();
      return false;
    }
  };

  // Quick edits change the schedule without going through « Modifier », so they
  // go through THE same domain rule: the candidate Appointment is computed
  // first (by the very domain operations the session applies); when its
  // staff-required intervals are those of the current Appointment nothing is
  // checked, otherwise it is validated against the Calendar Blocks of its staff
  // member. A refused edit writes NOTHING — no clamping, nothing moved — and is
  // explained inline. Appointment-versus-Appointment overlap is never looked at.
  const isFreeOfCalendarBlocks = (buildCandidate: () => Appointment): boolean => {
    let candidate: Appointment;
    try {
      candidate = buildCandidate();
    } catch {
      // An invalid edit is the session's to refuse, exactly as before.
      setRefusedByBlock(undefined);
      return true;
    }
    const block = findAppointmentChangeCalendarBlockConflict(appointment, candidate, calendarBlocks);
    setRefusedByBlock(block);
    if (block) haptics.warning();
    return block === undefined;
  };

  // Appointment-specific timing: ONE atomic write of the item's phase
  // durations; the catalog Service is never involved.
  const saveServiceTiming = (
    appointmentItemId: string,
    updates: readonly AppointmentPhaseDurationUpdate[],
  ): boolean => {
    if (
      !isFreeOfCalendarBlocks(() =>
        updateAppointmentItemPhaseDurations(appointment, appointmentItemId, updates),
      )
    ) {
      return false;
    }
    const succeeded = persist(() =>
      updateAppointmentItemTiming(appointment.id, appointmentItemId, updates),
    );
    if (succeeded) haptics.success();
    return succeeded;
  };

  // Direct composition edits (no draft, no Save): ONE atomic write each,
  // this Appointment's snapshot only. A refused write leaves the rows where
  // the session says they are and reports once.
  const removeService = (appointmentItemId: string): boolean => {
    if (!isFreeOfCalendarBlocks(() => removeItemFromAppointment(appointment, appointmentItemId))) {
      return false;
    }
    const succeeded = persist(() => removeAppointmentItem(appointment.id, appointmentItemId));
    if (succeeded) haptics.destructive();
    return succeeded;
  };

  const reorderServices = (fromIndex: number, toIndex: number): boolean => {
    const orderedItemIds = services.map((service) => service.item.id);
    const [moved] = orderedItemIds.splice(fromIndex, 1);
    if (moved === undefined) return false;
    orderedItemIds.splice(toIndex, 0, moved);
    if (!isFreeOfCalendarBlocks(() => reorderAppointmentItemsByIds(appointment, orderedItemIds))) {
      return false;
    }
    return persist(() => reorderAppointmentItems(appointment.id, orderedItemIds));
  };

  const openSale = () => {
    if (!client) return;
    router.push({
      pathname: "/sales/new",
      params: { clientId: client.id, appointmentId: appointment.id },
    });
  };

  // Checkout records the payment together with the FINAL discount chosen in
  // the sheet (one transaction); a payment correction never touches it.
  const confirmCheckout = (
    amounts: AppointmentPaymentAmounts,
    discount: AppointmentDiscount | undefined,
  ) => {
    const succeeded = persist(() =>
      checkoutMode === "edit"
        ? updateAppointmentPayment(appointment.id, amounts)
        : checkoutAppointment(appointment.id, amounts, { discount }),
    );
    if (!succeeded) return;
    setCheckoutMode(undefined);
    haptics.success();
  };

  const finalizePreviousDayBeforeException = (transitionNow: Date): boolean => {
    if (!shouldAutoCompleteAppointment(appointment, transitionNow))
      return false;
    persist(() =>
      updateAppointment({
        appointment: completeAppointment(appointment, transitionNow),
      }),
    );
    setActiveSheet(undefined);
    return true;
  };

  const cancel = (actor: "CLIENT" | "BUSINESS", reason?: string) => {
    const transitionNow = new Date();
    if (finalizePreviousDayBeforeException(transitionNow)) return;
    const nextAppointment = cancelAppointment(
      appointment,
      actor,
      transitionNow,
      reason,
    );
    if (nextAppointment === appointment) return;
    if (!persist(() => updateAppointment({ appointment: nextAppointment }))) return;
    setActiveSheet(undefined);
    haptics.warning();
  };

  const markNoShow = () => {
    const transitionNow = new Date();
    if (finalizePreviousDayBeforeException(transitionNow)) return;
    const nextAppointment = markAppointmentNoShow(appointment, transitionNow);
    if (nextAppointment === appointment) return;
    if (!persist(() => updateAppointment({ appointment: nextAppointment }))) return;
    setActiveSheet(undefined);
    haptics.warning();
  };

  // The stored references decide: a recorded checkout or a linked Sale
  // anchors the Appointment in history and blocks deletion with an
  // explanation instead of a confirmation that could not succeed.
  const requestDeletion = () => {
    let deletable = false;
    if (!persist(() => {
      deletable = getAppointmentDeletionEligibility(appointment.id).deletable;
    })) return;
    setDeletionMode(deletable ? "confirm" : "blocked");
  };

  const deletePermanently = () => {
    setDeletionMode(undefined);
    if (!persist(() => deleteAppointment(appointment.id))) return;
    setDeletedByCurrentScreen(true);
    haptics.warning();
    router.back();
  };

  // Swipe-to-delete of one displayed Product row: every matching sold line
  // across the Reventes of this Appointment goes and the summed quantity
  // returns to stock in ONE transaction. The Appointment and its recorded
  // payment are never touched; the ticket total and the checkout expectation
  // recompute from the session. Returns whether the deletion was committed so
  // the row can close again on failure.
  const deleteProductLine = (line: AppointmentProductLine): boolean =>
    persist(() => deleteAppointmentProduct(appointment.id, line));

  const available = new Set<AppointmentSecondaryAction>();
  if (canModify) available.add("modify");
  if (canMarkNoShow) available.add("no-show");
  if (canCancel) available.add("cancel");

  // The chosen « ••• » action runs once the action list is gone, so the next
  // drawer, dialog or route never races the closing one.
  const runSecondaryAction = () => {
    const action = pendingAction;
    setPendingAction(undefined);
    switch (action) {
      case "modify":
        router.push({
          pathname: "/appointments/edit/[appointmentId]",
          params: { appointmentId: appointment.id },
        });
        return;
      case "no-show":
        setActiveSheet("no-show");
        return;
      case "cancel":
        setActiveSheet("cancellation");
        return;
      case "delete":
        requestDeletion();
        return;
      default:
        return;
    }
  };

  return (
    <SheetScreen fit="content" testID="appointment-details-sheet">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalGutter },
        ]}
        style={styles.scroll}
        testID="appointment-details-scroll"
      >
        <View style={styles.identityHeader} testID="appointment-identity-header">
          <View style={styles.identityAccent} />
          <View style={styles.identityCopy}>
            <AppText variant="eyebrow" style={styles.identityEyebrow}>
              RENDEZ-VOUS
            </AppText>
            <AppText
              variant="sheetTitle"
              accessibilityRole="header"
              numberOfLines={2}
              selectable
              style={styles.clientName}
            >
              {clientDisplayName}
            </AppText>
          </View>
          <View style={styles.headerActions}>
            <GlassIconButton
              accessibilityLabel="Actions du rendez-vous"
              icon={glassIcons.more}
              onPress={() => setMenuVisible(true)}
              testID="open-appointment-actions"
            />
            {/* The same way out as the swipe and the outside tap: SheetScreen
                plays the close transition, then the route leaves. */}
            <GlassIconButton
              accessibilityLabel="Fermer"
              icon={glassIcons.close}
              onPress={() => router.back()}
              testID="close-appointment-details"
            />
          </View>
        </View>

        <AppointmentMeta
          cancellation={appointment.cancellation}
          dateLabel={formatAppointmentDate(appointment.startAt)}
          isBirthday={isBirthdayAppointment}
          status={getAppointmentDisplayStatus(appointment, now)}
          timeLabel={`${formatAppointmentTime(appointment.startAt)} – ${formatAppointmentTime(endAt)}`}
        />

        <SectionHeader
          count={services.length}
          style={styles.sectionHeader}
          title="Prestations"
        />
        <View style={styles.servicesGroup} testID="appointment-services">
          <SortableRowList
            entries={services}
            gap={0}
            getKey={(service) => service.item.id}
            getLabel={(service) => service.item.serviceName}
            onReorder={reorderServices}
            renderRow={(service, { dragHandle }) => {
              const section = (
                <AppointmentServiceSection
                  dragHandle={dragHandle}
                  editable={canModify}
                  expanded={expandedItemIds.has(service.item.id)}
                  separated={services.indexOf(service) > 0}
                  service={service}
                  onSaveTiming={(updates) => saveServiceTiming(service.item.id, updates)}
                  onToggle={() => toggleItem(service.item.id)}
                />
              );
              if (!canRemoveService) return section;
              return (
                <SwipeToDeleteRow
                  borderRadius={0}
                  deleteAccessibilityLabel={`Retirer ${service.item.serviceName} du rendez-vous`}
                  deleteTestID={`remove-appointment-service-${service.item.id}`}
                  hint={swipeHintTarget === `service:${service.item.id}`}
                  onDelete={() => removeService(service.item.id)}
                  surfaceColor={semanticColors.surfaceElevated}
                  testID={`appointment-service-${service.item.id}`}
                >
                  {section}
                </SwipeToDeleteRow>
              );
            }}
            sortable={canModify}
          />
        </View>

        {refusedByBlock && (
          <View style={styles.conflictNotice}>
            <ScheduleConflictNotice
              conflict={describeAppointmentChangeIntoCalendarBlock(refusedByBlock)}
              testID="appointment-quick-edit-conflict"
            />
          </View>
        )}

        <AppointmentSummary summary={summary} />

        {canSellToClient && <AppointmentSaleRow onPress={openSale} />}

        <AppointmentProductsSection
          hintKey={
            swipeHintTarget?.startsWith("product:")
              ? swipeHintTarget.slice("product:".length)
              : undefined
          }
          lines={productLines}
          onDeleteLine={deleteProductLine}
        />

        {appointment.notes && (
          <View style={styles.notes}>
            <AppText variant="control" style={styles.noteLabel}>
              Note
            </AppText>
            <AppText variant="body" selectable>
              {appointment.notes}
            </AppText>
          </View>
        )}

        {canEditPayment && appointment.payment && (
          <AppointmentPaymentSummary
            expectedTotalCents={expectedTotal.expectedTotalCents}
            onEdit={() => setCheckoutMode("edit")}
            payment={appointment.payment}
          />
        )}
      </ScrollView>

      {/* Outside the scroll: always visible, never covering the content. */}
      <AppointmentCheckoutFooter
        checkoutAction={appointment.status === "COMPLETED" ? "record" : "checkout"}
        discount={appointment.discount}
        expectedTotal={expectedTotal}
        onCheckout={canCheckout ? () => setCheckoutMode("checkout") : undefined}
      />

      <AppointmentActionsSheet
        available={available}
        clientName={clientDisplayName}
        onClose={() => setMenuVisible(false)}
        onDismissed={runSecondaryAction}
        onSelect={(action) => {
          setPendingAction(action);
          setMenuVisible(false);
        }}
        visible={menuVisible}
      />
      <AppointmentCheckoutSheet
        appointment={appointment}
        initialAmounts={checkoutMode === "edit" ? appointment.payment : undefined}
        mode={checkoutMode ?? "checkout"}
        onClose={() => setCheckoutMode(undefined)}
        onConfirm={confirmCheckout}
        sales={sales}
        visible={checkoutMode !== undefined}
      />
      <AppointmentCancellationSheet
        clientName={clientDisplayName}
        onClose={() => setActiveSheet(undefined)}
        onConfirm={cancel}
        visible={!isTerminal && activeSheet === "cancellation"}
      />
      <AppointmentNoShowSheet
        clientName={clientDisplayName}
        onClose={() => setActiveSheet(undefined)}
        onConfirm={markNoShow}
        visible={!isTerminal && activeSheet === "no-show"}
      />
      <AppointmentDeletionDialog
        mode={deletionMode}
        onClose={() => setDeletionMode(undefined)}
        onConfirm={deletePermanently}
      />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  identityHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  identityAccent: {
    alignSelf: "stretch",
    backgroundColor: rose.rose600,
    borderRadius: radii.pill,
    width: 4,
  },
  identityCopy: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    marginLeft: spacing.xs,
    minWidth: 0,
  },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  identityEyebrow: { color: rose.rose600 },
  clientName: { color: semanticColors.foreground },
  sectionHeader: {
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  servicesGroup: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: "continuous",
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  conflictNotice: { marginTop: spacing.sm },
  notes: {
    marginTop: spacing.xl,
  },
  noteLabel: { color: semanticColors.foreground, marginBottom: spacing.sm },
  notFound: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["3xl"],
  },
  notFoundText: {
    color: foregroundSoft,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
