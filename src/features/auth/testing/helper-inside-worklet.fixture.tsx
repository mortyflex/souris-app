// Souris — DELIBERATELY BROKEN fixture for worklet-closures.test.ts.
//
// Never import this from application code. It reproduces the Welcome runtime
// bug: `clamp` is declared inside a worklet, the React Compiler hoists it out
// as a plain `_temp` function, and the worklet then captures a non-worklet.
// The file exists on disk because the worklets Babel plugin reads its source.

import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export function useBrokenLean() {
  const x = useSharedValue(0);
  return useAnimatedStyle(() => {
    const clamp = (value: number) => Math.max(-2, Math.min(2, value));
    return { transform: [{ translateX: clamp(x.get()) }] };
  });
}
