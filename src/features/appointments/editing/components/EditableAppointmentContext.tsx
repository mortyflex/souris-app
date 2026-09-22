// Souris — Editable appointment context (Appointment Editing)
//
// The « Rendez-vous » group of « Modifier le rendez-vous » (DESIGN_OVERRIDES.md
// §27): three tappable rows — Cliente, Date, Heure — on the white grouped
// surface, glyph + label on the left, value + chevron on the right. The whole
// row is the action; no separate link labels. Reuses the current Creation
// compact controls: the shared start-time wheels (StartTimePicker), opened
// inline under the Heure row, and the native date picker pattern from the
// shared client form (iOS wheel sheet, Android dialog).

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import {
  formatCreationDateShort,
  formatCreationTime,
} from '../../creation/presentation';
import { StartTimePicker } from '../../creation/components/StartTimePicker';
import {
  changeAppointmentLocalDate,
  setAppointmentLocalTime,
} from '../start-at';

interface EditableAppointmentContextProps {
  readonly clientName?: string;
  readonly startAt: Date;
  readonly onStartAtChange: (startAt: Date) => void;
  readonly onEditClient: () => void;
}

const DEFAULT_PICKER_DATE = new Date(2026, 7, 1, 9, 0);
const clientIcon: SymbolViewProps['name'] = { ios: 'person', android: 'person' };
const dateIcon: SymbolViewProps['name'] = { ios: 'calendar', android: 'calendar_today' };
const timeIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };
const ICON_COLUMN = 22;
/** Separators start under the labels: row padding + glyph column + gap. */
const SEPARATOR_INSET = spacing.base + ICON_COLUMN + spacing.md;

export function EditableAppointmentContext({
  clientName,
  startAt,
  onStartAtChange,
  onEditClient,
}: EditableAppointmentContextProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(() => new Date(startAt));

  const openDatePicker = () => {
    setDraftDate(new Date(startAt));
    setDatePickerOpen(true);
  };

  const confirmDate = () => {
    onStartAtChange(changeAppointmentLocalDate(startAt, draftDate));
    setDatePickerOpen(false);
  };

  const cancelDatePicker = () => {
    setDatePickerOpen(false);
  };

  const dateLabel = formatCreationDateShort(startAt);
  const timeLabel = formatCreationTime(startAt);

  return (
    <View>
      <GroupedSurface testID="appointment-context">
        <ContextRow
          accessibilityHint="Modifier la cliente"
          icon={clientIcon}
          label="Cliente"
          onPress={onEditClient}
          testID="edit-client"
          value={clientName ?? ''}
        />
        <GroupedSeparator inset={SEPARATOR_INSET} />
        <ContextRow
          accessibilityHint="Changer la date"
          icon={dateIcon}
          label="Date"
          onPress={openDatePicker}
          testID="edit-date"
          value={dateLabel}
        />
        <GroupedSeparator inset={SEPARATOR_INSET} />
        <ContextRow
          accessibilityHint="Changer l'heure"
          expanded={editingTime}
          icon={timeIcon}
          label="Heure"
          onPress={() => setEditingTime((current) => !current)}
          testID="edit-time"
          value={timeLabel}
        />
        {editingTime && (
          <View style={styles.timePicker}>
            <StartTimePicker
              onChange={({ hour, minute }) =>
                onStartAtChange(setAppointmentLocalTime(startAt, hour, minute))
              }
              onDone={() => setEditingTime(false)}
              startAt={startAt}
            />
          </View>
        )}
      </GroupedSurface>

      {Platform.OS === 'android' && datePickerOpen && (
        <DateTimePicker
          accentColor={semanticColors.accent}
          mode="date"
          onDismiss={cancelDatePicker}
          onValueChange={(_event, date) => {
            if (date) {
              onStartAtChange(changeAppointmentLocalDate(startAt, date));
            }
            setDatePickerOpen(false);
          }}
          presentation="dialog"
          value={draftDate}
        />
      )}

      <BottomSheet
        backdropLabel="Annuler la sélection de date"
        header={
          <SheetHeader
            action={{ label: 'Annuler', onPress: cancelDatePicker }}
            eyebrow="RENDEZ-VOUS"
            title="Date du rendez-vous"
          />
        }
        onClose={cancelDatePicker}
        visible={Platform.OS === 'ios' && datePickerOpen}
      >
        <DateTimePicker
          accentColor={semanticColors.accent}
          display="spinner"
          locale="fr_FR"
          mode="date"
          onValueChange={(_event, date) => setDraftDate(date ?? DEFAULT_PICKER_DATE)}
          value={draftDate}
        />
        <View style={styles.pickerFooter}>
          <AppButton
            onPress={cancelDatePicker}
            style={styles.pickerSecondary}
            title="Annuler"
            variant="secondary"
          />
          <AppButton
            onPress={confirmDate}
            style={styles.pickerPrimary}
            testID="confirm-date"
            title="Confirmer"
          />
        </View>
      </BottomSheet>
    </View>
  );
}

interface ContextRowProps {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly value: string;
  readonly accessibilityHint: string;
  readonly onPress: () => void;
  /** Rows that open inline (Heure) turn their chevron; the others push a picker. */
  readonly expanded?: boolean;
  readonly testID: string;
}

function ContextRow({
  icon,
  label,
  value,
  accessibilityHint,
  onPress,
  expanded,
  testID,
}: ContextRowProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <View style={styles.iconColumn}>
        <SymbolView name={icon} size={17} tintColor={semanticColors.accent} />
      </View>
      <AppText variant="body" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText
        variant="control"
        numberOfLines={1}
        style={styles.rowValue}
        testID={`${testID}-value`}
      >
        {value}
      </AppText>
      <DisclosureChevron expanded={expanded ?? false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  iconColumn: { alignItems: 'center', width: ICON_COLUMN },
  rowLabel: { color: foregroundSoft },
  // The value takes the remaining width and truncates: a long client name
  // never pushes the chevron off screen.
  rowValue: {
    color: semanticColors.foreground,
    flex: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  timePicker: { paddingBottom: spacing.sm, paddingHorizontal: spacing.base },
  pickerFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  pickerSecondary: { flex: 1 },
  pickerPrimary: { flex: 1 },
});
