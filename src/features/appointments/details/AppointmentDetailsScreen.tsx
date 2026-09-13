import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

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
  shouldAutoCompleteAppointment,
  type Appointment,
  type AppointmentPaymentAmounts,
  type AppointmentPhaseDurationUpdate,
  type AppointmentProductLine,
} from "@/domain/appointments";
import type { Sale } from "@/domain/sales";
import { isClientArchived } from "@/domain/clients";
import {
  AppointmentCheckoutSheet,
  type AppointmentCheckoutMode,
} from "@/features/appointments/checkout/AppointmentCheckoutSheet";
import { SortableRowList } from "@/features/appointments/editor/components/SortableRowList";
import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { getResolvedClientDisplayName } from "@/features/clients/presentation";
import { useClientSession } from "@/features/clients/session/ClientSessionProvider";
import { useSaleSession } from "@/features/sales/session/SaleSessionProvider";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
import { SwipeToDeleteRow, useSwipeHintTarget } from "@/shared/ui/SwipeToDeleteRow";
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
  touchTarget,
} from "@/shared/ui/theme";

import {
  AppointmentDeletionDialog,
  type AppointmentDeletionDialogMode,
} from "./components/AppointmentDeletionDialog";
import {
  AppointmentCancellationSheet,
  AppointmentNoShowSheet,
} from "./components/AppointmentLifecycleSheets";
import { AppointmentPaymentSummary } from "./components/AppointmentPaymentSummary";
import { AppointmentPrimaryActions } from "./components/AppointmentPrimaryActions";
import { AppointmentProductsSection } from "./components/AppointmentProductsSection";
import { AppointmentServiceSection } from "./components/AppointmentServiceSection";
import { AppointmentSummary } from "./components/AppointmentSummary";
import { AppointmentTicketTotal } from "./components/AppointmentTicketTotal";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatCancellationActorLabel,
  getAppointmentDetailServices,
  getAppointmentDetailSummary,
  getAppointmentEnd,
  getAppointmentStatusLabel,
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
  const [deletedByCurrentScreen, setDeletedByCurrentScreen] = useState(false);
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
  // Revente opens a NEW Sale for the Client: an archived Client keeps her
  // history readable here but is never attached to new business actions.
  // Encaisser stays possible: an existing Appointment can still be finalized.
  const canSellToClient = client !== undefined && !isClientArchived(client);
  const services = getAppointmentDetailServices(appointment);
  const summary = getAppointmentDetailSummary(appointment);
  // Product rows aggregated across every Revente of this Appointment (domain
  // derivation over the linked Sale snapshots; the Sales stay separate).
  const productLines = getAppointmentProductLines(sales, appointment.id);
  // THE expected total: service snapshots + linked Sale snapshots, in cents.
  // The same value feeds the ticket row here and the checkout sheet.
  const expectedTotal = getAppointmentExpectedTotal(appointment, sales);
  const endAt = getAppointmentEnd(appointment);
  const isTerminal = isTerminalAppointmentStatus(appointment.status);
  const isException =
    appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";
  const canCheckout = canCheckoutAppointment(appointment, now);
  const canEditPayment = canEditAppointmentPayment(appointment);
  const canCancel = canCancelAppointment(appointment);
  const canMarkNoShow = canMarkAppointmentNoShow(appointment, now);
  // The ONE editing eligibility rule (domain): timing accordions and the
  // Modifier action open together and close together.
  const canModify = canEditAppointment(appointment);
  // Same editing rule as « Modifier »: an Appointment always keeps one Service.
  const canRemoveService = canModify && canRemoveAppointmentItem(services.length);
  const hasNormalActions = canMarkNoShow || canCancel || canModify;

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

  // Appointment-specific timing: ONE atomic write of the item's phase
  // durations; the catalog Service is never involved.
  const saveServiceTiming = (
    appointmentItemId: string,
    updates: readonly AppointmentPhaseDurationUpdate[],
  ): boolean => {
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
    const succeeded = persist(() => removeAppointmentItem(appointment.id, appointmentItemId));
    if (succeeded) haptics.destructive();
    return succeeded;
  };

  const reorderServices = (fromIndex: number, toIndex: number): boolean => {
    const orderedItemIds = services.map((service) => service.item.id);
    const [moved] = orderedItemIds.splice(fromIndex, 1);
    if (moved === undefined) return false;
    orderedItemIds.splice(toIndex, 0, moved);
    return persist(() => reorderAppointmentItems(appointment.id, orderedItemIds));
  };

  const openSale = () => {
    if (!client) return;
    router.push({
      pathname: "/sales/new",
      params: { clientId: client.id, appointmentId: appointment.id },
    });
  };

  const confirmCheckout = (amounts: AppointmentPaymentAmounts) => {
    const succeeded = persist(() =>
      checkoutMode === "edit"
        ? updateAppointmentPayment(appointment.id, amounts)
        : checkoutAppointment(appointment.id, amounts),
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

  return (
    <SheetScreen fit="content" testID="appointment-details-sheet">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalGutter },
        ]}
        style={styles.scroll}
      >
        <View style={styles.appointmentHeader}>
          <View
            style={styles.identityHeader}
            testID="appointment-identity-header"
          >
            <View style={styles.identityAccent} />
            <View style={styles.identityCopy}>
              <AppText variant="eyebrow" style={styles.identityEyebrow}>
                RENDEZ-VOUS
              </AppText>
              <AppText
                variant="sheetTitle"
                accessibilityRole="header"
                selectable
                style={styles.clientName}
              >
                {clientDisplayName}
              </AppText>
            </View>
          </View>
          <View style={styles.metaSurface}>
            <AppText variant="control" selectable style={styles.dateLine}>
              {formatAppointmentDate(appointment.startAt)}
            </AppText>
            <View style={styles.metaBottomRow}>
              <AppText variant="control" selectable style={styles.timeLine}>
                {formatAppointmentTime(appointment.startAt)} –{" "}
                {formatAppointmentTime(endAt)}
              </AppText>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    isException
                      ? styles.exceptionStatusDot
                      : isTerminal
                        ? styles.completedStatusDot
                        : styles.activeStatusDot,
                  ]}
                />
                <AppText
                  variant="chip"
                  style={
                    isException
                      ? styles.exceptionStatusText
                      : isTerminal
                        ? styles.completedStatusText
                        : styles.activeStatusText
                  }
                >
                  {getAppointmentStatusLabel(appointment.status)}
                </AppText>
              </View>
            </View>
            {appointment.cancellation && (
              <View style={styles.outcomeMetadata}>
                <AppText variant="metadata" style={styles.outcomeActor}>
                  {formatCancellationActorLabel(
                    appointment.cancellation.cancelledBy,
                  )}
                </AppText>
                {appointment.cancellation.reason && (
                  <AppText
                    variant="metadata"
                    selectable
                    style={styles.outcomeReason}
                  >
                    {appointment.cancellation.reason}
                  </AppText>
                )}
              </View>
            )}
          </View>
        </View>

        <SectionHeader
          count={services.length}
          style={styles.sectionHeader}
          title="Prestations"
        />
        <SortableRowList
          entries={services}
          getKey={(service) => service.item.id}
          getLabel={(service) => service.item.serviceName}
          onReorder={reorderServices}
          renderRow={(service, { dragHandle }) => {
            const section = (
              <AppointmentServiceSection
                dragHandle={dragHandle}
                editable={canModify}
                expanded={expandedItemIds.has(service.item.id)}
                service={service}
                onSaveTiming={(updates) => saveServiceTiming(service.item.id, updates)}
                onToggle={() => toggleItem(service.item.id)}
              />
            );
            if (!canRemoveService) return section;
            return (
              <SwipeToDeleteRow
                borderRadius={radii.medium}
                deleteAccessibilityLabel={`Retirer ${service.item.serviceName} du rendez-vous`}
                deleteTestID={`remove-appointment-service-${service.item.id}`}
                hint={swipeHintTarget === `service:${service.item.id}`}
                onDelete={() => removeService(service.item.id)}
                surfaceColor={semanticColors.surfaceLavender}
                testID={`appointment-service-${service.item.id}`}
              >
                {section}
              </SwipeToDeleteRow>
            );
          }}
          sortable={canModify}
        />

        <AppointmentSummary summary={summary} />

        <AppointmentProductsSection
          hintKey={
            swipeHintTarget?.startsWith("product:")
              ? swipeHintTarget.slice("product:".length)
              : undefined
          }
          lines={productLines}
          onDeleteLine={deleteProductLine}
        />

        <AppointmentTicketTotal expectedTotal={expectedTotal} />

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

        <View style={styles.appointmentActions} testID="appointment-actions">
          <AppointmentPrimaryActions
            checkoutLabel={
              appointment.status === "COMPLETED"
                ? "Enregistrer un encaissement"
                : "Encaisser"
            }
            onCheckout={canCheckout ? () => setCheckoutMode("checkout") : undefined}
            onSell={canSellToClient ? openSale : undefined}
          />
          {hasNormalActions && (
            <View
              style={styles.normalActions}
              testID="appointment-normal-actions"
            >
              {canMarkNoShow && (
                <AppButton
                  onPress={() => setActiveSheet("no-show")}
                  style={styles.normalAction}
                  testID="open-no-show"
                  title="Absence"
                  variant="dangerSoft"
                />
              )}
              {canCancel && (
                <AppButton
                  onPress={() => setActiveSheet("cancellation")}
                  style={styles.normalAction}
                  testID="open-cancellation"
                  title="Annuler"
                  variant="dangerSoft"
                />
              )}
              {canModify && (
                <AppButton
                  accessibilityLabel="Modifier le rendez-vous"
                  onPress={() =>
                    router.push({
                      pathname: "/appointments/edit/[appointmentId]",
                      params: { appointmentId: appointment.id },
                    })
                  }
                  style={[
                    styles.normalAction,
                    !canMarkNoShow && !canCancel && styles.onlyNormalAction,
                  ]}
                  testID="modify-appointment"
                  title="Modifier"
                  variant="secondary"
                />
              )}
            </View>
          )}
          <Pressable
            accessibilityHint="Supprime le rendez-vous de l’agenda et de l’historique"
            accessibilityRole="button"
            onPress={requestDeletion}
            style={({ pressed }) => [
              styles.deleteTextAction,
              pressed && styles.deleteTextActionPressed,
            ]}
            testID="open-permanent-deletion"
          >
            <AppText variant="control" style={styles.deleteText}>
              Supprimer
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      <AppointmentCheckoutSheet
        expectation={expectedTotal}
        initialAmounts={checkoutMode === "edit" ? appointment.payment : undefined}
        mode={checkoutMode ?? "checkout"}
        onClose={() => setCheckoutMode(undefined)}
        onConfirm={confirmCheckout}
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
  content: { paddingBottom: spacing["3xl"], paddingTop: spacing.sm },
  appointmentHeader: { paddingBottom: spacing.xl },
  identityHeader: {
    alignItems: "stretch",
    flexDirection: "row",
    marginBottom: spacing.base,
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
    marginLeft: spacing.md,
    minWidth: 0,
  },
  identityEyebrow: { color: rose.rose600 },
  clientName: { color: semanticColors.foreground },
  metaSurface: {
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: "continuous",
    borderRadius: radii.medium,
    padding: spacing.base,
  },
  dateLine: { color: semanticColors.foreground },
  metaBottomRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  timeLine: {
    color: semanticColors.foreground,
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    marginLeft: spacing.sm,
  },
  statusDot: {
    borderRadius: radii.pill,
    height: 6,
    marginRight: spacing.xs,
    width: 6,
  },
  activeStatusDot: { backgroundColor: semanticColors.accent },
  activeStatusText: { color: semanticColors.accent },
  completedStatusDot: { backgroundColor: foregroundSoft },
  completedStatusText: { color: foregroundSoft },
  exceptionStatusDot: { backgroundColor: rose.rose600 },
  exceptionStatusText: { color: rose.rose600 },
  outcomeMetadata: {
    borderTopColor: rose.rose200,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  outcomeActor: { color: rose.rose600 },
  outcomeReason: { color: foregroundSoft },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  notes: {
    marginTop: spacing.xl,
  },
  noteLabel: { color: semanticColors.foreground, marginBottom: spacing.sm },
  appointmentActions: { gap: spacing.sm, marginTop: spacing.xl },
  normalActions: { flexDirection: "row", gap: spacing.sm },
  normalAction: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  onlyNormalAction: { flex: 0, marginLeft: "auto" },
  deleteTextAction: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    minHeight: touchTarget[Platform.OS === "android" ? "android" : "ios"],
    paddingHorizontal: spacing.md,
  },
  deleteTextActionPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  deleteText: { color: rose.rose600 },
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
