// BeautIzzy — Welcome
//
// The first screen of a fresh install: the primary brand logo, one promise,
// one primary action. No carousel, no marketing. The logo spans about three
// quarters of the hero's width, a horizontal band across its middle, and six
// beauty objects float around it (WelcomeMotifs). The hero — and only the hero — answers the finger: objects
// can be pushed and thrown, and drift back.

import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BrandMark, brandAssets } from '@/shared/ui/BrandMark';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

import {
  WELCOME_MOTIFS_HALF_HEIGHT,
  WelcomeMotifs,
  useWelcomeTouch,
  type WelcomeTouch,
} from './components/WelcomeMotifs';
import { parallaxOffset } from './components/welcome-force-field';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

/** The hero is drawn for this screen width and scales with the device. */
const REFERENCE_WIDTH = 393;
const MAX_COMPOSITION_WIDTH = 430;
/** Logo box width on the reference screen: the artwork (93 % of the box) spans ≈ 291 × 91 dp. */
const LOGO_WIDTH = 314;
/** Height the logo artwork needs for itself (half, with air), on the reference width. */
const LOGO_HALF_HEIGHT = 74;
/** Floor for very short heroes (large text sizes): the logo stays a logo. */
const MIN_SCALE = 0.6;
/** Sits the composition slightly below the centre of the hero, towards the copy. */
const HERO_TOP_INSET = spacing['3xl'];
/** Thrown objects bounce this far inside the hero's edges. */
const HERO_WALL_INSET = 4;
/** The logo barely leans away from the finger: at most this many dp. */
const LOGO_PARALLAX_MAX = 2.5;
const LOGO_PARALLAX_RATIO = 0.012;

export function WelcomeScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [hero, setHero] = useState<{ readonly width: number; readonly height: number } | null>(null);

  // The logo follows the screen width; the objects also follow the height
  // left to the hero, so a short hero pulls them in instead of shrinking the logo.
  const widthScale = Math.min(windowWidth, MAX_COMPOSITION_WIDTH) / REFERENCE_WIDTH;
  const usableHeight = hero === null ? null : hero.height - HERO_TOP_INSET;
  const logoScale =
    usableHeight === null
      ? widthScale
      : Math.max(MIN_SCALE, Math.min(widthScale, usableHeight / (2 * LOGO_HALF_HEIGHT)));
  const motifsVerticalScale =
    usableHeight === null
      ? widthScale
      : Math.max(MIN_SCALE, Math.min(widthScale, usableHeight / (2 * WELCOME_MOTIFS_HALF_HEIGHT)));

  const logoWidth = Math.round(LOGO_WIDTH * logoScale);
  const logoHeight = Math.round((logoWidth * brandAssets.primary.height) / brandAssets.primary.width);

  // Logo centre in the hero's own coordinates (the top inset shifts it down).
  const centre = { x: (hero?.width ?? windowWidth) / 2, y: ((hero?.height ?? 0) + HERO_TOP_INSET) / 2 };
  const { gesture, touch } = useWelcomeTouch(centre);
  // The walls the objects bounce off: the hero itself, a few dp in, relative to the logo centre.
  const bounds =
    hero === null
      ? null
      : {
          left: HERO_WALL_INSET - centre.x,
          right: hero.width - HERO_WALL_INSET - centre.x,
          top: HERO_WALL_INSET - centre.y,
          bottom: hero.height - HERO_WALL_INSET - centre.y,
        };

  const onHeroLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setHero({ width, height });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID="welcome-screen">
      <GestureDetector gesture={gesture}>
        <View style={styles.hero} onLayout={onHeroLayout} testID="welcome-hero">
          {/* Shown once the hero is measured, so short screens never flash the unscaled size. */}
          <View style={[styles.heroAnchor, hero === null && styles.unmeasured]}>
            <WelcomeMotifs bounds={bounds} scale={logoScale} touch={touch} verticalScale={motifsVerticalScale} />
            <LogoParallax touch={touch}>
              <BrandMark
                variant="primary"
                size={logoWidth}
                style={[styles.logo, { left: -logoWidth / 2, top: -logoHeight / 2 }]}
              />
            </LogoParallax>
          </View>
        </View>
      </GestureDetector>
      <View style={styles.copy}>
        <AppText variant="display" accessibilityRole="header" style={styles.headline}>
          {'Votre activité,\nsimplement organisée.'}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Agenda, clientèle, prestations et ventes, sans logiciel compliqué.
        </AppText>
      </View>
      <View style={styles.actions}>
        <AppButton onPress={() => router.push('/sign-up')} title="Commencer" />
        <AppButton
          onPress={() => router.push('/sign-in')}
          title="J’ai déjà un compte"
          variant="tertiary"
        />
      </View>
    </SafeAreaView>
  );
}

/** The logo stays put; it only leans a couple of dp away from the finger, on a soft spring. */
function LogoParallax({ touch, children }: { readonly touch: WelcomeTouch; readonly children: ReactNode }) {
  const leanX = useSharedValue(0);
  const leanY = useSharedValue(0);

  useAnimatedReaction(
    // Worklet: it may only call worklets (see welcome-force-field) — no helper declared in here.
    () =>
      touch.active.get() === 1
        ? parallaxOffset({ x: touch.x.get(), y: touch.y.get() }, LOGO_PARALLAX_RATIO, LOGO_PARALLAX_MAX)
        : { x: 0, y: 0 },
    (target, previous) => {
      if (previous !== null && previous.x === target.x && previous.y === target.y) return;
      leanX.set(withSpring(target.x, { damping: 18, stiffness: 90 }));
      leanY.set(withSpring(target.y, { damping: 18, stiffness: 90 }));
    },
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leanX.get() }, { translateY: leanY.get() }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  // Clipped: whatever the finger pushes around never draws over the copy.
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: HERO_TOP_INSET,
  },
  // Zero-size anchor at the logo centre: the logo and the objects are placed
  // around it, so the logo box never affects layout.
  heroAnchor: { height: 0, width: 0 },
  unmeasured: { opacity: 0 },
  logo: { position: 'absolute' },
  copy: { gap: spacing.md, paddingBottom: spacing['3xl'], paddingHorizontal: horizontalGutter },
  // The headline speaks in the navy of the logo above it.
  headline: { color: semanticColors.foreground },
  subtitle: { color: semanticColors.foregroundSoft, maxWidth: 320 },
  actions: { gap: spacing.sm, paddingBottom: spacing.base, paddingHorizontal: horizontalGutter },
});
