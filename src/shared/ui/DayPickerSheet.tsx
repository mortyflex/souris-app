// Souris — DayPickerSheet
//
// Direct selection of one local day: the calendar button of the shared
// DateNavigator (Agenda Jour, Caisse Jour). It reuses the canonical Souris
// date picker pattern (Appointment editing): the native wheel inside the
// shared BottomSheet on iOS, the native dialog on Android. No new picker.
// The sheet carries no VISIBLE heading: the wheel and its two actions say it
// all. Screen readers still land on a « Choisir une date » header first, an
// accessibility-only element that draws nothing and takes no room.
// The caller owns the selected day; cancelling never changes it.

import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppButton } from './AppButton';
import { BottomSheet } from './BottomSheet';
import { semanticColors, spacing } from './theme';

interface DayPickerSheetProps {
  readonly visible: boolean;
  readonly day: Date;
  readonly onClose: () => void;
  /** Receives the chosen day at local midnight. */
  readonly onSelect: (day: Date) => void;
  readonly testID?: string;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function DayPickerSheet({
  visible,
  day,
  onClose,
  onSelect,
  testID = 'day-picker',
}: DayPickerSheetProps) {
  const [draftDay, setDraftDay] = useState(day);
  // Every presentation starts from the currently selected day (derived
  // during render, not in an effect).
  const [presentedVisible, setPresentedVisible] = useState(visible);
  if (visible !== presentedVisible) {
    setPresentedVisible(visible);
    if (visible) setDraftDay(day);
  }

  const confirm = () => onSelect(startOfLocalDay(draftDay));

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        accentColor={semanticColors.accent}
        mode="date"
        onDismiss={onClose}
        onValueChange={(_event, date) => {
          if (date) onSelect(startOfLocalDay(date));
          else onClose();
        }}
        presentation="dialog"
        value={draftDay}
      />
    );
  }

  return (
    <BottomSheet
      backdropLabel="Annuler la sélection de date"
      onClose={onClose}
      testID={testID}
      visible={visible}
    >
      <View
        accessible
        accessibilityLabel="Choisir une date"
        accessibilityRole="header"
        style={styles.screenReaderHeading}
        testID={`${testID}-heading`}
      />
      <DateTimePicker
        accentColor={semanticColors.accent}
        display="spinner"
        locale="fr_FR"
        mode="date"
        onValueChange={(_event, date) => setDraftDay(date ?? draftDay)}
        value={draftDay}
      />
      <View style={styles.footer}>
        <AppButton onPress={onClose} style={styles.secondary} title="Annuler" variant="secondary" />
        <AppButton onPress={confirm} style={styles.primary} testID={`${testID}-confirm`} title="Confirmer" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Out of the layout flow and empty: focusable by VoiceOver, invisible on screen.
  screenReaderHeading: { height: 1, left: 0, position: 'absolute', top: 0, width: 1 },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.sm },
  secondary: { flex: 1 },
  primary: { flex: 1 },
});
