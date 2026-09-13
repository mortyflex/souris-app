// Souris — Caisse day picker
//
// Direct selection of a historical day, reusing the canonical Souris date
// picker pattern (Appointment editing): the native wheel inside the shared
// BottomSheet on iOS, the native dialog on Android. No new picker.

import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/shared/ui/AppButton';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

import { startOfLocalDay } from '../presentation';

interface CashRegisterDayPickerProps {
  readonly visible: boolean;
  readonly day: Date;
  readonly onClose: () => void;
  readonly onSelect: (day: Date) => void;
}

export function CashRegisterDayPicker({ visible, day, onClose, onSelect }: CashRegisterDayPickerProps) {
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
      header={
        <SheetHeader action={{ label: 'Annuler', onPress: onClose }} eyebrow="CAISSE" title="Choisir un jour" />
      }
      onClose={onClose}
      testID="cash-register-day-picker"
      visible={visible}
    >
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
        <AppButton onPress={confirm} style={styles.primary} testID="confirm-cash-register-day" title="Confirmer" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.sm },
  secondary: { flex: 1 },
  primary: { flex: 1 },
});
