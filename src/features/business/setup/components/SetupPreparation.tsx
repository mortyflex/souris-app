// BeautIzzy — « On prépare votre espace… », the interlude before the recap
//
// A short visual moment between the last setup decision and « Votre espace
// BeautIzzy est prêt ». It is NOT a loading state: everything was already
// created and written before it appears, it waits for nothing, and it ends
// on a fixed clock (`setupPreparation.total`, about three seconds).
//
//   0.0 s   the lavender halo and the brand symbol settle in (scale + fade);
//   0.2 s   the copy follows a breath later;
//   0.7 s   everything is in place: the composition HOLDS, fully visible,
//           while one soft accent ring breathes out of the halo, once, and a
//           thin accent line keeps filling under the copy — never a spinner;
//   2.5 s   the whole composition fades and settles;
//   2.9 s   `onFinished` mounts the recap.
//
// `onFinished` is called exactly once, by a timer cleared on unmount. The
// caller never mounts this under Reduced Motion: the recap appears at once.

import { useEffect, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { easing, radii, semanticColors, setupPreparation, spacing } from '@/shared/ui/theme';

export const SETUP_PREPARATION_TITLE = 'On prépare votre espace…';
export const SETUP_PREPARATION_SUBTITLE = 'Quelques petites touches pour que tout soit parfait.';

/** Window heights at or under this are treated as a small phone (iPhone SE: 667). */
const SMALL_WINDOW_HEIGHT = 700;
const HALO_SIDE = { regular: 132, small: 108 } as const;
const FILL_WIDTH = 120;

const settle = Easing.bezier(...easing.out);
const breathe = Easing.out(Easing.quad);

export interface SetupPreparationProps {
  readonly onFinished: () => void;
}

export function SetupPreparation({ onFinished }: SetupPreparationProps) {
  const { height: windowHeight } = useWindowDimensions();
  const halo = windowHeight <= SMALL_WINDOW_HEIGHT ? HALO_SIDE.small : HALO_SIDE.regular;

  const enter = useSharedValue(0);
  const copy = useSharedValue(0);
  const ring = useSharedValue(0);
  const fill = useSharedValue(0);
  const exit = useSharedValue(0);

  // The latest callback, so a re-render never restarts the clock.
  const finish = useRef(onFinished);
  useEffect(() => {
    finish.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    enter.set(withTiming(1, { duration: setupPreparation.enter, easing: settle }));
    copy.set(withDelay(setupPreparation.copyDelay, withTiming(1, { duration: setupPreparation.enter, easing: settle })));
    ring.set(withDelay(setupPreparation.ringDelay, withTiming(1, { duration: setupPreparation.ring, easing: breathe })));
    fill.set(withTiming(1, { duration: setupPreparation.fill, easing: Easing.inOut(Easing.quad) }));
    exit.set(
      withDelay(
        setupPreparation.total - setupPreparation.exit,
        withTiming(1, { duration: setupPreparation.exit, easing: settle }),
      ),
    );
    const timer = setTimeout(() => finish.current(), setupPreparation.total);
    return () => clearTimeout(timer);
  }, [copy, enter, exit, fill, ring]);

  const compositionStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.get(),
    transform: [{ scale: 1 - exit.get() * 0.03 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: enter.get(),
    transform: [{ scale: 0.86 + enter.get() * 0.14 }],
  }));
  const symbolStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + enter.get() * 0.08 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: enter.get() * (1 - ring.get()) * 0.5,
    transform: [{ scale: 1 + ring.get() * 0.32 }],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.get(),
    transform: [{ translateY: (1 - copy.get()) * 8 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() * FILL_WIDTH }));

  const circle = (side: number) => ({ width: side, height: side, borderRadius: side / 2 });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea} testID="onboarding-preparing">
      <Animated.View
        accessible
        accessibilityLabel={`${SETUP_PREPARATION_TITLE} ${SETUP_PREPARATION_SUBTITLE}`}
        accessibilityLiveRegion="polite"
        style={[styles.composition, compositionStyle]}
      >
        <View style={[styles.haloSlot, circle(halo)]}>
          <Animated.View style={[styles.ring, circle(halo), ringStyle]} />
          <Animated.View style={[styles.halo, circle(halo), haloStyle]}>
            <View style={[styles.core, circle(Math.round(halo * 0.7))]}>
              <Animated.View style={symbolStyle}>
                <BrandMark decorative size={Math.round(halo * 0.26)} variant="symbol" />
              </Animated.View>
            </View>
          </Animated.View>
        </View>
        <Animated.View style={[styles.copy, copyStyle]}>
          <AppText style={styles.title} variant="screenTitle">
            {SETUP_PREPARATION_TITLE}
          </AppText>
          <AppText style={styles.subtitle} variant="body">
            {SETUP_PREPARATION_SUBTITLE}
          </AppText>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  composition: {
    alignItems: 'center',
    flex: 1,
    gap: spacing['3xl'],
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  haloSlot: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderColor: semanticColors.accent, borderWidth: 1.5, position: 'absolute' },
  halo: { alignItems: 'center', backgroundColor: semanticColors.surfaceLavenderStrong, justifyContent: 'center' },
  core: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderLavender,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  copy: { alignItems: 'center', gap: spacing.sm },
  title: { color: semanticColors.foreground, textAlign: 'center' },
  subtitle: { color: semanticColors.foregroundSoft, maxWidth: 320, textAlign: 'center' },
  track: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 3,
    marginTop: spacing.base,
    overflow: 'hidden',
    width: FILL_WIDTH,
  },
  fill: { backgroundColor: semanticColors.accent, borderRadius: radii.pill, height: '100%' },
});
