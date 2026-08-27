import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing, semanticColors } from './theme';

interface DisclosureChevronProps {
  readonly expanded: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

const transitionEasing = Easing.bezier(...easing.out);

export function DisclosureChevron({ expanded, style }: DisclosureChevronProps) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(expanded ? 90 : 0);

  useEffect(() => {
    rotation.set(
      withTiming(expanded ? 90 : 0, {
        duration: reducedMotion ? 0 : duration.disclosure,
        easing: transitionEasing,
      }),
    );
  }, [expanded, reducedMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
      style={[styles.container, animatedStyle, style]}
    >
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.accent}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
});
