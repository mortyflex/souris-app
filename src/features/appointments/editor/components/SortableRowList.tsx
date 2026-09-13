// Souris — Sortable row list (Appointment service rows)
//
// THE drag-and-drop reordering of Appointment service rows, shared by the
// creation Résumé, « Modifier le rendez-vous » (through SortableDraftList)
// and Appointment Details. Generic over the row entry: callers provide the
// stable key, the accessible label and the row content; the list owns the
// gesture, the slot geometry and the move animation.
//
// Interaction: press and hold the explicit drag handle → the row lifts
// slightly → drag vertically → surrounding rows make room → release → the
// new order settles and `onReorder(fromIndex, toIndex)` fires ONCE. A
// caller that fails to commit the new order returns `false`, and the rows
// animate back into the entries' order. Ordinary taps, horizontal swipes and
// vertical scrolling never start a drag: only the handle, after a long press.
//
// SharedValue update discipline (Reanimated 4 shareables are frozen on the
// native side — object-backed shared values must never receive new
// properties after assignment):
//
//   - sharedOrder  (string[]):      whole-array reassignment only;
//   - sharedHeights (key → height): whole-object replacement from the JS
//                                   thread only, read-only inside worklets;
//   - activeKey / dragBase / dragTop: primitive shared values.
//
// Each row derives its top position from the current order + heights, so
// rows animate themselves (withTiming inside useAnimatedStyle) and the
// parent never maintains a mutated dictionary of positions. A row-local
// `positioned` guard renders the very first frame without animation to
// avoid an entrance slide.

import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/shared/lib/haptics';
import {
  duration,
  easing,
  interaction,
  semanticColors,
  shadowSource,
  spacing,
} from '@/shared/ui/theme';

export interface SortableRowRenderProps {
  /** The reorder handle, present only while the list is sortable; place it in the row header. */
  readonly dragHandle: ReactNode | undefined;
}

interface SortableRowListProps<TEntry> {
  readonly entries: readonly TEntry[];
  /** Stable business identity of the row — never an array index. */
  readonly getKey: (entry: TEntry) => string;
  /** Accessible name of the row (« Déplacer <label> »). */
  readonly getLabel: (entry: TEntry) => string;
  /**
   * Commits a drop. Returning `false` (a refused persistence) animates the
   * rows back into the current `entries` order; `void` / `true` means the
   * caller now owns the new order.
   */
  readonly onReorder: (fromIndex: number, toIndex: number) => boolean | void;
  readonly renderRow: (entry: TEntry, props: SortableRowRenderProps) => ReactNode;
  /** Disables the drag handle and gesture entirely (read-only lists). */
  readonly sortable?: boolean;
}

const GAP = spacing.sm;
const LONG_PRESS_MS = 200;
const MOVE_DURATION_MS = duration.disclosure;
const MOVE_EASING = Easing.bezier(...easing.out);

type HeightMap = Record<string, number>;

export function SortableRowList<TEntry>({
  entries,
  getKey,
  getLabel,
  onReorder,
  renderRow,
  sortable: sortingEnabled = true,
}: SortableRowListProps<TEntry>) {
  const [heights, setHeights] = useState<HeightMap>({});
  const reducedMotion = useReducedMotion();

  const sharedOrder = useSharedValue<string[]>([]);
  const sharedHeights = useSharedValue<HeightMap>({});
  const activeKey = useSharedValue<string | null>(null);
  const dragBase = useSharedValue(0);
  const dragTop = useSharedValue(0);

  const keys = entries.map(getKey);
  const sortable = sortingEnabled && entries.length > 1;
  const ready = keys.every((key) => heights[key] !== undefined);
  const totalHeight = keys.reduce(
    (total, key) => total + (heights[key] ?? 0) + GAP,
    keys.length > 0 ? -GAP : 0,
  );
  const moveDuration = reducedMotion ? 0 : MOVE_DURATION_MS;
  const liftDuration = reducedMotion ? 0 : duration.state;
  const orderSignature = keys.join('\n');

  useLayoutEffect(() => {
    // Whole-object replacement: never add properties to a shared object.
    sharedHeights.set({ ...heights });
  }, [heights, sharedHeights]);

  useLayoutEffect(() => {
    if (activeKey.get() !== null) {
      return;
    }
    sharedOrder.set(orderSignature.length > 0 ? orderSignature.split('\n') : []);
  }, [orderSignature, sharedOrder, activeKey]);

  const measure = (key: string) => (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setHeights((current) => {
      if (current[key] === height) {
        return current;
      }
      return { ...current, [key]: height };
    });
  };

  // A refused commit puts the rows back where the entries say they are.
  const commitReorder = (fromIndex: number, toIndex: number) => {
    if (onReorder(fromIndex, toIndex) === false) {
      sharedOrder.set([...keys]);
    }
  };

  return (
    <View style={[styles.container, ready && { height: totalHeight }]}>
      {entries.map((entry, index) => {
        const key = getKey(entry);
        return (
          <SortableRow
            key={key}
            activeKey={activeKey}
            dragBase={dragBase}
            dragTop={dragTop}
            fromIndex={index}
            label={getLabel(entry)}
            liftDuration={liftDuration}
            measure={measure(key)}
            moveDuration={moveDuration}
            onReorder={commitReorder}
            ready={ready}
            rowKey={key}
            sharedHeights={sharedHeights}
            sharedOrder={sharedOrder}
            sortable={sortable}
          >
            {(dragHandle) => renderRow(entry, { dragHandle })}
          </SortableRow>
        );
      })}
    </View>
  );
}

