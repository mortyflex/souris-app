// BeautIzzy — Client Profile
//
// A client profile read top-down: a centred identity (portrait ClientAvatar,
// editable in place through ClientPhotoControl, over the name, the phone and
// the email) + a compact row of quick-action tiles (`Nouveau rendez-vous`,
// `Vendre un produit`) + today's birthday reminder + next appointment + the
// derived activity as four small stat cards + ONE switchable history preview
// (Rendez-vous | Produits achetés, 3 records at most, the complete histories
// on their own pushed screens) + the remaining information + notes. Nothing here is
// stored on the Client — activity is derived from Appointment state (and,
// for « Total dépensé », the client's paid Sales) and
// purchases from Sale snapshots through clientId. No dashboard KPIs, no fake
// metrics, no edit/delete traps.
//
// The two daily actions open the EXISTING flows with this Client preselected
// (`/appointments/new` and `/sales/new`, `clientId` param): nothing is
// created until the professional confirms inside them.
//
// Administration lives behind « ••• » (the shared DetailActionsSheet, like
// Product and Calendar Block details) and runs once the drawer is gone:
// `Modifier` opens the SAME Client form used for creation (edit mode), then
// the lifecycle action in rose — `Archiver la cliente` on an active Client,
// `Supprimer définitivement` on an archived one (refused by the database
// while any Appointment or Sale references her). Both ask first on the shared
// ConfirmationDialog: archiving is reversible (accent `neutral` tone, like
// Product « Désactiver »), permanent deletion stays destructive.
//
// Lifecycle: an archived Client shows a subtle `Archivée` indicator and
// `Réactiver la cliente` in place of the daily actions (she is offered for no
// new appointment or sale). History is never hidden.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import {
  formatClientBirthday,
  getClientDisplayName,
  isClientArchived,
} from '@/domain/clients';
import type { Appointment } from '@/domain/appointments';
import { ClientPhotoControl } from '@/features/clients/photo/ClientPhotoControl';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { ClientFormSheet } from '@/features/clients/creation/ClientFormSheet';
import {
  ARCHIVED_CLIENT_LABEL,
  formatClientSmsConsentStatus,
  SMS_CONSENT_FIELD_LABEL,
} from '@/features/clients/presentation';
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
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import type { DetailAction } from '@/shared/ui/ActionGroup';
import { DetailActionsSheet } from '@/shared/ui/DetailActionsSheet';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { ClientDeletionDialog, type ClientDeletionDialogMode } from './components/ClientDeletionDialog';
import { ClientHistorySection } from './components/ClientHistorySection';
import { ProfileQuickAction } from './components/ProfileQuickAction';
import { ProfileStatCard } from './components/ProfileStatCard';
import { getClientActivitySummary, getClientAppointmentTimeline } from './presentation';

const metricIcons = {
  completed: { ios: 'calendar', android: 'calendar_today' },
  spent: { ios: 'creditcard', android: 'credit_card' },
  noShow: { ios: 'person.fill.xmark', android: 'person_off' },
  cancelled: { ios: 'xmark.circle', android: 'cancel' },
} as const satisfies Record<string, PlatformSymbolName>;

/** The profile portrait frame: 80 × 80, large enough for a real photo. */
const profileAvatarSize = spacing.lg * 4;

// The calendar glyph is the one of « Nouveau rendez-vous » in the Agenda.
const newAppointmentIcon = {
  ios: 'calendar.badge.plus',
  android: 'event',
} as const satisfies PlatformSymbolName;

type ClientAdminAction = 'modify' | 'archive' | 'delete';

const modifyAction: DetailAction<ClientAdminAction> = {
  key: 'modify',
  label: 'Modifier',
  icon: { ios: 'pencil', android: 'edit' },
  tone: 'normal',
  testID: 'edit-client',
  accessibilityHint: 'Modifie l’identité, le contact, l’anniversaire et les notes',
};

