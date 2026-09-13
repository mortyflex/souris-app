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
  canEditAppointmentPayment,
  canMarkAppointmentNoShow,
  cancelAppointment,
  completeAppointment,
  markAppointmentNoShow,
  shouldAutoCompleteAppointment,
  type AppointmentPaymentAmounts,
} from "@/domain/appointments";
import { isClientArchived } from "@/domain/clients";
import {
  AppointmentCheckoutSheet,
  type AppointmentCheckoutMode,
} from "@/features/appointments/checkout/AppointmentCheckoutSheet";
import { getCheckoutExpectation } from "@/features/appointments/checkout/checkout-form";
import { useAppointmentSession } from "@/features/appointments/session/AppointmentSessionProvider";
import { getResolvedClientDisplayName } from "@/features/clients/presentation";
import { useClientSession } from "@/features/clients/session/ClientSessionProvider";
import {
  getAppointmentSaleLines,
  getAppointmentSalesTotal,
} from "@/features/sales/presentation";
import { useSaleSession } from "@/features/sales/session/SaleSessionProvider";
import { alertPersistenceFailure } from "@/providers/persistence-failure";
import { haptics } from "@/shared/lib/haptics";
import { AppButton } from "@/shared/ui/AppButton";
import { AppText } from "@/shared/ui/AppText";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { SheetScreen } from "@/shared/ui/SheetScreen";
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
    updateAppointment,
    updateAppointmentPayment,
  } = useAppointmentSession();
  const { getClientById } = useClientSession();
  const { sales } = useSaleSession();
  const entry = getAppointmentById(appointmentId);

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
  const productLines = getAppointmentSaleLines(sales, appointment.id);
  const productsTotal = getAppointmentSalesTotal(sales, appointment.id);
  const endAt = getAppointmentEnd(appointment);
  const isTerminal = isTerminalAppointmentStatus(appointment.status);
  const isException =
    appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";
  const canCheckout = canCheckoutAppointment(appointment, now);
  const canEditPayment = canEditAppointmentPayment(appointment);
  const canCancel = canCancelAppointment(appointment);
  const canMarkNoShow = canMarkAppointmentNoShow(appointment, now);
  const canModify = !isTerminal;
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
        {services.map((service) => (
          <AppointmentServiceSection
            key={service.item.id}
            expanded={expandedItemIds.has(service.item.id)}
            service={service}
            onToggle={() => toggleItem(service.item.id)}
          />
        ))}

        <AppointmentSummary summary={summary} />

        <AppointmentProductsSection lines={productLines} total={productsTotal} />

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
        expectation={getCheckoutExpectation(appointment, sales)}
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
