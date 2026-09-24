// Souris — Caisse revenue heatmap hint
//
// What the halos of the Caisse month calendar mean, in one compact card that
// floats over the lower part of the days: a title, one sentence — RELATIVE
// to the other days of the month, never a euro range — a three-level legend
// drawn with the calendar's own halo (`MonthCalendarIntensitySwatch`), and
// « Compris ». Plus the discreet info control that reopens it. The Caisse
// owns both; the shared calendar only hosts them.
//
// The card materialises in place, every time it appears (first opening or
// ⓘ): from a touch smaller, lower and transparent, it settles with a nearly
// critically damped spring — no visible bounce — while it fades in; its
// three legend samples follow in a light stagger. « Compris » plays a shorter
// exit (fade, scale to 0.98, a few points down) before the card unmounts.
// Title, sentence and button move WITH the card: one object. Opacity and
// transform only, on the UI thread: the calendar underneath never re-lays
// out. Reduce Motion keeps a short opacity fade alone.

import { SymbolView } from 'expo-symbols';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { MonthCalendarIntensitySwatch, type MonthCalendarIntensity } from '@/shared/ui/MonthCalendarSheet';
import { duration, easing, interaction, nativeShadows, radii, semanticColors, spacing } from '@/shared/ui/theme';

export const REVENUE_HEATMAP_HINT_TITLE = 'Intensité du chiffre d’affaires';
export const REVENUE_HEATMAP_HINT_BODY =
  'Plus la teinte est soutenue, plus le chiffre d’affaires de cette journée est élevé par rapport aux autres jours du mois.';
export const REVENUE_HEATMAP_INFO_LABEL = 'À propos des couleurs du chiffre d’affaires';

const LEGEND: readonly { readonly intensity: MonthCalendarIntensity; readonly label: string }[] = [
  { intensity: 'low', label: 'Faible' },
  { intensity: 'medium', label: 'Moyen' },
  { intensity: 'high', label: 'Élevé' },
];

/** The reveal of the card, its legend and its exit. */
export const HEATMAP_HINT_MOTION = {
  /** Where the card materialises from. */
  from: { opacity: 0, scale: 0.96, translateY: 10 },
  /** ζ ≈ 0.77: settles in about 300 ms with a barely perceptible overshoot. */
  spring: { damping: 26, mass: 0.9, stiffness: 320 },
  fadeIn: duration.disclosure,
  /** Legend samples: a small fade and scale, one after the other. */
  legend: { delay: 80, stagger: 35, duration: 180, scaleFrom: 0.9 },
  /** Faster than the entrance. */
  exit: { duration: duration.state, scale: 0.98, translateY: 4 },
  /** Reduce Motion: this fade only, in and out. */
  reducedFade: duration.tap,
} as const;

const fadeEasing = Easing.bezier(...easing.out);

interface RevenueHeatmapHintProps {
  /** Shown or not; hiding plays the exit before the card unmounts. */
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly testID?: string;
}

export function RevenueHeatmapHint({ visible, onDismiss, testID = 'revenue-heatmap-hint' }: RevenueHeatmapHintProps) {
  const reducedMotion = useReducedMotion();
  const { from, exit } = HEATMAP_HINT_MOTION;
  // ONE card at a time: it stays mounted while it leaves, and a reopening
  // during the exit simply turns the same card back.
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);

  const opacity = useSharedValue<number>(from.opacity);
  const scale = useSharedValue<number>(reducedMotion ? 1 : from.scale);
  const translateY = useSharedValue<number>(reducedMotion ? 0 : from.translateY);

  useEffect(() => {
    if (!presented) return;
    if (visible) {
      if (reducedMotion) {
        scale.set(1);
        translateY.set(0);
        opacity.set(withTiming(1, { duration: HEATMAP_HINT_MOTION.reducedFade }));
        return;
      }
      opacity.set(withTiming(1, { duration: HEATMAP_HINT_MOTION.fadeIn, easing: fadeEasing }));
      scale.set(withSpring(1, HEATMAP_HINT_MOTION.spring));
      translateY.set(withSpring(0, HEATMAP_HINT_MOTION.spring));
      return;
    }
    const exitDuration = reducedMotion ? HEATMAP_HINT_MOTION.reducedFade : exit.duration;
    opacity.set(withTiming(0, { duration: exitDuration, easing: fadeEasing }));
    if (!reducedMotion) {
      scale.set(withTiming(exit.scale, { duration: exitDuration, easing: fadeEasing }));
      translateY.set(withTiming(exit.translateY, { duration: exitDuration, easing: fadeEasing }));
    }
    const unmount = setTimeout(() => {
      setPresented(false);
      // The next appearance starts again from its origin.
      opacity.set(from.opacity);
      scale.set(reducedMotion ? 1 : from.scale);
      translateY.set(reducedMotion ? 0 : from.translateY);
    }, exitDuration);
    return () => clearTimeout(unmount);
  }, [visible, presented, reducedMotion, opacity, scale, translateY, exit, from]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }, { scale: scale.get() }],
  }));

  if (!presented) return null;
  return (
    <Animated.View
      // Leaving: no second « Compris », nothing tappable under a fading card.
      pointerEvents={visible ? 'auto' : 'none'}
      style={revealStyle}
      testID={`${testID}-reveal`}
    >
      <HintCard
        onDismiss={() => {
          if (visible) onDismiss();
        }}
        reducedMotion={reducedMotion}
        testID={testID}
        visible={visible}
      />
    </Animated.View>
  );
}

