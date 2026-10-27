// BeautIzzy — Product Discovery: the signed-out first-launch experience
//
// Three horizontal pages inside the shared first-run frame, and no separate
// Welcome before them. A discreet editorial brand mark sits above the pager
// on every page; each page carries its own illustration (sized to the
// height the mark and the actions leave: `resolveDiscoveryIllustrationSide`),
// a navy display title and a soft supporting line — the brand violet is
// carried by the mark, the actions and the pills, never by a headline. The
// footer is
// identical on every page: three pagination pills (lavender, the current one
// a longer accent pill — the « Tops & tendances » convention), ONE primary
// action (« Continuer », then « Créer mon compte » on the last page) and the
// direct sign-in link « Déjà un compte ? Se connecter », so an existing user
// never has to skip or finish the tour. « Passer » sits at the end of the top
// bar on the first two pages only.
//
// Navigation (this screen is the root of the signed-out stack):
//   back              previous page; none on the first page
//   « Passer »        back to the first page (no animation), then sign-up by
//                     PUSH: back from sign-up returns to the first page, never
//                     to a slide the person declined
//   last page CTA     sign-up by PUSH: back from sign-up returns to the last page
//   « Se connecter »  sign-in by PUSH from any page: back returns to that page
//
// The page state is the single source of truth for the pills, the CTA label
// and VoiceOver: a finger swipe updates it as the nearest page passes the
// midpoint; a programmatic scroll sets it at once and ignores the intermediate
// offsets until the scroll settles. Reduced motion jumps instead of sliding.
// Nothing is persisted: an authenticated owner never reaches this screen, and
// a fresh install sees it again.

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { isPlaygroundAvailable } from '@/features/playground/availability';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { gutter, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';
import { useReduceMotion } from '@/shared/ui/useReduceMotion';

import {
  DISCOVERY_SIGN_IN_TITLE,
  DISCOVERY_SMALL_WINDOW_HEIGHT,
  DISCOVERY_SKIP_LABEL,
  DISCOVERY_SKIP_TITLE,
  DISCOVERY_SLIDES,
  clampDiscoveryPage,
  getDiscoveryPageLabel,
  getDiscoveryPrimaryTitle,
  isLastDiscoveryPage,
  resolveDiscoveryIllustrationSide,
  resolveDiscoveryPage,
} from './discovery-slides';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

/** Pills are 5 pt tall: the slop brings every pill to a 44 pt target without overlapping its neighbour. */
const PILL_HIT_SLOP = { bottom: 20, left: spacing.xs, right: spacing.xs, top: 20 } as const;

interface DiscoveryScreenProps {
  /** Opening page (tests and previews); the product always opens the first one. */
  readonly initialPage?: number;
}

export function DiscoveryScreen({ initialPage = 0 }: DiscoveryScreenProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [page, setPage] = useState(() => clampDiscoveryPage(initialPage));
  // The opening offset only: a later change of this prop would jump the native scroll.
  const [initialOffset] = useState(() => ({ x: clampDiscoveryPage(initialPage) * width, y: 0 }));
  const pager = useRef<ScrollView>(null);
  // Set while a programmatic scroll travels: the offsets it passes are not the finger's.
  const travelling = useRef(false);

  // The developer Playground (features/playground): a Staging development build only, nothing elsewhere.
  const playgroundAvailable = isPlaygroundAvailable();
  const side = resolveDiscoveryIllustrationSide(height);
  const small = height <= DISCOVERY_SMALL_WINDOW_HEIGHT;
  const last = isLastDiscoveryPage(page);

  const goTo = (index: number, animated = !reduceMotion) => {
    const target = clampDiscoveryPage(index);
    if (target === page) return;
    setPage(target);
    travelling.current = animated;
    pager.current?.scrollTo({ x: target * width, animated });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (travelling.current) return;
    const next = resolveDiscoveryPage(event.nativeEvent.contentOffset.x, width);
    if (next !== page) setPage(next);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    travelling.current = false;
    const settled = resolveDiscoveryPage(event.nativeEvent.contentOffset.x, width);
    if (settled !== page) setPage(settled);
  };

  const back = () => goTo(page - 1);

  const skip = () => {
    haptics.action();
    // Leave the tour at its entry: coming back from sign-up lands on the first page.
    goTo(0, false);
    router.push('/sign-up');
  };

  const forward = () => {
    haptics.action();
    if (last) {
      router.push('/sign-up');
      return;
    }
    goTo(page + 1);
  };

  const signIn = () => {
    haptics.action();
    router.push('/sign-in');
  };

  const openPlayground = () => {
    haptics.action();
    router.push('/playground');
  };

  const selectPage = (index: number) => {
    if (clampDiscoveryPage(index) === page) return;
    haptics.selection();
    goTo(index);
  };

  return (
    <OnboardingStepLayout
      align="center"
      brand
      brandSize="compact"
      footer={
        <>
          <View
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            accessibilityLabel={getDiscoveryPageLabel(page)}
            accessibilityRole="adjustable"
            accessible
            onAccessibilityAction={(event) =>
              selectPage(event.nativeEvent.actionName === 'increment' ? page + 1 : page - 1)
            }
            style={styles.pagination}
            testID="discovery-pagination"
          >
            {DISCOVERY_SLIDES.map((slide, index) => (
              <Pressable
                hitSlop={PILL_HIT_SLOP}
                key={slide.key}
                onPress={() => selectPage(index)}
                testID={`discovery-page-indicator-${slide.key}`}
              >
                <View style={[styles.pill, index === page && styles.pillActive]} />
              </Pressable>
            ))}
          </View>
          <AppButton onPress={forward} testID="discovery-primary" title={getDiscoveryPrimaryTitle(page)} />
          <AppButton onPress={signIn} testID="discovery-sign-in" title={DISCOVERY_SIGN_IN_TITLE} variant="tertiary" />
          {playgroundAvailable && (
            <AppButton
              accessibilityLabel="Playground développeur, mode démonstration"
              onPress={openPlayground}
              testID="discovery-playground"
              title="Playground développeur"
              variant="tertiary"
            />
          )}
        </>
      }
      onBack={page === 0 ? undefined : back}
      testID="discovery-screen"
      topBarEnd={
        last ? undefined : (
          <AppButton
            accessibilityLabel={DISCOVERY_SKIP_LABEL}
            onPress={skip}
            testID="discovery-skip"
            title={DISCOVERY_SKIP_TITLE}
            variant="tertiary"
          />
        )
      }
    >
      <ScrollView
        contentOffset={initialOffset}
        decelerationRate="fast"
        horizontal
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={onScroll}
        pagingEnabled
        ref={pager}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
        testID="discovery-pager"
      >
        {DISCOVERY_SLIDES.map((slide, index) => {
          const current = index === page;
          return (
            <View
              accessibilityElementsHidden={!current}
              importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
              key={slide.key}
              style={[styles.page, { width }]}
              testID={`discovery-page-${slide.key}`}
            >
              <View style={[styles.illustrationSlot, small && styles.illustrationSlotSmall]}>
                <Image
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  resizeMode="contain"
                  source={slide.illustration}
                  style={{ width: side, height: side }}
                  testID={`discovery-illustration-${slide.key}`}
                />
              </View>
              <View style={[styles.header, small && styles.headerSmall]}>
                <AppText accessibilityRole="header" style={styles.title} variant="display">
                  {slide.title}
                </AppText>
                <AppText style={styles.description} variant="body">
                  {slide.description}
                </AppText>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  // The pager bleeds to the window edges so each page is exactly one window wide.
  pager: { flexGrow: 0, marginHorizontal: -horizontalGutter },
  page: { alignItems: 'center', paddingHorizontal: horizontalGutter },
  // The same slots as the frame's own illustration and header.
  illustrationSlot: { alignItems: 'center', paddingVertical: spacing.sm },
  illustrationSlotSmall: { paddingVertical: spacing.xs },
  header: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  headerSmall: { paddingTop: spacing.sm },
  title: { color: semanticColors.foreground, textAlign: 'center' },
  description: { color: semanticColors.foregroundSoft, maxWidth: 360, textAlign: 'center' },
  pagination: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: spacing.md,
    marginBottom: spacing.xs,
  },
  pill: { backgroundColor: lavender.lav200, borderRadius: radii.pill, height: 5, width: 5 },
  pillActive: { backgroundColor: semanticColors.accent, width: 16 },
});
