import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  canCancelAppointment,
  canCompleteAppointment,
  canMarkAppointmentNoShow,
  cancelAppointment,
  completeAppointment,
  markAppointmentNoShow,
  shouldAutoCompleteAppointment,
} from '@/domain/appointments';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { haptics } from '@/shared/lib/haptics';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

import { AppointmentServiceSection } from './components/AppointmentServiceSection';
import { AppointmentSummary } from './components/AppointmentSummary';
import { AppointmentDeletionDialog } from './components/AppointmentDeletionDialog';
import {
  AppointmentCancellationSheet,
  AppointmentNoShowSheet,
} from './components/AppointmentLifecycleSheets';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatCancellationActorLabel,
  getAppointmentDetailServices,
  getAppointmentDetailSummary,
  getAppointmentEnd,
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from './presentation';

interface AppointmentDetailsScreenProps {
  readonly appointmentId?: string;
}

export function AppointmentDetailsScreen({ appointmentId }: AppointmentDetailsScreenProps) {
  const router = useRouter();
  const [expandedItemIds, setExpandedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const [activeSheet, setActiveSheet] = useState<'cancellation' | 'no-show'>();
  const [deletionVisible, setDeletionVisible] = useState(false);
  const [deletedByCurrentScreen, setDeletedByCurrentScreen] = useState(false);
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const { deleteAppointment, getAppointmentById, updateAppointment } = useAppointmentSession();
  const { getClientById } = useClientSession();
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

  const { appointment } = entry;
  const clientDisplayName = getResolvedClientDisplayName(getClientById(appointment.clientId));
  const services = getAppointmentDetailServices(appointment);
  const summary = getAppointmentDetailSummary(appointment);
  const endAt = getAppointmentEnd(appointment);
  const isTerminal = isTerminalAppointmentStatus(appointment.status);
  const isException = appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW';
  const canComplete = canCompleteAppointment(appointment, now);
  const canCancel = canCancelAppointment(appointment);
  const canMarkNoShow = canMarkAppointmentNoShow(appointment, now);
  const canModify = !isTerminal;
  const hasNormalActions = canMarkNoShow || canCancel || canModify;

  const complete = () => {
    const nextAppointment = completeAppointment(appointment, new Date());
    if (nextAppointment === appointment) return;
    updateAppointment({ appointment: nextAppointment });
    haptics.success();
  };

  const finalizePreviousDayBeforeException = (transitionNow: Date): boolean => {
    if (!shouldAutoCompleteAppointment(appointment, transitionNow)) return false;
    updateAppointment({
      appointment: completeAppointment(appointment, transitionNow),
    });
    setActiveSheet(undefined);
    return true;
  };

  const cancel = (actor: 'CLIENT' | 'BUSINESS', reason?: string) => {
    const transitionNow = new Date();
    if (finalizePreviousDayBeforeException(transitionNow)) return;
    const nextAppointment = cancelAppointment(appointment, actor, transitionNow, reason);
    if (nextAppointment === appointment) return;
    updateAppointment({ appointment: nextAppointment });
    setActiveSheet(undefined);
    haptics.warning();
  };

  const markNoShow = () => {
    const transitionNow = new Date();
    if (finalizePreviousDayBeforeException(transitionNow)) return;
    const nextAppointment = markAppointmentNoShow(appointment, transitionNow);
    if (nextAppointment === appointment) return;
    updateAppointment({ appointment: nextAppointment });
    setActiveSheet(undefined);
    haptics.warning();
  };

  const deletePermanently = () => {
    setDeletedByCurrentScreen(true);
    setDeletionVisible(false);
    deleteAppointment(appointment.id);
    haptics.warning();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      >
        <View style={styles.appointmentHeader}>
          <View style={styles.identityHeader} testID="appointment-identity-header">
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
                {formatAppointmentTime(appointment.startAt)} – {formatAppointmentTime(endAt)}
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
                  {formatCancellationActorLabel(appointment.cancellation.cancelledBy)}
                </AppText>
                {appointment.cancellation.reason && (
                  <AppText variant="metadata" selectable style={styles.outcomeReason}>
                    {appointment.cancellation.reason}
                  </AppText>
                )}
              </View>
            )}
          </View>
        </View>

        <SectionHeader count={services.length} style={styles.sectionHeader} title="Prestations" />
        {services.map((service) => (
          <AppointmentServiceSection
            key={service.item.id}
            expanded={expandedItemIds.has(service.item.id)}
            service={service}
            onToggle={() => toggleItem(service.item.id)}
          />
        ))}

        <AppointmentSummary summary={summary} />

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

        <View style={styles.appointmentActions} testID="appointment-actions">
          {canComplete && (
            <AppButton
              onPress={complete}
              style={styles.fullWidthAction}
              testID="complete-appointment"
              title="Terminer"
            />
          )}
          {hasNormalActions && (
            <View style={styles.normalActions} testID="appointment-normal-actions">
              {canMarkNoShow && (
                <AppButton
                  onPress={() => setActiveSheet('no-show')}
                  style={styles.normalAction}
                  testID="open-no-show"
                  title="Absence"
                  variant="dangerSoft"
                />
              )}
              {canCancel && (
                <AppButton
                  onPress={() => setActiveSheet('cancellation')}
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
                      pathname: '/appointments/edit/[appointmentId]',
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
            onPress={() => setDeletionVisible(true)}
            style={({ pressed }) => [
              styles.deleteTextAction,
              pressed && styles.deleteTextActionPressed,
            ]}
            testID="open-permanent-deletion"
          >
            <AppText variant="control" style={styles.deleteText}>
              Supprimer définitivement
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      <AppointmentCancellationSheet
        clientName={clientDisplayName}
        onClose={() => setActiveSheet(undefined)}
        onConfirm={cancel}
        visible={!isTerminal && activeSheet === 'cancellation'}
      />
      <AppointmentNoShowSheet
        clientName={clientDisplayName}
        onClose={() => setActiveSheet(undefined)}
        onConfirm={markNoShow}
        visible={!isTerminal && activeSheet === 'no-show'}
      />
      <AppointmentDeletionDialog
        onClose={() => setDeletionVisible(false)}
        onConfirm={deletePermanently}
        visible={deletionVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.base },
  appointmentHeader: { paddingBottom: spacing.xl },
  identityHeader: { alignItems: 'stretch', flexDirection: 'row', marginBottom: spacing.base },
  identityAccent: {
    alignSelf: 'stretch',
    backgroundColor: rose.rose600,
    borderRadius: radii.pill,
    width: 4,
  },
  identityCopy: { flex: 1, gap: spacing.xs, justifyContent: 'center', marginLeft: spacing.md, minWidth: 0 },
  identityEyebrow: { color: rose.rose600 },
  clientName: { color: semanticColors.foreground },
  metaSurface: {
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    padding: spacing.base,
  },
  dateLine: { color: semanticColors.foreground },
  metaBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  timeLine: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  statusRow: { alignItems: 'center', flexDirection: 'row', marginLeft: spacing.sm },
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
  fullWidthAction: { alignSelf: 'stretch' },
  normalActions: { flexDirection: 'row', gap: spacing.sm },
  normalAction: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  onlyNormalAction: { flex: 0, marginLeft: 'auto' },
  deleteTextAction: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: spacing.md,
  },
  deleteTextActionPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  deleteText: { color: rose.rose600 },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
