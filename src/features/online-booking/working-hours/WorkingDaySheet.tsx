// BeautIzzy — the editor of one working day (Plus › Horaires › a day)
//
// ONE sheet per day, opened from the week overview:
//
//   [ Annuler ]        Lundi
//   Ouvert le lundi                       (switch)
//   ⓘ Horaires proposés à partir du …    only while the shown hours were
//     Vous pouvez les modifier…           copied from another day (day-draft.ts)
//   PLAGE 1                          Retirer
//     Début   09:00  >                    tapping a time opens the shared
//     Fin     12:00  >                    5-minute wheels inside the group,
//   PLAGE 2                          Retirer   one at a time
//     …
//   + Ajouter une plage    « Une pause sépare deux plages horaires. »
//   [ Enregistrer ]
//
// Validation is inline and never a dialog: each interval explains its own
// problem (end before start, overlap) under its group, and « Enregistrer »
// stays disabled until the day is valid AND differs from what the server
// holds. The save itself belongs to the caller: the sheet only reports the
// day to save, then shows the caller's failure if the server refused.
// Closing goes through « Annuler » only — never a swipe or a backdrop tap,
// so a day being edited is never lost by accident. A write in flight is
// never interrupted.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import {
  isSameWorkingDay,
  validateWorkingDay,
  type WorkingDay,
} from '@/domain/online-booking';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { GROUPED_DATA_ROW_SEPARATOR_INSET, GroupedDataRow } from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { TimeWheelPicker } from '@/shared/ui/TimeWheelPicker';
import {
  foregroundSoft,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  addWorkingInterval,
  proposeNextInterval,
  removeWorkingInterval,
  setWorkingIntervalEdge,
  suggestionSourceOf,
  switchWorkingDay,
  toWorkingDay,
  toWorkingDayDraft,
  WORKING_MINUTE_STEP,
  type WorkingDayDraft,
  type WorkingIntervalEdge,
} from './day-draft';
import {
  formatMinuteOfDay,
  formatOpenSwitchLabel,
  formatSpokenMinuteOfDay,
  formatSuggestedHoursSource,
  formatWeekday,
  formatWorkingInterval,
  WORKING_DAY_ISSUE_MESSAGES,
  WORKING_HOURS_ADD_INTERVAL,
  WORKING_HOURS_BREAK_HINT,
  WORKING_HOURS_REMOVE_INTERVAL,
  WORKING_HOURS_SUGGESTION_HINT,
  WORKING_INTERVAL_ISSUE_MESSAGES,
} from './presentation';

const timeIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };

interface WorkingDaySheetProps {
  /** The day as the server holds it when the sheet opened. */
  readonly day: WorkingDay;
  /** The stored week: opening a closed day proposes the hours of an earlier open one. */
  readonly week: readonly WorkingDay[];
  readonly visible: boolean;
  readonly saving: boolean;
  /** Why the last save of this day did not go through; cleared by any edit. */
  readonly failure?: string;
  readonly onCancel: () => void;
  readonly onSave: (day: WorkingDay) => void;
  readonly onEdit: () => void;
  readonly onDismissed: () => void;
}

interface OpenWheel {
  readonly index: number;
  readonly edge: WorkingIntervalEdge;
}

