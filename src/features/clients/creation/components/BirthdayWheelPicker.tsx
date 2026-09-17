// Souris — Birthday wheel picker (day + month, no year)
//
// A native-feeling two-column wheel on the shared `WheelColumn` mechanics
// (snapping, highlighted center row, one haptic per committed change). Two
// vertically snapping columns (Jour / Mois). No keyboard, no year column. The day column only
// offers the days of the selected month (February offers 29); when the month
// shrinks below the selected day the day resolves to the last valid one and
// the wheel settles there. The value is the canonical `{ month, day }` pair.

import { StyleSheet, View } from 'react-native';

import {
  BIRTHDAY_MONTH_NAMES,
  getBirthdayMonthLength,
  type ClientBirthday,
} from '@/domain/clients';
import { spacing } from '@/shared/ui/theme';
import { WheelColumn } from '@/shared/ui/WheelColumn';

export { WHEEL_ROW_HEIGHT } from '@/shared/ui/WheelColumn';

interface BirthdayWheelPickerProps {
  readonly value: ClientBirthday;
  readonly onChange: (value: ClientBirthday) => void;
}

export function BirthdayWheelPicker({ value, onChange }: BirthdayWheelPickerProps) {
  const monthLength = getBirthdayMonthLength(value.month);
  const days = Array.from({ length: monthLength }, (_, index) => index + 1);
  const months = BIRTHDAY_MONTH_NAMES.map((name, index) => ({ label: name, month: index + 1 }));

  const selectMonth = (month: number) => {
    // A day the new month lacks resolves to its last valid day.
    const day = Math.min(value.day, getBirthdayMonthLength(month));
    if (month !== value.month || day !== value.day) onChange({ month, day });
  };

  const selectDay = (day: number) => {
    if (day !== value.day) onChange({ month: value.month, day });
  };

  return (
    <View
      accessibilityLabel="Anniversaire, jour et mois"
      style={styles.wheels}
      testID="birthday-wheel"
    >
      <WheelColumn
        accessibilityLabel="Jour"
        items={days.map((day) => ({ key: String(day), label: String(day), value: day }))}
        onSelect={selectDay}
        selected={value.day}
        testID="birthday-wheel-day"
        title="Jour"
      />
      <WheelColumn
        accessibilityLabel="Mois"
        items={months.map(({ label, month }) => ({ key: String(month), label, value: month }))}
        onSelect={selectMonth}
        selected={value.month}
        testID="birthday-wheel-month"
        title="Mois"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: spacing.md },
});
