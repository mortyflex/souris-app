// Souris — Editable appointment context (Appointment Editing)
//
// Light "who + when" surface where the Client and the Date / Heure of the
// editing draft can be changed. Reuses the current Creation compact controls:
// the inline ±5 minute TimeStepper and the native date picker pattern from
// the shared client form (iOS wheel sheet, Android dialog). No giant form,
// no decorative borders.

import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  formatCreationDateShort,
  formatCreationTime,
} from '../../creation/presentation';
import { TimeStepper } from '../../creation/components/TimeStepper';
import {
  changeAppointmentLocalDate,
  stepAppointmentStartAt,
} from '../start-at';

interface EditableAppointmentContextProps {
  readonly clientName?: string;
  readonly startAt: Date;
  readonly onStartAtChange: (startAt: Date) => void;
  readonly onEditClient: () => void;
}

const DEFAULT_PICKER_DATE = new Date(2026, 7, 1, 9, 0);

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

  return (
    <View style={styles.context}>
      <View style={styles.clientRow}>
        <AppText variant="sheetTitle" numberOfLines={1} style={styles.clientName}>
          {clientName}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Modifier la cliente"
          hitSlop={spacing.sm}
          onPress={onEditClient}
          style={({ pressed }) => [styles.modifyAction, pressed && styles.modifyPressed]}
          testID="edit-client"
        >
          <AppText variant="metadata" style={styles.modifyText}>
            Modifier la cliente
          </AppText>
        </Pressable>
      </View>

      <View style={styles.fieldRow}>
        <AppText variant="metadata" style={styles.fieldLabel}>
          Date
        </AppText>
        <AppText variant="control" selectable style={styles.fieldValue}>
          {formatCreationDateShort(startAt)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Changer la date"
          hitSlop={spacing.sm}
          onPress={openDatePicker}
          style={({ pressed }) => [styles.modifyAction, pressed && styles.modifyPressed]}
          testID="edit-date"
        >
          <AppText variant="metadata" style={styles.modifyText}>
            Changer la date
          </AppText>
        </Pressable>
      </View>

      {editingTime ? (
        <TimeStepper
          startAt={startAt}
          onStep={(deltaMinutes) =>
            onStartAtChange(stepAppointmentStartAt(startAt, deltaMinutes))
          }
          onDone={() => setEditingTime(false)}
        />
      ) : (
        <View style={styles.fieldRow}>
          <AppText variant="metadata" style={styles.fieldLabel}>
            Heure
          </AppText>
          <AppText variant="control" selectable style={styles.fieldValue}>
            {formatCreationTime(startAt)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer l'heure"
            hitSlop={spacing.sm}
            onPress={() => setEditingTime(true)}
            style={({ pressed }) => [styles.modifyAction, pressed && styles.modifyPressed]}
            testID="edit-time"
          >
            <AppText variant="metadata" style={styles.modifyText}>
              Changer l&apos;heure
            </AppText>
          </Pressable>
        </View>
      )}

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

      <Modal
        animationType="slide"
        onRequestClose={cancelDatePicker}
        transparent
        visible={Platform.OS === 'ios' && datePickerOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Annuler la sélection de date"
            onPress={cancelDatePicker}
            style={styles.backdrop}
          />
          <SafeAreaView edges={['bottom']} style={styles.pickerSheet}>
            <View style={styles.grabber} />
            <AppText variant="sheetTitle" accessibilityRole="header" style={styles.pickerTitle}>
              Date du rendez-vous
            </AppText>
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
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  context: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    padding: spacing.base,
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  clientName: { color: semanticColors.foreground, flexShrink: 1 },
  fieldRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldLabel: { color: semanticColors.foregroundSoft, width: 48 },
  fieldValue: { color: semanticColors.foreground, flex: 1, fontVariant: ['tabular-nums'] },
  modifyAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  modifyPressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
  modifyText: { color: semanticColors.accent },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 63, 0.24)',
  },
  pickerSheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    paddingHorizontal: spacing.base,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.sm,
    width: 40,
  },
  pickerTitle: { paddingVertical: spacing.base },
  pickerFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  pickerSecondary: { flex: 1 },
  pickerPrimary: { flex: 1 },
});
