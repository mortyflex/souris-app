// Souris — test double for the gesture-handler ReanimatedSwipeable
//
// Used through `jest.mock('react-native-gesture-handler/ReanimatedSwipeable',
// () => jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'))`
// by screens that render SwipeToDeleteRow under the lightweight Reanimated
// mock. No gesture runs: two probes per row simulate a release after a
// partial or a full swipe (translation set, then the primitive's
// onSwipeableWillOpen), the revealed actions stay rendered so the trash can
// be tapped, and `close` is observable. Never imported by application code.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export const SwipeDirection = { LEFT: 'left', RIGHT: 'right' } as const;

export const MOCK_PARTIAL_SWIPE_DISTANCE = 90;
export const MOCK_FULL_SWIPE_DISTANCE = 320;

interface MockSwipeableMethods {
  readonly close: () => void;
  readonly openLeft: () => void;
  readonly openRight: () => void;
  readonly reset: () => void;
}

interface MockSwipeableProps {
  readonly testID?: string;
  readonly children?: ReactNode;
  readonly onSwipeableWillOpen?: (direction: 'left' | 'right') => void;
  readonly renderLeftActions?: (
    progress: SharedValue<number>,
    translation: SharedValue<number>,
    methods: MockSwipeableMethods,
  ) => ReactNode;
}

const MockSwipeable = forwardRef<MockSwipeableMethods, MockSwipeableProps>(function MockSwipeable(
  props,
  ref,
) {
  const progress = useSharedValue(0);
  const translation = useSharedValue(0);
  const [pendingRelease, setPendingRelease] = useState(false);
  const [closedCount, setClosedCount] = useState(0);
  const methods = useMemo<MockSwipeableMethods>(
    () => ({
      close: () => {
        translation.set(0);
        progress.set(0);
        setClosedCount((count) => count + 1);
      },
      openLeft: () => undefined,
      openRight: () => undefined,
      reset: () => undefined,
    }),
    [progress, translation],
  );
  useImperativeHandle(ref, () => methods, [methods]);

  const { onSwipeableWillOpen } = props;
  useEffect(() => {
    if (!pendingRelease) return;
    setPendingRelease(false);
    onSwipeableWillOpen?.('right');
  }, [pendingRelease, onSwipeableWillOpen]);

  const swipe = (distance: number) => {
    translation.set(distance);
    progress.set(1);
    setPendingRelease(true);
  };

  return (
    <View testID={props.testID}>
      <Pressable
        testID={`${props.testID}-swipe-partial`}
        onPress={() => swipe(MOCK_PARTIAL_SWIPE_DISTANCE)}
      />
      <Pressable testID={`${props.testID}-swipe-full`} onPress={() => swipe(MOCK_FULL_SWIPE_DISTANCE)} />
      <Text testID={`${props.testID}-translation`}>{String(translation.get())}</Text>
      <Text testID={`${props.testID}-closed`}>{String(closedCount)}</Text>
      {props.renderLeftActions?.(progress, translation, methods)}
      {props.children}
    </View>
  );
});

export default MockSwipeable;
