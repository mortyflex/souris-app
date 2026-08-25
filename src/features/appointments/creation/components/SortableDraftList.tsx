// Souris — Sortable selected-services list (Appointment Creation)
//
// Drag-and-drop reordering of the SÉLECTIONNÉES drafts during creation.
//
// Interaction: press and hold the explicit drag handle → the card lifts
// slightly → drag vertically → surrounding cards make room → release → the
// new order settles. The long-press activation keeps normal scrolling,
// price/processing editing, and Retirer untouched.
//
// SharedValue update discipline (Reanimated 4 shareables are frozen on the
// native side — object-backed shared values must never receive new
// properties after assignment):
//
//   - sharedOrder  (string[]):      whole-array reassignment only;
//   - sharedHeights (id → height):  whole-object replacement from the JS
//                                   thread only, read-only inside worklets;
//   - activeId / dragBase / dragTop: primitive shared values.
//
// Each row derives its top position from the current order + heights, so
// rows animate themselves (withTiming inside useAnimatedStyle) and the
// parent never maintains a mutated dictionary of positions. A row-local
// `positioned` guard renders the very first frame without animation to
// avoid an entrance slide.
//
// serviceId is unique within the draft list by product rule: the selection
// toggle prevents duplicate selections of the same catalog service.

import { useLayoutEffect, useMemo, useState } from 'react';
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

import { colors, easing, shadowSource, spacing } from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import type { SelectedServiceDraft } from '../draft';
import { SelectedServiceCard } from './SelectedServiceCard';

export interface SortableDraftEntry {
  readonly draft: SelectedServiceDraft;
  readonly service: Service;
}