const activeClientActionGroups: readonly (readonly DetailAction<ClientAdminAction>[])[] = [
  [modifyAction],
  [
    {
      key: 'archive',
      label: 'Archiver le client',
      icon: { ios: 'archivebox', android: 'archive' },
      tone: 'destructive',
      testID: 'archive-client',
      accessibilityHint:
        'Ce client ne sera plus proposé pour les nouveaux rendez-vous et ventes. Son historique est conservé.',
    },
  ],
];

const archivedClientActionGroups: readonly (readonly DetailAction<ClientAdminAction>[])[] = [
  [modifyAction],
  [
    {
      key: 'delete',
      label: 'Supprimer définitivement',
      icon: { ios: 'trash', android: 'delete' },
      tone: 'destructive',
      testID: 'open-client-deletion',
      accessibilityHint: 'Supprime le client si aucun rendez-vous ni aucune vente ne le concerne',
    },
  ],
];

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
  const [actionsVisible, setActionsVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<ClientAdminAction>();
  const [deletionMode, setDeletionMode] = useState<ClientDeletionDialogMode>();
  const [archiveConfirmationVisible, setArchiveConfirmationVisible] = useState(false);
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
          <AppText variant="stateTitle">Client introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce client n&apos;existe plus.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const activity = getClientActivitySummary(appointments, sales, client.id);
  const purchases = getClientSales(sales, client.id);
  // Phone and email live in the identity block; the rest stays below.
  const hasMoreInfo = Boolean(client.birthday || client.smsMarketingConsent);
  const archived = isClientArchived(client);

  const openAppointmentCreation = () => {
    router.push({ pathname: '/appointments/new', params: { clientId: client.id } });
  };

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
    setArchiveConfirmationVisible(false);
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

  // Runs once the « ••• » drawer is gone, so no sheet or dialog races it.
  const runAdminAction = () => {
    const action = pendingAction;
    setPendingAction(undefined);
    if (action === 'modify') setEditVisible(true);
    if (action === 'archive') setArchiveConfirmationVisible(true);
    if (action === 'delete') openPermanentDeletion();
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
          Fiche client
        </AppText>
        <GlassIconButton
          accessibilityLabel="Actions"
          icon={glassIcons.more}
          onPress={() => setActionsVisible(true)}
          testID="open-client-actions"
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      >
        {/* The portrait frame over the name: the Client's photo or the
            initials in the very same frame; tapping it manages the photo. */}
        <View style={styles.identity} testID="client-identity">
          <ClientPhotoControl client={client} size={profileAvatarSize} />
          {/* One step under the screen title: prominent, never dominant. */}
          <AppText
            variant="summaryValue"
            accessibilityRole="header"
            numberOfLines={2}
            selectable
            style={styles.clientName}
          >
            {getClientDisplayName(client)}
          </AppText>
          {(client.phone !== undefined || client.email !== undefined) && (
            <View style={styles.contact}>
              {client.phone !== undefined && (
                <AppText
                  accessibilityLabel={`Téléphone, ${client.phone}`}
                  numberOfLines={1}
                  selectable
                  style={styles.contactLine}
                  testID="client-phone"
                >
                  {client.phone}
                </AppText>
              )}
              {client.email !== undefined && (
                <AppText
                  accessibilityLabel={`Email, ${client.email}`}
                  numberOfLines={1}
                  selectable
                  style={styles.contactLine}
                  testID="client-email"
                >
                  {client.email}
                </AppText>
              )}
            </View>
          )}
          {archived && (
            <View style={styles.archivedBadge} testID="client-archived-indicator">
              <AppText variant="chip" style={styles.archivedBadgeText}>
                {ARCHIVED_CLIENT_LABEL}
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.actionsSection}>
          {archived ? (
            <AppButton
              accessibilityLabel="Réactiver le client"
              onPress={restore}
              testID="restore-client"
              title="Réactiver le client"
              variant="secondary"
            />
          ) : (
            <View style={styles.quickActions} testID="client-daily-actions">
              <ProfileQuickAction
                icon={newAppointmentIcon}
                label="Nouveau rendez-vous"
                onPress={openAppointmentCreation}
                testID="new-appointment"
              />
              <ProfileQuickAction
                icon={saleIcon}
                label="Vendre un produit"
                onPress={openSale}
                testID="sell-product"
              />
            </View>
          )}
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
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <ProfileStatCard
                icon={metricIcons.completed}
                accessibilityLabel="Rendez-vous réalisés"
                label="Réalisés"
                testID="metric-completed"
                value={String(activity.completedAppointmentCount)}
              />
              <ProfileStatCard
                icon={metricIcons.spent}
                label="Total dépensé"
                testID="metric-spent"
                value={formatPrice(activity.totalSpent)}
              />
            </View>
            <View style={styles.statsRow}>
              <ProfileStatCard
                icon={metricIcons.noShow}
                label="Absences"
                testID="metric-noshow"
                value={String(activity.noShowAppointmentCount)}
              />
              <ProfileStatCard
                icon={metricIcons.cancelled}
                label="Annulations"
                testID="metric-cancelled"
                value={String(activity.cancelledAppointmentCount)}
              />
            </View>
          </View>
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

        {hasMoreInfo && (
          <View style={styles.infoSection}>
            <SectionHeader style={styles.sectionHeader} title="Informations" />
            <View style={styles.infoSurface}>
              <InfoRow
                icon={birthdayIcon}
                label="Anniversaire"
                value={client.birthday ? formatClientBirthday(client.birthday) : undefined}
              />
              {/* Shown once a choice was RECORDED; « Non renseigné » stays in the edit form. */}
              <InfoRow
                label={SMS_CONSENT_FIELD_LABEL}
                value={
                  client.smsMarketingConsent
                    ? formatClientSmsConsentStatus(client.smsMarketingConsent.status)
                    : undefined
                }
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

      </ScrollView>

      {birthdayCelebration.confettiVisible && (
        <BirthdayConfetti onFinished={birthdayCelebration.onConfettiFinished} />
      )}

      <DetailActionsSheet
        groups={archived ? archivedClientActionGroups : activeClientActionGroups}
        onClose={() => setActionsVisible(false)}
        onDismissed={runAdminAction}
        onSelect={(action) => {
          setPendingAction(action);
          setActionsVisible(false);
        }}
        testID="client-actions-sheet"
        title={getClientDisplayName(client)}
        visible={actionsVisible}
      />
      <ClientFormSheet
        client={client}
        mode="edit"
        onClose={() => setEditVisible(false)}
        onSubmitted={() => setEditVisible(false)}
        visible={editVisible}
      />
      <ConfirmationDialog
        body="Ce client restera dans votre répertoire mais sera déplacé dans les clients archivés. Vous pourrez le restaurer plus tard."
        cancelLabel="Annuler"
        cancelTestID="cancel-client-archive"
        confirmLabel="Archiver"
        confirmTestID="confirm-client-archive"
        eyebrow="ARCHIVAGE"
        onCancel={() => setArchiveConfirmationVisible(false)}
        onConfirm={archive}
        testID="client-archive-dialog"
        title="Archiver ce client ?"
        tone="neutral"
        visible={archiveConfirmationVisible}
      />
      <ClientDeletionDialog
        mode={deletionMode}
        onClose={() => setDeletionMode(undefined)}
        onConfirm={deletePermanently}
      />
    </SafeAreaView>
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
  // Centred on the whole bar, between « Retour » and « ••• ».
  topBarTitle: {
    color: semanticColors.foreground,
    left: 0,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    zIndex: -1,
  },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.md },
  identity: { alignItems: 'center', marginBottom: spacing.lg },
  clientName: {
    color: semanticColors.foreground,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  contact: { alignItems: 'center', gap: 2, marginTop: spacing.xs },
  contactLine: { color: foregroundSoft, fontVariant: ['tabular-nums'], textAlign: 'center' },
  actionsSection: { marginBottom: spacing.lg },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  archivedBadge: {
    marginTop: spacing.md,
    // On the app background the neutral `surface` would vanish: a white pill.
    backgroundColor: semanticColors.surfaceElevated,
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
  statsGrid: { gap: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
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
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