function triggerDragStartHaptic() {
  haptics.dragStart();
}

function triggerDragEndHaptic() {
  haptics.dragEnd();
}

interface DragGestureParams {
  readonly rowKey: string;
  readonly fromIndex: number;
  readonly activeKey: SharedValue<string | null>;
  readonly dragBase: SharedValue<number>;
  readonly dragTop: SharedValue<number>;
  readonly sharedHeights: SharedValue<HeightMap>;
  readonly sharedOrder: SharedValue<string[]>;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

function buildPanGesture(params: DragGestureParams) {
  const {
    rowKey,
    fromIndex,
    activeKey,
    dragBase,
    dragTop,
    sharedHeights,
    sharedOrder,
    onReorder,
  } = params;

  const indexOf = (id: string): number => {
    'worklet';
    const order = sharedOrder.get();
    for (let index = 0; index < order.length; index += 1) {
      if (order[index] === id) {
        return index;
      }
    }
    return -1;
  };

  const slotTopOf = (id: string): number => {
    'worklet';
    const rowHeights = sharedHeights.get();
    let top = 0;
    for (const otherId of sharedOrder.get()) {
      if (otherId === id) {
        break;
      }
      top += (rowHeights[otherId] ?? 0) + GAP;
    }
    return top;
  };

  const computeInsertIndex = (id: string, fingerTop: number): number => {
    'worklet';
    const rowHeights = sharedHeights.get();
    const draggedCenter = fingerTop + (rowHeights[id] ?? 0) / 2;
    let cursor = 0;
    let insertIndex = 0;
    for (const otherId of sharedOrder.get()) {
      if (otherId === id) {
        continue;
      }
      const otherCenter = cursor + (rowHeights[otherId] ?? 0) / 2;
      if (otherCenter < draggedCenter) {
        insertIndex += 1;
      }
      cursor += (rowHeights[otherId] ?? 0) + GAP;
    }
    return insertIndex;
  };

  return Gesture.Pan()
    .withTestId(`reorder-${rowKey}`)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      'worklet';
      activeKey.set(rowKey);
      dragBase.set(slotTopOf(rowKey));
      dragTop.set(dragBase.get());
      scheduleOnRN(triggerDragStartHaptic);
    })
    .onUpdate((event) => {
      'worklet';
      if (activeKey.get() !== rowKey) {
        return;
      }
      const fingerTop = dragBase.get() + event.translationY;
      dragTop.set(fingerTop);

      const currentIndex = indexOf(rowKey);
      const insertIndex = computeInsertIndex(rowKey, fingerTop);
      if (currentIndex >= 0 && insertIndex !== currentIndex) {
        // Whole-array reassignment: the order array is never mutated in place.
        const nextOrder: string[] = [];
        for (const otherId of sharedOrder.get()) {
          if (otherId !== rowKey) {
            nextOrder.push(otherId);
          }
        }
        nextOrder.splice(insertIndex, 0, rowKey);
        sharedOrder.set(nextOrder);
      }
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (activeKey.get() !== rowKey) {
        return;
      }
      const finalIndex = indexOf(rowKey);
      // Releasing the active flag makes the row's derived style animate
      // itself into its final slot; no explicit position write is needed.
      activeKey.set(null);
      if (!success) {
        const restoredOrder: string[] = [];
        for (const otherId of sharedOrder.get()) {
          if (otherId !== rowKey) {
            restoredOrder.push(otherId);
          }
        }
        restoredOrder.splice(fromIndex, 0, rowKey);
        sharedOrder.set(restoredOrder);
        return;
      }
      scheduleOnRN(triggerDragEndHaptic);
      if (finalIndex >= 0 && finalIndex !== fromIndex) {
        scheduleOnRN(onReorder, fromIndex, finalIndex);
      }
    });
}

