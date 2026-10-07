// BeautIzzy — WheelColumn
//
// ONE vertically snapping wheel column, the mechanics shared by every BeautIzzy
// wheel (birthday day / month, appointment start time). Built with a plain
// React Native ScrollView: the lists are short (no virtualization needed) and
// a wheel usually lives inside a form's own vertical ScrollView, where a
// VirtualizedList would break windowing.
//
// - rows snap to the highlighted center band; inertial scrolling is native;
// - the centered row is highlighted WHILE the wheel moves, the selection is
//   committed only when it settles (momentum end, or a drag released at rest);
// - one restrained selection haptic per ACTUAL committed change — never per
//   scroll event and never for a programmatic correction;
// - a value changed from outside re-centers the highlight and the wheel;
// - `fade` progressively de-emphasizes the rows around the selection;
// - assistive tech gets ONE adjustable element per column (increment /
//   decrement move one row); the rows themselves are decorative.
//
// Each column owns its ScrollView, so scrolling one wheel never moves another.

import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import { radii, semanticColors, spacing } from './theme';

export interface WheelItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Spoken value; defaults to the label. */
  readonly accessibilityText?: string;
}

interface WheelColumnProps {
  /** Optional caption above the wheel. */
  readonly title?: string;
  readonly accessibilityLabel: string;
  readonly items: readonly WheelItem[];
  readonly selected: number;
  readonly onSelect: (value: number) => void;
  /** Progressively de-emphasizes the rows away from the selection. */
  readonly fade?: boolean;
  readonly testID: string;
}

export const WHEEL_ROW_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * VISIBLE_ROWS;
const EDGE_PADDING = WHEEL_ROW_HEIGHT * ((VISIBLE_ROWS - 1) / 2);
/** Opacity by distance from the centered row, when `fade` is on. */
const FADE_BY_DISTANCE = [1, 0.62, 0.34] as const;

export function WheelColumn({
  title,
  accessibilityLabel,
  items,
  selected,
  onSelect,
  fade = false,
  testID,
}: WheelColumnProps) {
  const scroll = useRef<ScrollView>(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selected),
  );
  const [centeredIndex, setCenteredIndex] = useState(selectedIndex);
  const [trackedIndex, setTrackedIndex] = useState(selectedIndex);
  // A committed value that changed from outside (hydration, or a value clamped
  // by a rule) re-centers the highlight before the next paint.
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

  const selectedItem = items[selectedIndex];

  return (
    <View style={styles.column}>
      {title !== undefined && (
        <AppText variant="metadata" style={styles.columnTitle}>
          {title}
        </AppText>
      )}
      <View style={styles.wheel}>
        <View pointerEvents="none" style={styles.selectionBand} />
        <ScrollView
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="adjustable"
          accessibilityValue={{ text: selectedItem?.accessibilityText ?? selectedItem?.label ?? '' }}
          contentContainerStyle={styles.wheelContent}
          contentOffset={{ x: 0, y: selectedIndex * WHEEL_ROW_HEIGHT }}
          decelerationRate="fast"
          nestedScrollEnabled
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            const next = items[selectedIndex + delta];
            if (next) onSelect(next.value);
          }}
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
            {items.map((item, index) => {
              const distance = Math.abs(index - centeredIndex);
              return (
                <View
                  key={item.key}
                  style={[
                    styles.row,
                    fade && {
                      opacity: FADE_BY_DISTANCE[Math.min(distance, FADE_BY_DISTANCE.length - 1)],
                    },
                  ]}
                  testID={`${testID}-row-${item.key}`}
                >
                  <AppText
                    variant={distance === 0 ? 'rowTitle' : 'body'}
                    style={distance === 0 ? styles.rowSelected : styles.rowIdle}
                  >
                    {item.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
