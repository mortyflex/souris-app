// Souris — Client Profile
//
// A compact client dashboard: identity + `Vendre un produit` + today's
// birthday reminder + next appointment + derived activity + ONE switchable
// history preview (Rendez-vous | Produits achetés, 3 records at most, the
// complete histories on their own pushed screens) + contact + notes. Nothing
// here is stored on the Client — activity is derived from Appointment state
// and purchases from Sale snapshots through clientId. Modifier opens the SAME
// Client form used for creation (edit mode). No dashboard KPIs, no fake
// metrics, no edit/delete traps.
//
// Lifecycle: an active Client carries a tertiary `Archiver la cliente`
// management action; an archived Client shows a subtle `Archivée`
// indicator, `Réactiver la cliente` as her lifecycle action, no new business
// action (`Vendre un produit` is hidden), and the tertiary destructive
// `Supprimer définitivement`, which the database refuses while any
// Appointment or Sale references her. History is never hidden.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import {
  formatClientBirthday,
  getClientDisplayName,
  getClientInitial,
  isClientArchived,
} from '@/domain/clients';
import type { Appointment } from '@/domain/appointments';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import { ARCHIVED_CLIENT_LABEL } from '@/features/clients/presentation';
import { BirthdayConfetti } from '@/features/clients/birthday/BirthdayConfetti';
import { BirthdayNotice } from '@/features/clients/birthday/BirthdayNotice';
import {
  PROFILE_BIRTHDAY_SUGGESTION,
  PROFILE_BIRTHDAY_TITLE,
  formatBirthdayMessage,
  formatProfileBirthdayAccessibilityLabel,
} from '@/features/clients/birthday/presentation';
import { useBirthdayCelebration } from '@/features/clients/birthday/use-birthday-celebration';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import {
  formatAppointmentDate,
  formatAppointmentServiceSummary,
  formatAppointmentTime,
  formatPrice,
  getAppointmentEnd,
} from '@/features/appointments/presentation';
import { getClientSales } from '@/features/sales/presentation';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { ClientDeleteConflictError } from '@/persistence/stores/clients';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { birthdayIcon } from '@/shared/icons/birthday-icon';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { saleIcon } from '@/shared/icons/sale-icon';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SectionHeader } from '@/shared/ui/SectionHeader';
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

import { ClientDeletionDialog, type ClientDeletionDialogMode } from './components/ClientDeletionDialog';
import { ClientHistorySection } from './components/ClientHistorySection';
import { getClientActivitySummary, getClientAppointmentTimeline } from './presentation';

const metricIcons = {
  completed: { ios: 'calendar', android: 'calendar_today' },
  spent: { ios: 'creditcard', android: 'credit_card' },
  noShow: { ios: 'person.fill.xmark', android: 'person_off' },
  cancelled: { ios: 'xmark.circle', android: 'cancel' },
} as const satisfies Record<string, PlatformSymbolName>;