function HintCard({
  visible,
  reducedMotion,
  onDismiss,
  testID,
}: {
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly onDismiss: () => void;
  readonly testID: string;
}) {
  const titleRef = useRef<View>(null);
  // VoiceOver / TalkBack land on the title each time the card appears.
  useEffect(() => {
    if (visible && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, [visible]);

  return (
    <View style={styles.card} testID={testID}>
      <View accessible accessibilityRole="header" ref={titleRef}>
        <AppText style={styles.title} testID={`${testID}-title`} variant="rowTitle">
          {REVENUE_HEATMAP_HINT_TITLE}
        </AppText>
      </View>
      <AppText style={styles.body} testID={`${testID}-body`} variant="metadata">
        {REVENUE_HEATMAP_HINT_BODY}
      </AppText>
      {/* Each level is written, never shown by its colour alone. */}
      <View
        accessibilityLabel={`Légende : ${LEGEND.map(({ label }) => label.toLowerCase()).join(', ')}`}
        accessible
        style={styles.legend}
        testID={`${testID}-legend`}
      >
        {LEGEND.map(({ intensity, label }, index) => (
          <LegendItem index={index} key={intensity} reducedMotion={reducedMotion} testID={`${testID}-legend-${intensity}`}>
            <MonthCalendarIntensitySwatch intensity={intensity} testID={`${testID}-swatch-${intensity}`} />
            <AppText style={styles.legendLabel} variant="metadata">
              {label}
            </AppText>
          </LegendItem>
        ))}
      </View>
      <AppButton onPress={onDismiss} style={styles.action} testID={`${testID}-dismiss`} title="Compris" variant="secondary" />
    </View>
  );
}

/** One legend sample, fading in after the card starts: never a jump or a slide. */
function LegendItem({
  index,
  reducedMotion,
  testID,
  children,
}: {
  readonly index: number;
  readonly reducedMotion: boolean;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const { legend } = HEATMAP_HINT_MOTION;
  // Reduce Motion: no stagger — the samples simply arrive with the card.
  const progress = useSharedValue<number>(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      progress.set(1);
      return;
    }
    progress.set(
      withDelay(
        legend.delay + index * legend.stagger,
        withTiming(1, { duration: legend.duration, easing: fadeEasing }),
      ),
    );
  }, [index, legend, progress, reducedMotion]);

  const style = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: value,
      transform: [{ scale: legend.scaleFrom + (1 - legend.scaleFrom) * value }],
    };
  });

  return (
    <Animated.View style={[styles.legendItem, style]} testID={testID}>
      {children}
    </Animated.View>
  );
}

interface RevenueHeatmapInfoButtonProps {
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A quiet plum ⓘ under the grid: secondary to the month arrows, a full touch target. */
export const RevenueHeatmapInfoButton = forwardRef<View, RevenueHeatmapInfoButtonProps>(
  function RevenueHeatmapInfoButton({ onPress, testID = 'revenue-heatmap-info' }, ref) {
    return (
      <View style={styles.infoRow}>
        <Pressable
          accessibilityLabel={REVENUE_HEATMAP_INFO_LABEL}
          accessibilityRole="button"
          onPress={onPress}
          ref={ref}
          style={({ pressed }) => [styles.info, pressed && styles.pressed]}
          testID={testID}
        >
          <SymbolView
            name={{ ios: 'info.circle', android: 'info' }}
            size={20}
            tintColor={semanticColors.brandForeground}
            weight="regular"
          />
        </Pressable>
      </View>
    );
  },
);

const INFO_TARGET = 44;

const styles = StyleSheet.create({
  // No fixed height: large text grows the card, never truncates it.
  card: {
    ...nativeShadows.raised,
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: { color: semanticColors.brandForeground },
  body: { color: semanticColors.foregroundSoft },
  legend: { columnGap: spacing.lg, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  legendLabel: { color: semanticColors.foreground },
  action: { alignSelf: 'flex-end' },
  infoRow: { alignItems: 'flex-end', marginBottom: spacing.sm, marginTop: -spacing.sm },
  info: { alignItems: 'center', height: INFO_TARGET, justifyContent: 'center', width: INFO_TARGET },
  pressed: { opacity: interaction.pressedOpacity },
});
