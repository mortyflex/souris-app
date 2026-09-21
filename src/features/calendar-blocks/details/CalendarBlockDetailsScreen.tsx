// Souris — Calendar Block details
//
// What a tap on an « Indisponible » block opens: a dedicated, deliberately
// small sheet — NOT Appointment Details. It states that the slot is
// unavailable, why, and when, and offers exactly three things: Modifier,
// Supprimer, Fermer. There is no client, no service, no total, no discount and
// no checkout here, because a Calendar Block has none of them.
//
// Presented in the canonical content sheet (SheetScreen fit="content"): swipe
// down, outside tap and the visible « Fermer » all leave through the same
// close transition. « Modifier » slides the editor in as a second sheet
// (`contentKey`), on the same form as creation; while it is open a swipe can
// no longer lose the draft — leaving goes through « Annuler ».

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { calendarBlockIcon } from '@/shared/icons/calendar-block-icon';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import {
  calendarBlockColors,
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
  touchTarget,
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

export function CalendarBlockDetailsScreen({ calendarBlockId }: CalendarBlockDetailsScreenProps) {
  const router = useRouter();
  const { deleteCalendarBlock, getCalendarBlockById, updateCalendarBlock } =
    useCalendarBlockSession();
  const [editing, setEditing] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  // The block this very screen deleted keeps being shown while the sheet
  // slides away, instead of flashing a « not found » state.
  const [deletedBlock, setDeletedBlock] = useState<CalendarBlock>();
  const calendarBlock = getCalendarBlockById(calendarBlockId) ?? deletedBlock;

  if (!calendarBlock) {
    return (
      <SheetScreen fit="content" testID="calendar-block-details-sheet">
        <View style={styles.headerZone}>
          <SheetHeader
            action={{ label: 'Fermer', onPress: () => router.back() }}
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
        <SheetHeader
          action={
            editing
              ? {
                  accessibilityLabel: 'Annuler les modifications',
                  label: 'Annuler',
                  onPress: () => setEditing(false),
                  testID: 'cancel-calendar-block-edit',
                }
              : { label: 'Fermer', onPress: () => router.back(), testID: 'close-calendar-block-details' }
          }
          eyebrow="CRÉNEAU PERSONNEL"
          title={editing ? 'Modifier le créneau' : CALENDAR_BLOCK_TITLE}
        />
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

          <View style={styles.actions} testID="calendar-block-actions">
            <AppButton
              accessibilityLabel="Modifier le créneau"
              onPress={() => setEditing(true)}
              testID="modify-calendar-block"
              title="Modifier"
              variant="secondary"
            />
            <Pressable
              accessibilityHint="Supprime ce créneau de l’agenda"
              accessibilityRole="button"
              onPress={() => setDeletionRequested(true)}
              style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}
              testID="open-calendar-block-deletion"
            >
              <AppText variant="control" style={styles.deleteText}>
                Supprimer
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

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
  body: { gap: spacing.xl, paddingHorizontal: horizontalGutter, paddingTop: spacing.sm },
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
  actions: { gap: spacing.sm, paddingBottom: spacing.sm },
  deleteAction: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: spacing.md,
  },
  deleteActionPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  deleteText: { color: rose.rose600 },
  notFoundText: {
    color: foregroundSoft,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
});