interface ClientProfileScreenProps {
  readonly clientId?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ClientProfileScreen({ clientId }: ClientProfileScreenProps) {
  const router = useRouter();
  const {
    getClientById,
    archiveClient,
    restoreClient,
    getClientDeletionEligibility,
    deleteClientPermanently,
  } = useClientSession();
  const { appointments } = useAppointmentSession();
  const { sales } = useSaleSession();
  const [editVisible, setEditVisible] = useState(false);
  const [deletionMode, setDeletionMode] = useState<ClientDeletionDialogMode>();
  const [deletedByCurrentScreen, setDeletedByCurrentScreen] = useState(false);
  const client = getClientById(clientId);
  // Today's birthday: a static reminder card, plus ONE short celebration per
  // entry into this screen (per mount — never per render).
  const birthdayCelebration = useBirthdayCelebration(client);

  if (!client) {
    if (deletedByCurrentScreen) return null;

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
  const purchases = getClientSales(sales, client.id);
  const hasContactInfo = Boolean(client.phone || client.email || client.birthday);
  const archived = isClientArchived(client);

  const openSale = () => {
    router.push({ pathname: '/sales/new', params: { clientId: client.id } });
  };

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

  const archive = () => {
    if (!persist(() => archiveClient(client.id))) return;
    haptics.selection();
  };

  const restore = () => {
    if (!persist(() => restoreClient(client.id))) return;
    haptics.success();
  };

  // The stored references decide — never the in-memory collections — so the
  // professional is never offered a confirmation that cannot succeed.
  const openPermanentDeletion = () => {
    try {
      const eligibility = getClientDeletionEligibility(client.id);
      setDeletionMode(eligibility.deletable ? 'confirm' : 'blocked');
    } catch {
      alertPersistenceFailure();
    }
  };

  const deletePermanently = () => {
    setDeletionMode(undefined);
    try {
      deleteClientPermanently(client.id);
    } catch (error) {
      if (error instanceof ClientDeleteConflictError) {
        setDeletionMode('blocked');
      } else {
        alertPersistenceFailure();
      }
      return;
    }
    setDeletedByCurrentScreen(true);
    haptics.warning();
    router.back();
  };

  const openAppointment = (appointmentId: string) => {
    router.push({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId },
    });
  };

  const openAppointmentHistory = () => {
    router.push({ pathname: '/clients/appointments/[clientId]', params: { clientId: client.id } });
  };

  const openPurchaseHistory = () => {
    router.push({ pathname: '/clients/purchases/[clientId]', params: { clientId: client.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={[styles.topBar, { paddingHorizontal: horizontalGutter }]}>
        <GlassIconButton
          accessibilityLabel="Retour"
          icon={glassIcons.back}
          onPress={() => router.back()}
        />
        <AppText
          accessibilityRole="header"
          pointerEvents="none"
          variant="control"
          style={styles.topBarTitle}
        >
          Cliente
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
          {archived && (
            <View style={styles.archivedBadge} testID="client-archived-indicator">
              <AppText variant="chip" style={styles.archivedBadgeText}>
                {ARCHIVED_CLIENT_LABEL}
              </AppText>
            </View>
          )}
          <View style={styles.clientActions}>
            {archived ? (
              <AppButton
                accessibilityLabel="Réactiver la cliente"
                onPress={restore}
                style={styles.clientAction}
                testID="restore-client"
                title="Réactiver la cliente"
                variant="secondary"
              />
            ) : (
              <AppButton
                accessibilityLabel="Vendre un produit"
                icon={saleIcon}
                onPress={openSale}
                style={styles.clientAction}
                testID="sell-product"
                title="Vendre un produit"
                variant="secondary"
              />
            )}
          </View>
        </View>

        {birthdayCelebration.isBirthday && (
          <View style={styles.birthdaySection}>
            <BirthdayNotice
              accessibilityLabel={formatProfileBirthdayAccessibilityLabel(client)}
              messages={[formatBirthdayMessage(client, 'TODAY'), PROFILE_BIRTHDAY_SUGGESTION]}
              testID="client-birthday-notice"
              title={PROFILE_BIRTHDAY_TITLE}
            />
          </View>
        )}

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
          <GroupedSurface>
            <View style={styles.metricsRow}>
              <Metric
                icon={metricIcons.completed}
                label="Rendez-vous réalisés"
                testID="metric-completed"
                value={String(activity.completedAppointmentCount)}
              />
              <View style={styles.metricsColumnDivider} />
              <Metric
                icon={metricIcons.spent}
                label="Total dépensé"
                testID="metric-spent"
                value={formatPrice(activity.totalSpent)}
              />
            </View>
            <View style={styles.metricsDivider} />
            <View style={styles.metricsRow}>
              <Metric
                icon={metricIcons.noShow}
                label="Absences"
                testID="metric-noshow"
                value={String(activity.noShowAppointmentCount)}
              />
              <View style={styles.metricsColumnDivider} />
              <Metric
                icon={metricIcons.cancelled}
                label="Annulations"
                testID="metric-cancelled"
                value={String(activity.cancelledAppointmentCount)}
              />
            </View>
          </GroupedSurface>
        </View>

        <View style={styles.historySection}>
          <ClientHistorySection
            appointments={getClientAppointmentTimeline(activity)}
            onOpenAppointment={openAppointment}
            onOpenAppointmentHistory={openAppointmentHistory}
            onOpenPurchaseHistory={openPurchaseHistory}
            purchases={purchases}
          />
        </View>

        {hasContactInfo && (
          <View style={styles.infoSection}>
            <SectionHeader style={styles.sectionHeader} title="Informations" />
            <View style={styles.infoSurface}>
              <InfoRow label="Téléphone" value={client.phone} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow
                icon={birthdayIcon}
                label="Anniversaire"
                value={client.birthday ? formatClientBirthday(client.birthday) : undefined}
              />
            </View>
          </View>
        )}

        {client.notes !== undefined && (
          <View style={styles.infoSection} testID="client-notes-section">
            <SectionHeader style={styles.sectionHeader} title="Notes" />
            <View style={styles.notesSurface}>
              <AppText variant="body" selectable style={styles.notesText} testID="client-notes">
                {client.notes}
              </AppText>
            </View>
          </View>
        )}

        <View style={styles.managementSection} testID="client-management">
          {archived ? (
            <Pressable
              accessibilityHint="Supprime la cliente si aucun rendez-vous ni aucune vente ne la concerne"
              accessibilityRole="button"
              onPress={openPermanentDeletion}
              style={({ pressed }) => [styles.textAction, pressed && styles.textActionPressed]}
              testID="open-client-deletion"
            >
              <AppText variant="control" style={styles.destructiveText}>
                Supprimer définitivement
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityHint="La cliente ne sera plus proposée pour les nouveaux rendez-vous et ventes. Son historique est conservé."
              accessibilityRole="button"
              onPress={archive}
              style={({ pressed }) => [styles.textAction, pressed && styles.textActionPressed]}
              testID="archive-client"
            >
              <AppText variant="control" style={styles.managementText}>
                Archiver la cliente
              </AppText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {birthdayCelebration.confettiVisible && (
        <BirthdayConfetti onFinished={birthdayCelebration.onConfettiFinished} />
      )}

      <ClientFormSheet
        client={client}
        mode="edit"
        onClose={() => setEditVisible(false)}
        onSubmitted={() => setEditVisible(false)}
        visible={editVisible}
      />
      <ClientDeletionDialog
        mode={deletionMode}
        onClose={() => setDeletionMode(undefined)}
        onConfirm={deletePermanently}
      />
    </SafeAreaView>
  );
}

function Metric({
  icon,
  label,
  value,
  testID,
}: {
  readonly icon: PlatformSymbolName;
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.metric}>
      <View style={styles.metricIcon}>
        <SymbolView name={icon} size={16} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.metricCopy}>
        <AppText
          adjustsFontSizeToFit
          numberOfLines={1}
          variant="summaryValue"
          style={styles.metricValue}
          testID={testID}
        >
          {value}
        </AppText>
        <AppText variant="metadata" numberOfLines={2} style={styles.metricLabel}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

interface InfoRowProps {
  readonly label: string;
  readonly value?: string;
  /** Optional glyph shown before the value (the birthday cake of the directory row). */
  readonly icon?: PlatformSymbolName;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  if (!value) return null;

  return (
    <View style={styles.infoRow}>
      <AppText variant="metadata" style={styles.infoLabel}>
        {label}
      </AppText>
      {icon !== undefined && <SymbolView name={icon} size={16} tintColor={semanticColors.accent} />}
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

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    minHeight: 60,
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  // Centred on the whole bar whatever the width of « Modifier ».
  topBarTitle: {
    color: semanticColors.foreground,
    left: 0,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    zIndex: -1,
  },
  modifyAction: { paddingHorizontal: spacing.md },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.base },
  identity: { gap: spacing.sm, marginBottom: spacing.xl },
  clientActions: { flexDirection: 'row', marginTop: spacing.xs },
  clientAction: { flex: 1 },
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
  archivedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.surface,
    borderRadius: radii.pill,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  archivedBadgeText: { color: foregroundSoft },
  sectionHeader: { marginBottom: spacing.sm },
  birthdaySection: { marginBottom: spacing.xl },
  nextSection: { marginBottom: spacing.xl },
  nextRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: 'continuous',
    borderRadius: radii.large,
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
  metricsRow: { flexDirection: 'row' },
  metricsDivider: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.base,
  },
  metricsColumnDivider: {
    backgroundColor: semanticColors.borderSubtle,
    marginVertical: spacing.md,
    width: StyleSheet.hairlineWidth,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  metricIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  metricCopy: { flex: 1, gap: 2, minWidth: 0 },
  metricValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  metricLabel: { color: foregroundSoft },
  historySection: { marginBottom: spacing.xl },
  infoSection: { marginBottom: spacing.xl },
  infoSurface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  notesSurface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    padding: spacing.base,
  },
  notesText: { color: semanticColors.foreground },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
  },
  infoLabel: { color: foregroundSoft, width: 128 },
  infoValue: { color: semanticColors.foreground, flex: 1, fontVariant: ['tabular-nums'] },
  managementSection: { alignItems: 'center', marginTop: spacing['2xl'] },
  textAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: spacing.md,
  },
  textActionPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  managementText: { color: foregroundSoft },
  destructiveText: { color: rose.rose600 },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
