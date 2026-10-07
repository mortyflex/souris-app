// BeautIzzy — Editable appointment context (Appointment Editing)
//
// The « Rendez-vous » group of « Modifier le rendez-vous » (DESIGN_OVERRIDES.md
// §27): three tappable rows — Cliente, Date, Heure — on the white grouped
// surface, glyph + label on the left, value + chevron on the right. The whole
// row is the action; no separate link labels. Reuses the current Creation
// compact controls: the shared start-time wheels (StartTimePicker), opened
// inline under the Heure row, and the native date picker pattern from the
// shared client form (iOS wheel sheet, Android dialog).

import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import type { SymbolViewProps } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import {
  GROUPED_DATA_ROW_SEPARATOR_INSET,
  GroupedDataRow,
} from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

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
const SEPARATOR_INSET = GROUPED_DATA_ROW_SEPARATOR_INSET;

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
        <GroupedDataRow
          accessibilityHint="Modifier le client"
          icon={clientIcon}
          label="Client"
          onPress={onEditClient}
          testID="edit-client"
          value={clientName ?? ''}
        />
        <GroupedSeparator inset={SEPARATOR_INSET} />
        <GroupedDataRow
          accessibilityHint="Changer la date"
          icon={dateIcon}
          label="Date"
          onPress={openDatePicker}
          testID="edit-date"
          value={dateLabel}
        />
        <GroupedSeparator inset={SEPARATOR_INSET} />
        <GroupedDataRow
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
          <SheetEditingHeader
            cancelTestID="cancel-date"
            onCancel={cancelDatePicker}
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

const styles = StyleSheet.create({
  timePicker: { paddingBottom: spacing.sm, paddingHorizontal: spacing.base },
  pickerFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  pickerSecondary: { flex: 1 },
  pickerPrimary: { flex: 1 },
});