interface SortableDraftListProps {
  readonly entries: readonly SortableDraftEntry[];
  readonly expandedDraftId: string | null;
  readonly onToggleExpanded: (serviceId: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onUpdatePrice: (serviceId: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    serviceId: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
  readonly onRemove: (service: Service) => void;
}

const GAP = spacing.sm;
const LONG_PRESS_MS = 200;
const MOVE_DURATION_MS = 180;
const LIFT_DURATION_MS = 150;
const MOVE_EASING = Easing.bezier(...easing.out);

type HeightMap = Record<string, number>;

export function SortableDraftList({
  entries,
  expandedDraftId,
  onToggleExpanded,
  onReorder,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
}: SortableDraftListProps) {
  const [heights, setHeights] = useState<HeightMap>({});
  const reducedMotion = useReducedMotion();

  const sharedOrder = useSharedValue<string[]>([]);
  const sharedHeights = useSharedValue<HeightMap>({});
  const activeId = useSharedValue<string | null>(null);
  const dragBase = useSharedValue(0);
  const dragTop = useSharedValue(0);

  const sortable = entries.length > 1;
  const ready = entries.every((entry) => heights[entry.draft.serviceId] !== undefined);
  const totalHeight = entries.reduce(
    (total, entry) => total + (heights[entry.draft.serviceId] ?? 0) + GAP,
    entries.length > 0 ? -GAP : 0,
  );
  const moveDuration = reducedMotion ? 0 : MOVE_DURATION_MS;

  useLayoutEffect(() => {
    // Whole-object replacement: never add properties to a shared object.
    sharedHeights.set({ ...heights });
  }, [heights, sharedHeights]);

  useLayoutEffect(() => {
    if (activeId.get() !== null) {
      return;
    }
    sharedOrder.set(entries.map((entry) => entry.draft.serviceId));
  }, [entries, sharedOrder, activeId]);

  const measure = (serviceId: string) => (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setHeights((current) => {
      if (current[serviceId] === height) {
        return current;
      }
      return { ...current, [serviceId]: height };
    });
  };

  return (
    <View style={[styles.container, ready && { height: totalHeight }]}>
      {entries.map(({ draft, service }, index) => (
        <SortableRow
          key={draft.serviceId}
          activeId={activeId}
          dragBase={dragBase}
          draft={draft}
          dragTop={dragTop}
          fromIndex={index}
          measure={measure(draft.serviceId)}
          moveDuration={moveDuration}
          onRemove={() => onRemove(service)}
          onReorder={onReorder}
          onUpdatePhaseDuration={(phaseId, durationMinutes) =>
            onUpdatePhaseDuration(draft.serviceId, phaseId, durationMinutes)
          }
          onUpdatePrice={(price) => onUpdatePrice(draft.serviceId, price)}
          ready={ready}
          service={service}
          serviceId={draft.serviceId}
          sharedHeights={sharedHeights}
          sharedOrder={sharedOrder}
          sortable={sortable}
          expanded={expandedDraftId === draft.serviceId}
          onToggleExpanded={() => onToggleExpanded(draft.serviceId)}
        />
      ))}
    </View>
  );
}

interface DragGestureParams {
  readonly serviceId: string;
  readonly fromIndex: number;
  readonly activeId: SharedValue<string | null>;
  readonly dragBase: SharedValue<number>;
  readonly dragTop: SharedValue<number>;
  readonly sharedHeights: SharedValue<HeightMap>;
  readonly sharedOrder: SharedValue<string[]>;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

function buildPanGesture(params: DragGestureParams) {
  const {
    serviceId,
    fromIndex,
    activeId,
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
    const cardHeights = sharedHeights.get();
    let top = 0;
    for (const otherId of sharedOrder.get()) {
      if (otherId === id) {
        break;
      }
      top += (cardHeights[otherId] ?? 0) + GAP;
    }
    return top;
  };

  const computeInsertIndex = (id: string, fingerTop: number): number => {
    'worklet';
    const cardHeights = sharedHeights.get();
    const draggedCenter = fingerTop + (cardHeights[id] ?? 0) / 2;
    let cursor = 0;
    let insertIndex = 0;
    for (const otherId of sharedOrder.get()) {
      if (otherId === id) {
        continue;
      }
      const otherCenter = cursor + (cardHeights[otherId] ?? 0) / 2;
      if (otherCenter < draggedCenter) {
        insertIndex += 1;
      }
      cursor += (cardHeights[otherId] ?? 0) + GAP;
    }
    return insertIndex;
  };

  return Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      'worklet';
      activeId.set(serviceId);
      dragBase.set(slotTopOf(serviceId));
      dragTop.set(dragBase.get());
    })
    .onUpdate((event) => {
      'worklet';
      if (activeId.get() !== serviceId) {
        return;
      }
      const fingerTop = dragBase.get() + event.translationY;
      dragTop.set(fingerTop);

      const currentIndex = indexOf(serviceId);
      const insertIndex = computeInsertIndex(serviceId, fingerTop);
      if (currentIndex >= 0 && insertIndex !== currentIndex) {
        // Whole-array reassignment: the order array is never mutated in place.
        const nextOrder: string[] = [];
        for (const otherId of sharedOrder.get()) {
          if (otherId !== serviceId) {
            nextOrder.push(otherId);
          }
        }
        nextOrder.splice(insertIndex, 0, serviceId);
        sharedOrder.set(nextOrder);
      }
    })
    .onFinalize(() => {
      'worklet';
      if (activeId.get() !== serviceId) {
        return;
      }
      const finalIndex = indexOf(serviceId);
      // Releasing the active flag makes the row's derived style animate
      // itself into its final slot; no explicit position write is needed.
      activeId.set(null);
      if (finalIndex >= 0) {
        scheduleOnRN(onReorder, fromIndex, finalIndex);
      }
    });
}

function DragHandle({
  dragGesture,
  serviceName,
}: {
  readonly dragGesture: ReturnType<typeof buildPanGesture>;
  readonly serviceName: string;
}) {
  return (
    <GestureDetector gesture={dragGesture}>
      <View
        accessibilityLabel={`Déplacer ${serviceName}`}
        accessibilityRole="adjustable"
        style={styles.dragHandle}
      >
        <SymbolView
          name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
          size={16}
          tintColor={colors.muted}
        />
      </View>
    </GestureDetector>
  );
}

interface SortableRowProps {
  readonly draft: SelectedServiceDraft;
  readonly service: Service;
  readonly serviceId: string;
  readonly fromIndex: number;
  readonly activeId: SharedValue<string | null>;
  readonly dragBase: SharedValue<number>;
  readonly dragTop: SharedValue<number>;
  readonly sharedHeights: SharedValue<HeightMap>;
  readonly sharedOrder: SharedValue<string[]>;
  readonly moveDuration: number;
  readonly ready: boolean;
  readonly sortable: boolean;
  readonly expanded: boolean;
  readonly measure: (event: LayoutChangeEvent) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onToggleExpanded: () => void;
  readonly onUpdatePrice: (price: number) => void;
  readonly onUpdatePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly onRemove: () => void;
}

function SortableRow({
  draft,
  service,
  serviceId,
  fromIndex,
  activeId,
  dragBase,
  dragTop,
  sharedHeights,
  sharedOrder,
  moveDuration,
  ready,
  sortable,
  expanded,
  measure,
  onReorder,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
}: SortableRowProps) {
  // Row-local primitive shared value: true once the row has rendered its
  // first absolute frame. The first frame is applied directly so the row
  // never animates in from top 0 when the list switches to absolute mode.
  const positioned = useSharedValue(false);
  const dragGesture = useMemo(
    () =>
      buildPanGesture({
        serviceId,
        fromIndex,
        activeId,
        dragBase,
        dragTop,
        sharedHeights,
        sharedOrder,
        onReorder,
      }),
    [
      activeId,
      dragBase,
      dragTop,
      fromIndex,
      onReorder,
      serviceId,
      sharedHeights,
      sharedOrder,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = activeId.get() === serviceId;

    let slot = 0;
    const cardHeights = sharedHeights.get();
    for (const otherId of sharedOrder.get()) {
      if (otherId === serviceId) {
        break;
      }
      slot += (cardHeights[otherId] ?? 0) + GAP;
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
      transform: [{ scale: withTiming(isActive ? 1.02 : 1, { duration: LIFT_DURATION_MS }) }],
      shadowColor: shadowSource.navy,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: withTiming(isActive ? 0.14 : 0, { duration: LIFT_DURATION_MS }),
      shadowRadius: 8,
    };
  });

  return (
    <Animated.View
      onLayout={measure}
      style={[ready ? styles.rowAbsolute : styles.rowFlow, ready && animatedStyle]}
    >
      <SelectedServiceCard
        draft={draft}
        expanded={expanded}
        dragHandle={
          sortable ? <DragHandle dragGesture={dragGesture} serviceName={service.name} /> : undefined
        }
        onRemove={onRemove}
        onToggleExpanded={onToggleExpanded}
        onUpdatePhaseDuration={onUpdatePhaseDuration}
        onUpdatePrice={onUpdatePrice}
        service={service}
      />
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
