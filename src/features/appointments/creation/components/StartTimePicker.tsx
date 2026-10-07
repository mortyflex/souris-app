// BeautIzzy — Appointment start-time picker
//
// THE control that chooses an Appointment START time, shared by Appointment
// creation (context row, Summary step) and Appointment editing: the shared
// 24-hour wheels (hours + 5-minute minutes) and an explicit Terminer action.
// Reaching 19:00 is one flick, not a series of + presses.
//
// It only reports the chosen time of day; each flow applies its own rule
// (creation: same date, operational day bounds — editing: same date, any
// hour). Durations — service, phase and processing time — are NOT chosen here:
// they keep their own ± controls.

import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { TimeWheelPicker } from '@/shared/ui/TimeWheelPicker';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { START_TIME_MINUTE_STEP, type StartTimeOfDay } from '../draft-start';

interface StartTimePickerProps {
  readonly startAt: Date;
  /** Hours offered, both inclusive. Defaults to the whole day. */
  readonly minHour?: number;
  readonly maxHour?: number;
  readonly onChange: (time: StartTimeOfDay) => void;
  readonly onDone: () => void;
}

export function StartTimePicker({ startAt, minHour, maxHour, onChange, onDone }: StartTimePickerProps) {
  return (
    <View style={styles.picker}>
      <TimeWheelPicker
        accessibilityLabel="Heure de début, heures et minutes"
        maxHour={maxHour}
        minHour={minHour}
        minuteStep={START_TIME_MINUTE_STEP}
        onChange={onChange}
        testID="start-time-wheel"
        value={{ hour: startAt.getHours(), minute: startAt.getMinutes() }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Terminer la modification de l'heure"
        hitSlop={spacing.sm}
        onPress={onDone}
        style={({ pressed }) => [styles.doneAction, pressed && styles.doneActionPressed]}
        testID="time-done"
      >
        <AppText variant="metadata" style={styles.doneText}>
          Terminer
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.xs },
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
});
