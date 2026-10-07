// BeautIzzy — TimeWheelPicker
//
// A 24-hour time of day on two adjacent wheels — hours and minutes — built on
// the shared `WheelColumn` mechanics (native inertial scrolling, snapping, a
// highlighted center row, one haptic per committed change). No AM/PM, no
// keyboard. Each wheel owns its scroll view: moving one never moves the other.
//
// The minutes wheel offers the `minuteStep` grid (00, 05 … 55). A value that
// sits off that grid (an Appointment created at 09:36) is never silently
// rounded: that exact minute stays offered, in order, for as long as the picker
// is open — it only changes when the professional picks another one.
//
// The value is a plain `{ hour, minute }` pair; what it means for a date (same
// local day, bounds) belongs to the caller's rules.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from './theme';
import { WheelColumn } from './WheelColumn';

export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

interface TimeWheelPickerProps {
  readonly value: TimeOfDay;
  readonly onChange: (value: TimeOfDay) => void;
  /** First and last hour offered, both inclusive. */
  readonly minHour?: number;
  readonly maxHour?: number;
  readonly minuteStep?: number;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const twoDigits = (value: number) => value.toString().padStart(2, '0');

export function TimeWheelPicker({
  value,
  onChange,
  minHour = 0,
  maxHour = 23,
  minuteStep = 5,
  accessibilityLabel = 'Heure, heures et minutes',
  testID = 'time-wheel',
}: TimeWheelPickerProps) {
  // The off-grid minute the picker opened with stays on the wheel (see above).
  const [openedMinute] = useState(value.minute);

  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index);
  // An hour outside the offered range (never the case for a clamped draft)
  // still shows instead of snapping the wheel to a wrong row.
  if (!hours.includes(value.hour)) hours.push(value.hour);
  hours.sort((left, right) => left - right);

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep);
  for (const offGrid of [openedMinute, value.minute]) {
    if (!minutes.includes(offGrid)) minutes.push(offGrid);
  }
  minutes.sort((left, right) => left - right);

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.wheels} testID={testID}>
      <WheelColumn
        accessibilityLabel="Heures"
        fade
        items={hours.map((hour) => ({
          accessibilityText: `${hour} heures`,
          key: String(hour),
          label: twoDigits(hour),
          value: hour,
        }))}
        onSelect={(hour) => onChange({ hour, minute: value.minute })}
        selected={value.hour}
        testID={`${testID}-hour`}
        title="Heures"
      />
      <WheelColumn
        accessibilityLabel="Minutes"
        fade
        items={minutes.map((minute) => ({
          accessibilityText: `${minute} minutes`,
          key: String(minute),
          label: twoDigits(minute),
          value: minute,
        }))}
        onSelect={(minute) => onChange({ hour: value.hour, minute })}
        selected={value.minute}
        testID={`${testID}-minute`}
        title="Minutes"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: spacing.md },
});
