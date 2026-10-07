// BeautIzzy — Calendar Block form
//
// THE editor of personal unavailability, shared by creation (« Bloquer le
// créneau ») and editing (« Enregistrer les modifications »). One compact,
// direct form — no steps, no client, no service, no price:
//
//   CRÉNEAU                one grouped surface, same rows as the Cliente
//     Date                 step: Date read-only (the Agenda day, no chevron);
//     Début  >             Début / Fin are the actions — tapping one opens
//     Fin    >             the shared 5-minute wheels inside the group, one
//                          at a time
//   Motif                  quick suggestion chips (a UX shortcut: the saved
//                          reason is plain text) + a free-text field behind
//                          « Autre »
//   [ conflict, inline ]   the save action stays disabled until it is resolved
//
// Validation is friendly and inline, never a dialog: an end that is not after
// the start is explained at once; a missing reason is asked for when the
// professional tries to save. Haptics: one selection tick per real chip change
// or opened wheel; the success haptic belongs to the caller's committed save.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';

import { CALENDAR_BLOCK_REASON_MAX_LENGTH } from '@/domain/calendar-blocks';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  GROUPED_DATA_ROW_SEPARATOR_INSET,
  GroupedDataRow,
} from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { TextField } from '@/shared/ui/TextField';
import { TimeWheelPicker } from '@/shared/ui/TimeWheelPicker';
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

import { useCalendarBlockSession } from '../session/CalendarBlockSessionProvider';
import {
  describeCalendarBlockConflict,
  formatBlockDateShort,
  formatBlockTime,
  formatSpokenBlockDate,
  formatSpokenBlockTime,
} from '../presentation';
import {
  BLOCK_MINUTE_STEP,
  blockHourRange,
  isBlockIntervalValid,
  setBlockEndTime,
  setBlockStartTime,
  type BlockTimes,
} from './block-times';
import {
  isOtherReasonSelected,
  OTHER_REASON_LABEL,
  REASON_CHIPS,
  resolveReason,
  toReasonDraft,
  type ReasonDraft,
} from './reason-suggestions';
import { ScheduleConflictNotice } from './ScheduleConflictNotice';

export interface CalendarBlockFormValues {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string;
}

interface CalendarBlockFormProps {
  readonly initialTimes: BlockTimes;
  readonly initialReason?: string;
  /** The staff member the block belongs to: conflicts are scoped to her. */
  readonly staffMemberId: string;
  /** Editing: the block itself is excluded from the conflict check. */
  readonly calendarBlockId?: string;
  readonly submitLabel: string;
  /** Editing: the action stays disabled until something actually changed. */
  readonly requireChange?: boolean;
  /** `true` inside a full-height workflow sheet: the actions sit at the bottom. */
  readonly fill?: boolean;
  readonly onSubmit: (values: CalendarBlockFormValues) => void;
}

type TimeField = 'start' | 'end';

const REASON_REQUIRED_MESSAGE = 'Indiquez un motif pour ce créneau.';
const END_BEFORE_START_MESSAGE = "L'heure de fin doit être après l'heure de début.";

const dateIcon: SymbolViewProps['name'] = { ios: 'calendar', android: 'calendar_today' };
const timeIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };
const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];
const chipHeight = 40;
const chipTouchSlop = Math.max(0, (minimumTouchTarget - chipHeight) / 2);
const chipHitSlop = { bottom: chipTouchSlop, top: chipTouchSlop } as const;

