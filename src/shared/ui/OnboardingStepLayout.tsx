// BeautIzzy — the ONE frame of the first-run screens
//
// Welcome, the account screens (sign-up, sign-in, email confirmation) and
// the five business setup steps all draw the same frame, so the professional
// perceives one continuous flow from the first launch to the ready app:
//
//   top and bottom safe areas on the warm screen background;
//   a quiet top bar — an optional glass back button on the left, and in the
//   centre either the setup progress or a compact brand mark (the account
//   screens), nothing on Welcome;
//   an optional illustration (the hero of Welcome, a compact accent on the
//   setup steps, none on the account forms — the brand mark carries them);
//   an optional uppercase eyebrow, the title and its supporting line;
//   the screen's own content;
//   a fixed footer holding the primary action and its optional secondary.
//
// The body scrolls and avoids the keyboard, so the primary action stays
// reachable on a small phone with a form open. The two framing steps
// (Welcome, setup complete) centre their composition when it is shorter than
// the viewport.
//
// The illustration is the hero of Welcome (about 40 % of the window height
// on a current iPhone, less on an iPhone SE) and a compact accent on the
// other steps; it is capped so a Pro Max never inflates it. It is drawn as
// supplied (`contain`) and hidden from assistive technology: the title says
// what the step is about.
//
// Entrance: one short, quiet sequence — the illustration fades in with a
// small rise, then the copy, the content and the footer each fade in a
// breath later. Nothing waits for anything: the whole sequence is over in
// well under half a second. Reduced motion renders everything in place.

