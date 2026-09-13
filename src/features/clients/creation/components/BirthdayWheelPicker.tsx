// Souris — Birthday wheel picker (day + month, no year)
//
// A native-feeling two-column wheel built with plain React Native ScrollViews
// (31 days and 12 months need no virtualization, and the wheel lives inside
// the Client form's own vertical ScrollView — a VirtualizedList there would
// break windowing). Two vertically snapping columns (Jour / Mois) with a
// highlighted center row. No keyboard, no year column. The day column only
// offers the days of the selected month (February offers 29); when the month
// shrinks below the selected day the day resolves to the last valid one and
// the wheel settles there. The value is the canonical `{ month, day }` pair.
//
// One restrained selection haptic per ACTUAL committed row change (scroll
// end / momentum end), never per scroll event and never for a programmatic
// correction.

import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  BIRTHDAY_MONTH_NAMES,
  getBirthdayMonthLength,
  type ClientBirthday,
} from '@/domain/clients';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

interface BirthdayWheelPickerProps {
  readonly value: ClientBirthday;
  readonly onChange: (value: ClientBirthday) => void;
}

export const WHEEL_ROW_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * VISIBLE_ROWS;
const EDGE_PADDING = WHEEL_ROW_HEIGHT * ((VISIBLE_ROWS - 1) / 2);

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

interface WheelItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

interface WheelColumnProps {
  readonly title: string;
  readonly accessibilityLabel: string;
  readonly items: readonly WheelItem[];
  readonly selected: number;
  readonly onSelect: (value: number) => void;
  readonly testID: string;
}

function WheelColumn({ title, accessibilityLabel, items, selected, onSelect, testID }: WheelColumnProps) {
  const scroll = useRef<ScrollView>(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selected),
  );
  const [centeredIndex, setCenteredIndex] = useState(selectedIndex);
  const [trackedIndex, setTrackedIndex] = useState(selectedIndex);
  // A committed value that changed from outside (hydration, or a day clamped
  // by a shorter month) re-centers the highlight before the next paint.
  if (trackedIndex !== selectedIndex) {
    setTrackedIndex(selectedIndex);
    setCenteredIndex(selectedIndex);
  }

  // …and the native scroll settles on that row, without any haptic.
  useEffect(() => {
    scroll.current?.scrollTo({ animated: true, y: selectedIndex * WHEEL_ROW_HEIGHT });
  }, [selectedIndex, items.length]);

  const indexAt = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.min(
      items.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.y / WHEEL_ROW_HEIGHT)),
    );

  // Visual highlight only while the wheel moves.
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAt(event);
    setCenteredIndex((current) => (current === index ? current : index));
  };

  // The snapped row is the selection; a real change gives one haptic.
  const commit = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAt(event);
    const item = items[index];
    if (!item) return;
    setCenteredIndex(index);
    if (item.value !== selected) {
      haptics.selection();
      onSelect(item.value);
    }
  };

  const selectedLabel = items[selectedIndex]?.label ?? '';

  return (
    <View style={styles.column}>
      <AppText variant="metadata" style={styles.columnTitle}>
        {title}
      </AppText>
      <View style={styles.wheel}>
        <View pointerEvents="none" style={styles.selectionBand} />
        <ScrollView
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="adjustable"
          accessibilityValue={{ text: selectedLabel }}
          contentContainerStyle={styles.wheelContent}
          contentOffset={{ x: 0, y: selectedIndex * WHEEL_ROW_HEIGHT }}
          decelerationRate="fast"
          nestedScrollEnabled
          onLayout={() =>
            scroll.current?.scrollTo({ animated: false, y: selectedIndex * WHEEL_ROW_HEIGHT })
          }
          onMomentumScrollEnd={commit}
          onScroll={handleScroll}
          onScrollEndDrag={(event) => {
            // A drag that stops without momentum still settles on a row.
            if (event.nativeEvent.velocity?.y === 0) commit(event);
          }}
          ref={scroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={WHEEL_ROW_HEIGHT}
          style={styles.list}
          testID={testID}
        >
          {/* Rows are decorative for assistive tech: the column announces the selection. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {items.map((item, index) => (
              <View key={item.key} style={styles.row} testID={`${testID}-row-${item.key}`}>
                <AppText
                  variant={index === centeredIndex ? 'rowTitle' : 'body'}
                  style={index === centeredIndex ? styles.rowSelected : styles.rowIdle}
                >
                  {item.label}
                </AppText>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.xs },
  columnTitle: { color: semanticColors.foregroundSoft, textAlign: 'center' },
  wheel: {
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
  },
  list: { flex: 1 },
  wheelContent: { paddingBottom: EDGE_PADDING, paddingTop: EDGE_PADDING },
  selectionBand: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.small,
    height: WHEEL_ROW_HEIGHT,
    left: spacing.xs,
    position: 'absolute',
    right: spacing.xs,
    top: EDGE_PADDING,
  },
  row: { alignItems: 'center', height: WHEEL_ROW_HEIGHT, justifyContent: 'center' },
  rowSelected: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  rowIdle: { color: semanticColors.foregroundSoft, fontVariant: ['tabular-nums'] },
});