function DragHandle({
  dragGesture,
  label,
}: {
  readonly dragGesture: ReturnType<typeof buildPanGesture>;
  readonly label: string;
}) {
  return (
    <GestureDetector gesture={dragGesture}>
      <View
        accessibilityLabel={`Déplacer ${label}`}
        accessibilityRole="adjustable"
        style={styles.dragHandle}
      >
        <SymbolView
          name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
          size={16}
          tintColor={semanticColors.foregroundMuted}
        />
      </View>
    </GestureDetector>
  );
}

interface SortableRowProps {
  readonly rowKey: string;
  readonly label: string;
  readonly fromIndex: number;
  readonly activeKey: SharedValue<string | null>;
  readonly dragBase: SharedValue<number>;
  readonly dragTop: SharedValue<number>;
  readonly sharedHeights: SharedValue<HeightMap>;
  readonly sharedOrder: SharedValue<string[]>;
  readonly moveDuration: number;
  readonly liftDuration: number;
  readonly ready: boolean;
  readonly sortable: boolean;
  readonly measure: (event: LayoutChangeEvent) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly children: (dragHandle: ReactNode | undefined) => ReactNode;
}

function SortableRow({
  rowKey,
  label,
  fromIndex,
  activeKey,
  dragBase,
  dragTop,
  sharedHeights,
  sharedOrder,
  moveDuration,
  liftDuration,
  ready,
  sortable,
  measure,
  onReorder,
  children,
}: SortableRowProps) {
  // Row-local primitive shared value: true once the row has rendered its
  // first absolute frame. The first frame is applied directly so the row
  // never animates in from top 0 when the list switches to absolute mode.
  const positioned = useSharedValue(false);
  const dragGesture = useMemo(
    () =>
      buildPanGesture({
        rowKey,
        fromIndex,
        activeKey,
        dragBase,
        dragTop,
        sharedHeights,
        sharedOrder,
        onReorder,
      }),
    [activeKey, dragBase, dragTop, fromIndex, onReorder, rowKey, sharedHeights, sharedOrder],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = activeKey.get() === rowKey;

    let slot = 0;
    const rowHeights = sharedHeights.get();
    for (const otherId of sharedOrder.get()) {
      if (otherId === rowKey) {
        break;
      }
      slot += (rowHeights[otherId] ?? 0) + GAP;
    }

    let top = slot;
    if (isActive) {
      top = dragTop.get();
    } else if (ready) {
      // The updater also runs while the row is still in flow layout. Only
      // consume the first-frame guard once absolute positioning is active.
      if (!positioned.get()) {
        positioned.set(true);
      } else {
        top = withTiming(slot, { duration: moveDuration, easing: MOVE_EASING });
      }
    }

    return {
      top,
      zIndex: isActive ? 10 : 0,
      transform: [
        {
          scale: withTiming(isActive ? interaction.dragLiftScale : 1, {
            duration: liftDuration,
          }),
        },
      ],
      shadowColor: shadowSource.navy,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: withTiming(isActive ? 0.16 : 0, { duration: liftDuration }),
      shadowRadius: 12,
    };
  });

  return (
    <Animated.View
      onLayout={measure}
      style={[ready ? styles.rowAbsolute : styles.rowFlow, ready && animatedStyle]}
      testID={`sortable-row-${rowKey}`}
    >
      {children(sortable ? <DragHandle dragGesture={dragGesture} label={label} /> : undefined)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  rowFlow: { marginBottom: GAP },
  rowAbsolute: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dragHandle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 44,
  },
});