import { useEffect, type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { BrandMark, brandMarkInsets } from './BrandMark';
import { GlassIconButton, glassIcons, glassIconButtonSize } from './GlassIconButton';
import { easing, gutter, radii, semanticColors, spacing } from './theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

/** Window heights at or under this are treated as a small phone (iPhone SE: 667). */
const SMALL_WINDOW_HEIGHT = 700;

const ENTRANCE_DURATION = 260;
const ENTRANCE_RISE = 10;
const entranceEasing = Easing.bezier(...easing.out);
/** Delays of the four entrance groups: the last one starts well under half a second in. */
const entranceDelays = { illustration: 0, header: 60, content: 120, footer: 180 } as const;

/** Width of the editorial brand mark in the top bar of the account screens. */
const TOP_BAR_BRAND_WIDTH = 112;
/**
 * Rendered width of the editorial brand mark above the Discovery pager. The PNG
 * carries ~3.7 % of transparent padding on each side, so the ARTWORK reads
 * ≈ 215 dp wide (≈ 180 on a small phone); its vertical padding is pulled back
 * with negative margins, so the layout spends only the visible height.
 */
const COMPACT_BRAND_WIDTH = 232;
const COMPACT_BRAND_WIDTH_SMALL = 194;

export type OnboardingIllustrationSize = 'hero' | 'compact';

export interface OnboardingProgress {
  /** 1-based position among the steps that show progress. */
  readonly current: number;
  readonly total: number;
}

/**
 * Side of the (square) illustration for a window height: a share of the
 * height, smaller on a small phone, capped on a tall one. Exported for tests.
 */
export function resolveIllustrationSide(windowHeight: number, size: OnboardingIllustrationSize): number {
  const small = windowHeight <= SMALL_WINDOW_HEIGHT;
  if (size === 'hero') {
    const ratio = small ? 0.3 : 0.4;
    return Math.round(Math.min(340, Math.max(180, windowHeight * ratio)));
  }
  const ratio = small ? 0.17 : 0.22;
  return Math.round(Math.min(200, Math.max(112, windowHeight * ratio)));
}

interface EntranceProps {
  readonly delay: number;
  readonly rise?: boolean;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/** Fades (and optionally rises) its content in once, on mount. */
function Entrance({ delay, rise = false, children, style }: EntranceProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.set(1);
      return;
    }
    progress.set(withDelay(delay, withTiming(1, { duration: ENTRANCE_DURATION, easing: entranceEasing })));
  }, [delay, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: rise ? (1 - progress.get()) * ENTRANCE_RISE : 0 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** The editorial mark of Discovery, its transparent vertical padding pulled back. */
function CompactBrandMark({ small }: { readonly small: boolean }) {
  const width = small ? COMPACT_BRAND_WIDTH_SMALL : COMPACT_BRAND_WIDTH;
  const insets = brandMarkInsets('editorial', width);
  return (
    <BrandMark
      size={width}
      style={{ marginBottom: -insets.bottom, marginTop: -insets.top }}
      variant="editorial"
    />
  );
}

/** The quiet setup progress: a thin lavender track, the accent fill. Spoken as a step count. */
function ProgressBar({ current, total }: OnboardingProgress) {
  const reducedMotion = useReducedMotion();
  const ratio = useSharedValue(reducedMotion ? current / total : 0);

  useEffect(() => {
    const target = current / total;
    ratio.set(reducedMotion ? target : withTiming(target, { duration: ENTRANCE_DURATION, easing: entranceEasing }));
  }, [current, ratio, reducedMotion, total]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${ratio.get() * 100}%` }));

  return (
    <View
      accessibilityLabel="Progression de la configuration"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current, text: `Étape ${current} sur ${total}` }}
      style={styles.progressTrack}
      testID="onboarding-progress"
    >
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

export type OnboardingTitleTone = 'foreground' | 'accent';

interface OnboardingStepLayoutProps {
  /** Absent on the account forms: the brand mark in the top bar carries them. */
  readonly illustration?: ImageSourcePropType;
  readonly illustrationSize?: OnboardingIllustrationSize;
  /** Optional uppercase eyebrow above the title (the account screens: « COMPTE »). */
  readonly eyebrow?: string;
  /** Absent on Discovery, whose pages carry their own title and copy. */
  readonly title?: string;
  /**
   * Colour of the title only: `foreground` (navy) everywhere, `accent` on Welcome, where the
   * promise speaks in the brand violet under the logo. Typography and layout never change.
   */
  readonly titleTone?: OnboardingTitleTone;
  readonly subtitle?: string;
  /** Title and subtitle alignment: centred on the two framing steps, leading on the working ones. */
  readonly align?: 'center' | 'start';
  /** The brand mark above the content: the primary lockup (`hero`), or the editorial mark rendered 232 dp wide — 194 on a small phone (`compact`, Discovery). */
  readonly brand?: boolean;
  readonly brandSize?: 'hero' | 'compact';
  /** A compact brand mark in the centre of the top bar (the account screens). Exclusive with `progress`. */
  readonly topBarBrand?: boolean;
  readonly progress?: OnboardingProgress;
  readonly onBack?: () => void;
  /** A compact action at the end of the top bar (Discovery: « Passer »). */
  readonly topBarEnd?: ReactNode;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
  readonly testID?: string;
}

export function OnboardingStepLayout({
  illustration,
  illustrationSize = 'compact',
  eyebrow,
  title,
  titleTone = 'foreground',
  subtitle,
  align = 'start',
  brand = false,
  brandSize = 'hero',
  topBarBrand = false,
  progress,
  onBack,
  topBarEnd,
  children,
  footer,
  testID,
}: OnboardingStepLayoutProps) {
  const { height: windowHeight } = useWindowDimensions();
  const side = resolveIllustrationSide(windowHeight, illustrationSize);
  const small = windowHeight <= SMALL_WINDOW_HEIGHT;
  const centred = align === 'center';
  const hasTopBar = onBack !== undefined || progress !== undefined || topBarBrand || topBarEnd !== undefined;
  const hasHeader = eyebrow !== undefined || title !== undefined || subtitle !== undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {hasTopBar && (
          <View style={styles.topBar}>
            <View style={styles.topBarSide}>
              {onBack && (
                <GlassIconButton
                  accessibilityLabel="Retour"
                  icon={glassIcons.back}
                  onPress={onBack}
                  testID="onboarding-back"
                />
              )}
            </View>
            <View style={styles.topBarCentre}>
              {progress && <ProgressBar {...progress} />}
              {topBarBrand && !progress && <BrandMark variant="editorial" size={TOP_BAR_BRAND_WIDTH} />}
            </View>
            <View style={[styles.topBarSide, topBarEnd !== undefined && styles.topBarEnd]}>{topBarEnd}</View>
          </View>
        )}
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={[
            styles.scrollContent,
            small && styles.scrollContentSmall,
            centred && styles.scrollContentCentred,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          testID="onboarding-scroll"
        >
          {brand && (
            <Entrance
              delay={entranceDelays.illustration}
              style={[styles.brand, brandSize === 'compact' && styles.brandCompact, brandSize === 'compact' && small && styles.brandCompactSmall]}
            >
              {brandSize === 'compact' ? (
                <CompactBrandMark small={small} />
              ) : (
                <BrandMark variant="primary" size={small ? 150 : 176} />
              )}
            </Entrance>
          )}
          {illustration !== undefined && (
            <Entrance delay={entranceDelays.illustration} rise style={styles.illustrationSlot}>
              <Image
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                resizeMode="contain"
                source={illustration}
                style={{ width: side, height: side }}
                testID="onboarding-illustration"
              />
            </Entrance>
          )}
          {hasHeader && (
            <Entrance delay={entranceDelays.header} style={[styles.header, centred && styles.headerCentred]}>
              {eyebrow !== undefined && (
                <AppText style={styles.eyebrow} variant="eyebrow">
                  {eyebrow}
                </AppText>
              )}
              <AppText
                accessibilityRole="header"
                style={[styles.title, titleTone === 'accent' && styles.titleAccent, centred && styles.textCentred]}
                variant={centred ? 'display' : 'screenTitle'}
              >
                {title}
              </AppText>
              <AppText variant="body" style={[styles.subtitle, centred && styles.textCentred]}>
                {subtitle}
              </AppText>
            </Entrance>
          )}
          {children !== undefined && (
            <Entrance delay={entranceDelays.content} rise style={styles.body}>
              {children}
            </Entrance>
          )}
        </ScrollView>
        <Entrance delay={entranceDelays.footer} style={styles.footer}>
          {footer}
        </Entrance>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  keyboardContainer: { flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: glassIconButtonSize + spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.xs,
  },
  // Both sides reserve the button's width so the centre stays centred.
  topBarSide: { width: glassIconButtonSize },
  // A text action is wider than the glass button: the slot grows, trailing-aligned.
  topBarEnd: { alignItems: 'flex-end', minWidth: glassIconButtonSize, width: undefined },
  topBarCentre: { alignItems: 'center', flex: 1, paddingHorizontal: spacing.lg },
  progressTrack: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 4,
    maxWidth: 200,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { backgroundColor: semanticColors.accent, borderRadius: radii.pill, height: '100%' },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  scrollContentSmall: { paddingTop: spacing.xs },
  // The two framing steps centre their composition between the top and the
  // footer when it is shorter than the viewport (an SE or a Pro Max would
  // otherwise leave a bottom-heavy blank); a taller composition scrolls as usual.
  scrollContentCentred: { justifyContent: 'center' },
  brand: { alignItems: 'center', paddingTop: spacing.lg },
  // Discovery: closer to the top bar, the illustration keeps its room.
  brandCompact: { paddingTop: spacing.md },
  brandCompactSmall: { paddingTop: spacing.xs },
  illustrationSlot: { alignItems: 'center', paddingVertical: spacing.sm },
  header: { gap: spacing.sm, paddingTop: spacing.md },
  headerCentred: { alignItems: 'center' },
  eyebrow: { color: semanticColors.accent },
  title: { color: semanticColors.foreground },
  // Welcome only: the brand violet, 4.9:1 on the screen background at display size.
  titleAccent: { color: semanticColors.accent },
  subtitle: { color: semanticColors.foregroundSoft, maxWidth: 360 },
  textCentred: { textAlign: 'center' },
  body: { gap: spacing.base, paddingTop: spacing.xl },
  footer: {
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
});