export function CalendarBlockForm({
  initialTimes,
  initialReason,
  staffMemberId,
  calendarBlockId,
  submitLabel,
  requireChange = false,
  fill = false,
  onSubmit,
}: CalendarBlockFormProps) {
  const { findConflict } = useCalendarBlockSession();
  const [times, setTimes] = useState<BlockTimes>(initialTimes);
  const [reasonDraft, setReasonDraft] = useState<ReasonDraft>(() => toReasonDraft(initialReason));
  const [openField, setOpenField] = useState<TimeField>();
  // Only an explicit tap on « Autre » takes the keyboard — never opening the form.
  const [focusCustomReason, setFocusCustomReason] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const intervalValid = isBlockIntervalValid(times);
  const reason = resolveReason(reasonDraft);
  const conflict = intervalValid
    ? findConflict({ id: calendarBlockId, staffMemberId, ...times })
    : undefined;
  const changed =
    times.startAt.getTime() !== initialTimes.startAt.getTime() ||
    times.endAt.getTime() !== initialTimes.endAt.getTime() ||
    reason !== toReasonDraftReason(initialReason);
  const reasonError = submitAttempted && reason === undefined ? REASON_REQUIRED_MESSAGE : undefined;
  const otherSelected = isOtherReasonSelected(reasonDraft);

  const toggleField = (field: TimeField) => {
    haptics.selection();
    setOpenField((current) => (current === field ? undefined : field));
  };

  const chooseChip = (chip: string) => {
    if (reasonDraft.chip === chip) return;
    haptics.selection();
    setReasonDraft((current) => ({ ...current, chip }));
    setFocusCustomReason(chip === OTHER_REASON_LABEL);
  };

  const submit = () => {
    if (!intervalValid || conflict) return;
    if (reason === undefined) {
      setSubmitAttempted(true);
      return;
    }
    onSubmit({ startAt: times.startAt, endAt: times.endAt, reason });
  };

  return (
    <View style={fill ? styles.fill : styles.fit}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={fill ? styles.fill : styles.fit}
        testID="calendar-block-form"
      >
        <View style={styles.section}>
          <AppText variant="eyebrow" style={styles.eyebrow}>
            CRÉNEAU
          </AppText>
          <GroupedSurface testID="calendar-block-slot">
            <GroupedDataRow
              accessibilityValueLabel={formatSpokenBlockDate(times.startAt)}
              icon={dateIcon}
              label="Date"
              testID="calendar-block-date"
              value={formatBlockDateShort(times.startAt)}
            />
            <GroupedSeparator inset={GROUPED_DATA_ROW_SEPARATOR_INSET} />
            <GroupedDataRow
              accessibilityHint="Ouvre le choix de l'heure"
              accessibilityValueLabel={formatSpokenBlockTime(times.startAt)}
              expanded={openField === 'start'}
              icon={timeIcon}
              label="Début"
              onPress={() => toggleField('start')}
              testID="calendar-block-start"
              value={formatBlockTime(times.startAt)}
            />
            <GroupedSeparator inset={GROUPED_DATA_ROW_SEPARATOR_INSET} />
            <GroupedDataRow
              accessibilityHint="Ouvre le choix de l'heure"
              accessibilityValueLabel={formatSpokenBlockTime(times.endAt)}
              expanded={openField === 'end'}
              icon={timeIcon}
              label="Fin"
              onPress={() => toggleField('end')}
              testID="calendar-block-end"
              value={formatBlockTime(times.endAt)}
            />
            {openField && (
              <View style={styles.picker}>
                <TimeWheelPicker
                  accessibilityLabel={
                    openField === 'start'
                      ? 'Heure de début, heures et minutes'
                      : 'Heure de fin, heures et minutes'
                  }
                  // One picker per field: the off-grid minute it remembers is the field's own.
                  key={openField}
                  maxHour={blockHourRange.maxHour}
                  minHour={blockHourRange.minHour}
                  minuteStep={BLOCK_MINUTE_STEP}
                  onChange={(time) =>
                    setTimes((current) =>
                      openField === 'start'
                        ? setBlockStartTime(current, time)
                        : setBlockEndTime(current, time),
                    )
                  }
                  testID={`calendar-block-${openField}-wheel`}
                  value={
                    openField === 'start'
                      ? { hour: times.startAt.getHours(), minute: times.startAt.getMinutes() }
                      : { hour: times.endAt.getHours(), minute: times.endAt.getMinutes() }
                  }
                />
                <Pressable
                  accessibilityLabel="Terminer la modification de l'heure"
                  accessibilityRole="button"
                  hitSlop={spacing.sm}
                  onPress={() => setOpenField(undefined)}
                  style={({ pressed }) => [styles.doneAction, pressed && styles.doneActionPressed]}
                  testID="calendar-block-time-done"
                >
                  <AppText variant="metadata" style={styles.doneText}>
                    Terminer
                  </AppText>
                </Pressable>
              </View>
            )}
          </GroupedSurface>
          {!intervalValid && (
            <AppText
              accessibilityLiveRegion="polite"
              style={styles.error}
              testID="calendar-block-time-error"
              variant="metadata"
            >
              {END_BEFORE_START_MESSAGE}
            </AppText>
          )}
        </View>

        <View style={styles.section}>
          <AppText variant="control" style={styles.sectionTitle}>
            Motif
          </AppText>
          <View accessibilityLabel="Motif" accessibilityRole="radiogroup" style={styles.chips}>
            {REASON_CHIPS.map((chip) => {
              const selected = reasonDraft.chip === chip;
              return (
                <Pressable
                  accessibilityLabel={chip}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  hitSlop={chipHitSlop}
                  key={chip}
                  onPress={() => chooseChip(chip)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`calendar-block-reason-${chip}`}
                >
                  <AppText variant="control" style={selected ? styles.chipTextSelected : styles.chipText}>
                    {chip}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {otherSelected && (
            <TextField
              accessibilityLabel="Motif"
              autoFocus={focusCustomReason}
              error={reasonError}
              label="Précisez le motif"
              maxLength={CALENDAR_BLOCK_REASON_MAX_LENGTH}
              onChangeText={(customText) => setReasonDraft((current) => ({ ...current, customText }))}
              onSubmitEditing={submit}
              placeholder="Rendez-vous médical, école…"
              returnKeyType="done"
              testID="calendar-block-custom-reason"
              value={reasonDraft.customText}
            />
          )}
          {!otherSelected && reasonError && (
            <AppText
              accessibilityLiveRegion="polite"
              style={styles.error}
              testID="calendar-block-reason-error"
              variant="metadata"
            >
              {reasonError}
            </AppText>
          )}
        </View>

        {conflict && (
          <ScheduleConflictNotice
            conflict={describeCalendarBlockConflict(conflict)}
            testID="calendar-block-conflict"
          />
        )}
      </ScrollView>

      <SheetActionBar testID="calendar-block-actions">
        <AppButton
          disabled={!intervalValid || conflict !== undefined || (requireChange && !changed)}
          onPress={submit}
          testID="calendar-block-submit"
          title={submitLabel}
        />
      </SheetActionBar>
    </View>
  );
}

/** The saved reason the form opened with, in the same normalized form `resolveReason` yields. */
function toReasonDraftReason(initialReason: string | undefined): string | undefined {
  return resolveReason(toReasonDraft(initialReason));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fit: { flexShrink: 1 },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  section: { gap: spacing.sm },
  eyebrow: { color: foregroundSoft },
  sectionTitle: { color: semanticColors.foreground },
  picker: { gap: spacing.xs, paddingBottom: spacing.sm, paddingHorizontal: spacing.base },
  doneAction: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  doneActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  doneText: { color: semanticColors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: chipHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  // Subtle BeautIzzy-purple tint + a thicker accent border: selection never
  // rests on the fill colour alone (and the chip is a selected radio).
  chipSelected: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.accent,
    borderWidth: 1.5,
  },
  chipText: { color: semanticColors.foreground },
  chipTextSelected: { color: semanticColors.accent },
  error: { color: rose.rose600 },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});
