// Souris — Product image reveal
//
// Wraps ProductImage with the "sticker placed on the form" micro-interaction:
// each time the image URI changes (photo taken, library pick, background
// removal finished) the visual scales/fades in with a short, restrained
// settle. Reduced motion renders the final state directly. The animation is
// purely presentational — it never touches the draft or the URI itself.

import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing } from '@/shared/ui/theme';

import { ProductImage, type ProductImageVariant } from './ProductImage';

interface ProductImageRevealProps {
  readonly imageUri?: string;
  readonly productName?: string;
  readonly variant: ProductImageVariant;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const REVEAL_SCALE_FROM = 0.82;
const REVEAL_ROTATION_FROM = -5;
const fadeEasing = Easing.bezier(...easing.out);
const settleSpring = { damping: 14, mass: 0.6, stiffness: 220 } as const;

export function ProductImageReveal({
  imageUri,
  productName,
  variant,
  testID,
  style,
}: ProductImageRevealProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!imageUri || reducedMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withSpring(1, settleSpring));
  }, [imageUri, progress, reducedMotion]);

  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!imageUri || reducedMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(0);
    opacity.set(withTiming(1, { duration: duration.settle, easing: fadeEasing }));
  }, [imageUri, opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: opacity.get(),
      transform: [
        { scale: REVEAL_SCALE_FROM + (1 - REVEAL_SCALE_FROM) * value },
        { rotate: `${REVEAL_ROTATION_FROM * (1 - value)}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      <ProductImage
        imageUri={imageUri}
        productName={productName}
        testID={testID}
        variant={variant}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'flex-start' },
});