export function WorkingDaySheet({
  day,
  week,
  visible,
  saving,
  failure,
  onCancel,
  onSave,
  onEdit,
  onDismissed,
}: WorkingDaySheetProps) {
  const [draft, setDraft] = useState<WorkingDayDraft>(() => toWorkingDayDraft(day));
  const [openWheel, setOpenWheel] = useState<OpenWheel>();

  const candidate = toWorkingDay(draft);
  const validation = validateWorkingDay(candidate);
  const changed = !isSameWorkingDay(candidate, day);
  const canSave = validation.valid && changed && !saving;
  const canAdd = draft.isOpen && proposeNextInterval(draft.intervals) !== undefined;
  const weekdayName = formatWeekday(day.weekday);
  const suggestionSource = suggestionSourceOf(draft);

  const edit = (next: WorkingDayDraft) => {
    setDraft(next);
    onEdit();
  };

  const cancel = () => {
    if (saving) return;
    onCancel();
  };

  const toggleWheel = (index: number, edge: WorkingIntervalEdge) => {
    if (saving) return;
    haptics.selection();
    setOpenWheel((current) => (current?.index === index && current.edge === edge ? undefined : { index, edge }));
  };

  const switchDay = (isOpen: boolean) => {
    setOpenWheel(undefined);
    edit(switchWorkingDay(draft, isOpen, week));
  };

  const addInterval = () => {
    haptics.selection();
    setOpenWheel(undefined);
    edit(addWorkingInterval(draft));
  };

  const removeInterval = (index: number) => {
    haptics.selection();
    setOpenWheel(undefined);
    edit(removeWorkingInterval(draft, index));
  };

  const save = () => {
    if (!canSave) {
      if (!validation.valid) haptics.warning();
      return;
    }
    setOpenWheel(undefined);
    onSave(candidate);
  };

  return (
    <BottomSheet
      backdropLabel={`Horaires du ${weekdayName.toLowerCase()}`}
      dismissOnBackdropPress={false}
      dismissOnPanDown={false}
      footer={
        <SheetActionBar testID="working-day-actions">
          <AppButton
            accessibilityState={{ busy: saving }}
            disabled={!canSave}
            onPress={save}
            testID="working-day-save"
            title={saving ? 'Enregistrement…' : 'Enregistrer'}
          />
        </SheetActionBar>
      }
      header={
        <SheetEditingHeader
          cancelAccessibilityLabel={`Annuler les modifications du ${weekdayName.toLowerCase()}`}
          cancelTestID="working-day-cancel"
          onCancel={cancel}
          title={weekdayName}
        />
      }
      onClose={cancel}
      onDismissed={onDismissed}
      scrollable
      testID="working-day-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        <GroupedSurface>
          <SwitchRow
            disabled={saving}
            label={formatOpenSwitchLabel(day.weekday)}
            onValueChange={switchDay}
            testID="working-day-open"
            value={draft.isOpen}
          />
        </GroupedSurface>

        {suggestionSource !== undefined && (
          <View
            accessible
            accessibilityLabel={`${formatSuggestedHoursSource(suggestionSource)}. ${WORKING_HOURS_SUGGESTION_HINT}`}
            accessibilityLiveRegion="polite"
            style={styles.suggestion}
            testID="working-day-suggestion"
          >
            <SymbolView name={{ ios: 'info.circle', android: 'info' }} size={14} tintColor={foregroundSoft} />
            <View style={styles.suggestionCopy}>
              <AppText variant="metadata" style={styles.suggestionTitle} testID="working-day-suggestion-source">
                {formatSuggestedHoursSource(suggestionSource)}
              </AppText>
              <AppText variant="metadata" style={styles.soft}>
                {WORKING_HOURS_SUGGESTION_HINT}
              </AppText>
            </View>
          </View>
        )}

        {draft.isOpen &&
          draft.intervals.map((interval, index) => {
            const issue = validation.intervalIssues[index];
            const position = index + 1;
            return (
              <View key={index} style={styles.interval} testID={`working-interval-${index}`}>
                <View style={styles.intervalHeader}>
                  <AppText variant="eyebrow" style={styles.eyebrow}>
                    {`PLAGE ${position}`}
                  </AppText>
                  {draft.intervals.length > 1 && (
                    <Pressable
                      accessibilityLabel={`Retirer la plage ${position}, ${formatWorkingInterval(interval)}`}
                      accessibilityRole="button"
                      disabled={saving}
                      hitSlop={spacing.sm}
                      onPress={() => removeInterval(index)}
                      style={({ pressed }) => [styles.textAction, pressed && styles.textActionPressed]}
                      testID={`working-interval-${index}-remove`}
                    >
                      <AppText variant="metadata" style={styles.removeText}>
                        {WORKING_HOURS_REMOVE_INTERVAL}
                      </AppText>
                    </Pressable>
                  )}
                </View>
                <GroupedSurface>
                  {(['start', 'end'] as const).map((edge) => {
                    const minute = edge === 'start' ? interval.startMinute : interval.endMinute;
                    const expanded = openWheel?.index === index && openWheel.edge === edge;
                    return (
                      <View key={edge}>
                        {edge === 'end' && <GroupedSeparator inset={GROUPED_DATA_ROW_SEPARATOR_INSET} />}
                        <GroupedDataRow
                          accessibilityHint="Ouvre le choix de l'heure"
                          accessibilityValueLabel={formatSpokenMinuteOfDay(minute)}
                          expanded={expanded}
                          icon={timeIcon}
                          label={edge === 'start' ? 'Début' : 'Fin'}
                          onPress={() => toggleWheel(index, edge)}
                          testID={`working-interval-${index}-${edge}`}
                          value={formatMinuteOfDay(minute)}
                        />
                        {expanded && (
                          <View style={styles.picker}>
                            <TimeWheelPicker
                              accessibilityLabel={
                                edge === 'start'
                                  ? `Début de la plage ${position}, heures et minutes`
                                  : `Fin de la plage ${position}, heures et minutes`
                              }
                              // One picker per field: the off-grid minute it remembers is the field's own.
                              key={`${index}-${edge}`}
                              minuteStep={WORKING_MINUTE_STEP}
                              onChange={(time) =>
                                edit(setWorkingIntervalEdge(draft, index, edge, time.hour * 60 + time.minute))
                              }
                              testID={`working-interval-${index}-${edge}-wheel`}
                              value={{ hour: Math.floor(minute / 60), minute: minute % 60 }}
                            />
                            <Pressable
                              accessibilityLabel="Terminer la modification de l'heure"
                              accessibilityRole="button"
                              hitSlop={spacing.sm}
                              onPress={() => setOpenWheel(undefined)}
                              style={({ pressed }) => [styles.doneAction, pressed && styles.textActionPressed]}
                              testID="working-interval-time-done"
                            >
                              <AppText variant="metadata" style={styles.doneText}>
                                Terminer
                              </AppText>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </GroupedSurface>
                {issue !== undefined && (
                  <AppText
                    accessibilityLiveRegion="polite"
                    style={styles.error}
                    testID={`working-interval-${index}-error`}
                    variant="metadata"
                  >
                    {WORKING_INTERVAL_ISSUE_MESSAGES[issue]}
                  </AppText>
                )}
              </View>
            );
          })}

        {draft.isOpen && validation.dayIssue !== undefined && (
          <AppText accessibilityLiveRegion="polite" style={styles.error} testID="working-day-error" variant="metadata">
            {WORKING_DAY_ISSUE_MESSAGES[validation.dayIssue]}
          </AppText>
        )}

        {draft.isOpen && (
          <View style={styles.addRow}>
            <AppButton
              disabled={!canAdd || saving}
              icon={{ ios: 'plus', android: 'add' }}
              onPress={addInterval}
              testID="working-day-add-interval"
              title={WORKING_HOURS_ADD_INTERVAL}
              variant="tertiary"
            />
            <AppText variant="metadata" style={styles.soft}>
              {WORKING_HOURS_BREAK_HINT}
            </AppText>
          </View>
        )}

        {failure !== undefined && (
          <AppText accessibilityLiveRegion="polite" style={styles.error} testID="working-day-failure" variant="metadata">
            {failure}
          </AppText>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.sm },
  interval: { gap: spacing.sm },
  intervalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  eyebrow: { color: foregroundSoft },
  soft: { color: foregroundSoft },
  // Information, never a warning: the quiet note of the product (soft text, info glyph, no fill).
  suggestion: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  suggestionCopy: { flex: 1, gap: 2 },
  suggestionTitle: { color: semanticColors.foreground },
  textAction: {
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  textActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  removeText: { color: rose.rose700 },
  picker: { gap: spacing.xs, paddingBottom: spacing.sm, paddingHorizontal: spacing.base },
  doneAction: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  doneText: { color: semanticColors.accent },
  addRow: { alignItems: 'flex-start', gap: spacing.xs },
  error: { color: rose.rose700 },
});
