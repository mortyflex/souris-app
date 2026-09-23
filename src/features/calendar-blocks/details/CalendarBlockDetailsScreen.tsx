// Souris — Calendar Block details
//
// What a tap on an « Indisponible » block opens: a dedicated, deliberately
// small sheet — NOT Appointment Details. It states that the slot is
// unavailable, why, and when, and offers exactly three things: Modifier and
// Supprimer (both behind « ••• ») and × (close). There is no client, no
// service, no total, no discount and no checkout here, because a Calendar
// Block has none of them.
//
// Presented in the canonical content sheet (SheetScreen fit="content"): swipe
// down, outside tap and the visible « Fermer » all leave through the same
// close transition. « Modifier » slides the editor in as a second sheet
// (`contentKey`), on the same form as creation; while it is open a swipe can
// no longer lose the draft — leaving goes through « Annuler ».
//
// Header: while reading, the shared DetailSheetHeader like Appointment
// Details — « Indisponible » leading, then « ••• » and ×; the actions open the
// shared DetailActionsSheet and run once it is gone (`onDismissed`), so the
// deletion dialog never races the closing drawer. While editing, the shared
// SheetEditingHeader: « Annuler » and « Modifier le créneau ».

import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { calendarBlockIcon } from '@/shared/icons/calendar-block-icon';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { DetailActionsSheet, type DetailAction } from '@/shared/ui/DetailActionsSheet';
import { DetailSheetHeader } from '@/shared/ui/DetailSheetHeader';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import {
  calendarBlockColors,
  foregroundSoft,
  gutter,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { CalendarBlockForm, type CalendarBlockFormValues } from '../editor/CalendarBlockForm';
import {
  CALENDAR_BLOCK_TITLE,
  formatBlockDate,
  formatBlockTimeRange,
  getCalendarBlockAccessibilityLabel,
} from '../presentation';
import { useCalendarBlockSession } from '../session/CalendarBlockSessionProvider';

interface CalendarBlockDetailsScreenProps {
  readonly calendarBlockId?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

type CalendarBlockAction = 'modify' | 'delete';

const calendarBlockActionGroups: readonly (readonly DetailAction<CalendarBlockAction>[])[] = [
  [
    {
      key: 'modify',
      label: 'Modifier',
      icon: { ios: 'pencil', android: 'edit' },
      tone: 'normal',
      testID: 'modify-calendar-block',
    },
  ],
  [
    {
      key: 'delete',
      label: 'Supprimer',
      icon: { ios: 'trash', android: 'delete' },
      tone: 'destructive',
      testID: 'open-calendar-block-deletion',
      accessibilityHint: 'Supprime ce créneau de l’agenda',
    },
  ],
];

export function CalendarBlockDetailsScreen({ calendarBlockId }: CalendarBlockDetailsScreenProps) {
  const router = useRouter();
  const { deleteCalendarBlock, getCalendarBlockById, updateCalendarBlock } =
    useCalendarBlockSession();
  const [editing, setEditing] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<CalendarBlockAction>();
  // The block this very screen deleted keeps being shown while the sheet
  // slides away, instead of flashing a « not found » state.
  const [deletedBlock, setDeletedBlock] = useState<CalendarBlock>();
  const calendarBlock = getCalendarBlockById(calendarBlockId) ?? deletedBlock;

  if (!calendarBlock) {
    return (
      <SheetScreen fit="content" testID="calendar-block-details-sheet">
        <View style={styles.headerZone}>
          <SheetEditingHeader
            cancelLabel="Fermer"
            onCancel={() => router.back()}
            title="Créneau introuvable"
          />
        </View>
        <AppText variant="metadata" style={styles.notFoundText}>
          Ce créneau n&apos;est plus disponible.
        </AppText>
      </SheetScreen>
    );
  }

  const save = (values: CalendarBlockFormValues) => {
    try {
      updateCalendarBlock({ ...calendarBlock, ...values });
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.success();
    setEditing(false);
  };

  const deletePermanently = () => {
    setDeletionRequested(false);
    try {
      deleteCalendarBlock(calendarBlock.id);
    } catch {
      alertPersistenceFailure();
      return;
    }
    setDeletedBlock(calendarBlock);
    haptics.warning();
    router.back();
  };

  // Runs once the « ••• » drawer is gone, so no dialog races its closing.
  const runSecondaryAction = () => {
    const action = pendingAction;
    setPendingAction(undefined);
    if (action === 'modify') setEditing(true);
    if (action === 'delete') setDeletionRequested(true);
  };

  return (
    <SheetScreen
      // Details and edition are two sheets: the change slides in, never swaps.
      contentKey={editing ? 'edit' : 'read'}
      // A draft under edition must not be lost to a swipe; reading may dismiss.
      dismissible={!editing}
      fit="content"
      keyboardAvoiding
      testID="calendar-block-details-sheet"
    >
      <View style={styles.headerZone}>
        {editing ? (
          <SheetEditingHeader
            cancelAccessibilityLabel="Annuler les modifications"
            cancelTestID="cancel-calendar-block-edit"
            onCancel={() => setEditing(false)}
            title="Modifier le créneau"
          />
        ) : (
          <DetailSheetHeader
            actionsAccessibilityLabel="Actions"
            actionsTestID="open-calendar-block-actions"
            closeTestID="close-calendar-block-details"
            onClose={() => router.back()}
            onOpenActions={() => setMenuVisible(true)}
            testID="calendar-block-detail-header"
            title={CALENDAR_BLOCK_TITLE}
          />
        )}
      </View>

      {editing ? (
        <CalendarBlockForm
          calendarBlockId={calendarBlock.id}
          initialReason={calendarBlock.reason}
          initialTimes={{ startAt: calendarBlock.startAt, endAt: calendarBlock.endAt }}
          onSubmit={save}
          requireChange
          staffMemberId={calendarBlock.staffMemberId}
          submitLabel="Enregistrer les modifications"
        />
      ) : (
        <View style={styles.body}>
          <View
            accessible
            accessibilityLabel={`${getCalendarBlockAccessibilityLabel(calendarBlock)}, ${formatBlockDate(calendarBlock.startAt)}`}
            style={styles.card}
            testID="calendar-block-summary"
          >
            <View style={styles.reasonRow}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.badge}
              >
                <SymbolView name={calendarBlockIcon} size={18} tintColor={calendarBlockColors.accent} />
              </View>
              <View style={styles.reasonCopy}>
                <AppText variant="metadata" style={styles.label}>
                  Motif
                </AppText>
                <AppText variant="rowTitle" selectable style={styles.reason}>
                  {calendarBlock.reason}
                </AppText>
              </View>
            </View>
            <View style={styles.divider} />
            <DetailLine label="Date" value={formatBlockDate(calendarBlock.startAt)} />
            <DetailLine label="Horaire" value={formatBlockTimeRange(calendarBlock)} />
          </View>
        </View>
      )}

      <DetailActionsSheet
        groups={calendarBlockActionGroups}
        onClose={() => setMenuVisible(false)}
        onDismissed={runSecondaryAction}
        onSelect={(action) => {
          setPendingAction(action);
          setMenuVisible(false);
        }}
        testID="calendar-block-actions-sheet"
        title={CALENDAR_BLOCK_TITLE}
        visible={menuVisible && !editing}
      />

      <ConfirmationDialog
        body="Il sera retiré de l’agenda et le créneau redeviendra disponible. Cette action est irréversible."
        cancelLabel="Retour"
        cancelTestID="cancel-calendar-block-deletion"
        confirmLabel="Supprimer"
        confirmTestID="confirm-calendar-block-deletion"
        eyebrow="SUPPRESSION"
        onCancel={() => setDeletionRequested(false)}
        onConfirm={deletePermanently}
        testID="calendar-block-deletion-dialog"
        title="Supprimer ce créneau ?"
        visible={deletionRequested}
      />
    </SheetScreen>
  );
}

function DetailLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.detailLine}>
      <AppText variant="metadata" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="control" selectable style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerZone: { paddingHorizontal: horizontalGutter },
  body: { paddingBottom: spacing.base, paddingHorizontal: horizontalGutter, paddingTop: spacing.sm },
  card: {
    backgroundColor: calendarBlockColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.md,
    padding: spacing.base,
  },
  reasonRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  badge: {
    alignItems: 'center',
    backgroundColor: calendarBlockColors.background,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  reasonCopy: { flex: 1, gap: 2, minWidth: 0 },
  label: { color: calendarBlockColors.subtitle },
  reason: { color: calendarBlockColors.title },
  divider: { backgroundColor: calendarBlockColors.background, height: StyleSheet.hairlineWidth * 2 },
  detailLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  detailValue: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  notFoundText: {
    color: foregroundSoft,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
});
