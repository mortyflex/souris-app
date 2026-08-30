// Souris — Client Profile
//
// A full business record, intentionally light: identity + contact +
// next appointment + derived activity + Souris Appointment history.
// Nothing here is stored on the Client — activity is always derived from
// Appointment state. Modifier opens the SAME Client form used for creation
// (edit mode). No dashboard KPIs, no fake metrics, no edit/delete traps.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import {
  formatClientBirthDate,
  getClientDisplayName,
  getClientInitial,
} from '@/domain/clients';
import type { Appointment } from '@/domain/appointments';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import {
  formatAppointmentDate,
  formatAppointmentServiceSummary,
  formatAppointmentTime,
  formatCancellationActorLabel,
  formatPrice,
  getAppointmentEnd,
  getAppointmentSnapshotTotal,
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from '@/features/appointments/presentation';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { getClientActivitySummary } from './presentation';

interface ClientProfileScreenProps {
  readonly clientId?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ClientProfileScreen({ clientId }: ClientProfileScreenProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { appointments } = useAppointmentSession();
  const [editVisible, setEditVisible] = useState(false);
  const client = getClientById(clientId);

  if (!client) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Cliente introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Cette cliente n&apos;existe plus.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const activity = getClientActivitySummary(appointments, client.id);
  const hasContactInfo = Boolean(client.phone || client.email || client.birthDate);

  const openAppointment = (appointmentId: string) => {
    router.push({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={[styles.topBar, { paddingHorizontal: horizontalGutter }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedControl]}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={18}
            tintColor={semanticColors.foreground}
          />
        </Pressable>
        <AppText variant="eyebrow" style={styles.topBarEyebrow}>
          CLIENTE
        </AppText>
        <AppButton
          accessibilityLabel="Modifier la cliente"
          onPress={() => setEditVisible(true)}
          style={styles.modifyAction}
          testID="edit-client"
          title="Modifier"
          variant="tertiary"
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AppText variant="screenTitle" style={styles.avatarText}>
              {getClientInitial(client)}
            </AppText>
          </View>
          <AppText
            variant="screenTitle"
            accessibilityRole="header"
            selectable
            style={styles.clientName}
          >
            {getClientDisplayName(client)}
          </AppText>
        </View>

        {activity.nextAppointment && (
          <View style={styles.nextSection}>
            <SectionHeader style={styles.sectionHeader} title="Prochain rendez-vous" />
            <NextAppointmentRow
              appointment={activity.nextAppointment.appointment}
              onPress={() => openAppointment(activity.nextAppointment?.appointment.id ?? '')}
            />
          </View>
        )}

        <View style={styles.activitySection}>
          <SectionHeader style={styles.sectionHeader} title="Activité" />
          <View style={styles.metricsSurface}>
            <View style={styles.metricsRow}>
              <Metric
                label="Rendez-vous réalisés"
                testID="metric-completed"
                value={String(activity.completedAppointmentCount)}
              />
              <Metric
                label="Total dépensé"
                testID="metric-spent"
                value={formatPrice(activity.totalSpent)}
              />
            </View>
            <View style={styles.metricsDivider} />
            <View style={styles.metricsRow}>
              <Metric
                label="Absences"
                testID="metric-noshow"
                value={String(activity.noShowAppointmentCount)}
              />
              <Metric
                label="Annulations"
                testID="metric-cancelled"
                value={String(activity.cancelledAppointmentCount)}
              />
            </View>
          </View>
        </View>

        {hasContactInfo && (
          <View style={styles.infoSection}>
            <SectionHeader style={styles.sectionHeader} title="Informations" />
            <View style={styles.infoSurface}>
              <InfoRow label="Téléphone" value={client.phone} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow
                label="Date de naissance"
                value={client.birthDate ? formatClientBirthDate(client.birthDate) : undefined}
              />
            </View>
          </View>
        )}

        <View style={styles.appointmentsSection}>
          <SectionHeader
            count={activity.appointmentCount}
            style={styles.sectionHeader}
            title="Rendez-vous"
          />
          {activity.appointmentCount === 0 ? (
            <AppText variant="metadata" style={styles.emptyHistory}>
              Aucun rendez-vous enregistré.
            </AppText>
          ) : (
            <View style={styles.appointmentGroups}>
              {activity.upcomingAppointments.length > 0 && (
                <View style={styles.appointmentGroup}>
                  <AppText variant="eyebrow" style={styles.groupLabel}>
                    À VENIR
                  </AppText>
                  {activity.upcomingAppointments.map(({ appointment }) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      onPress={() => openAppointment(appointment.id)}
                    />
                  ))}
                </View>
              )}
              {activity.historicalAppointments.length > 0 && (
                <View style={styles.appointmentGroup}>
                  <AppText variant="eyebrow" style={styles.groupLabel}>
                    HISTORIQUE
                  </AppText>
                  {activity.historicalAppointments.map(({ appointment }) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      onPress={() => openAppointment(appointment.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <ClientFormSheet
        client={client}
        mode="edit"
        onClose={() => setEditVisible(false)}
        onSubmitted={() => setEditVisible(false)}
        visible={editVisible}
      />
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View style={styles.metric}>
      <AppText variant="summaryValue" style={styles.metricValue} testID={testID}>
        {value}
      </AppText>
      <AppText variant="metadata" style={styles.metricLabel}>
        {label}
      </AppText>
    </View>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value?: string }) {
  if (!value) return null;

  return (
    <View style={styles.infoRow}>
      <AppText variant="metadata" style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText variant="control" numberOfLines={1} selectable style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

interface NextAppointmentRowProps {
  readonly appointment: Appointment;
  readonly onPress: () => void;
}

function NextAppointmentRow({ appointment, onPress }: NextAppointmentRowProps) {
  const endAt = getAppointmentEnd(appointment);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Prochain rendez-vous le ${formatAppointmentDate(appointment.startAt)} à ${formatAppointmentTime(appointment.startAt)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.nextRow, pressed && styles.nextRowPressed]}
    >
      <View style={styles.nextCopy}>
        <AppText variant="control" style={styles.nextTimeLine}>
          {`${formatAppointmentDate(appointment.startAt)} · ${formatAppointmentTime(appointment.startAt)} – ${formatAppointmentTime(endAt)}`}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.nextSummary}>
          {formatAppointmentServiceSummary(appointment)}
        </AppText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );
}

interface AppointmentRowProps {
  readonly appointment: Appointment;
  readonly onPress: () => void;
}

function AppointmentRow({ appointment, onPress }: AppointmentRowProps) {
  const statusLabel =
    appointment.status === 'CANCELLED' && appointment.cancellation
      ? formatCancellationActorLabel(appointment.cancellation.cancelledBy)
      : isTerminalAppointmentStatus(appointment.status)
        ? getAppointmentStatusLabel(appointment.status)
        : undefined;
  const isException = appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        `Rendez-vous du ${formatAppointmentDate(appointment.startAt)} à ${formatAppointmentTime(appointment.startAt)}`,
        formatAppointmentServiceSummary(appointment),
        statusLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.appointmentRow, pressed && styles.appointmentRowPressed]}
    >
      <View style={styles.appointmentCopy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.appointmentTitle}>
          {formatAppointmentServiceSummary(appointment)}
        </AppText>
        <View style={styles.appointmentMetaRow}>
          <AppText variant="metadata" style={styles.appointmentMeta}>
            {`${formatAppointmentDate(appointment.startAt)} · ${formatAppointmentTime(appointment.startAt)}`}
          </AppText>
          {statusLabel && (
            <AppText
              variant="metadata"
              style={isException ? styles.exceptionStatus : styles.completedStatus}
            >
              {` · ${statusLabel}`}
            </AppText>
          )}
        </View>
      </View>
      <AppText variant="metadata" style={styles.appointmentPrice}>
        {formatPrice(getAppointmentSnapshotTotal(appointment))}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: radii.small,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressedControl: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  topBarEyebrow: { color: semanticColors.accent },
  modifyAction: { paddingHorizontal: spacing.md },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.base },
  identity: { gap: spacing.sm, marginBottom: spacing.xl },
  avatar: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.large,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: { color: semanticColors.accent, fontSize: 24, lineHeight: 28 },
  clientName: { color: semanticColors.foreground },
  sectionHeader: { marginBottom: spacing.sm },
  nextSection: { marginBottom: spacing.xl },
  nextRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose200,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 68,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  nextRowPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  nextCopy: { flex: 1, gap: 2, minWidth: 0 },
  nextTimeLine: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  nextSummary: { color: foregroundSoft },
  activitySection: { marginBottom: spacing.xl },
  metricsSurface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  metricsRow: { flexDirection: 'row' },
  metricsDivider: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  metric: { flex: 1, gap: spacing.xs },
  metricValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  metricLabel: { color: foregroundSoft },
  infoSection: { marginBottom: spacing.xl },
  infoSurface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
  },
  infoLabel: { color: foregroundSoft, width: 128 },
  infoValue: { color: semanticColors.foreground, flex: 1, fontVariant: ['tabular-nums'] },
  appointmentsSection: {},
  appointmentGroups: { gap: spacing.md },
  appointmentGroup: { gap: spacing.xs },
  groupLabel: { color: foregroundSoft, marginBottom: spacing.xs },
  appointmentRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  appointmentRowPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  appointmentCopy: { flex: 1, gap: 2, minWidth: 0 },
  appointmentTitle: { color: semanticColors.foreground },
  appointmentMetaRow: { flexDirection: 'row' },
  appointmentMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  completedStatus: { color: foregroundSoft },
  exceptionStatus: { color: rose.rose600 },
  appointmentPrice: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
  emptyHistory: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.large,
    color: foregroundSoft,
    padding: spacing.base,
  },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
