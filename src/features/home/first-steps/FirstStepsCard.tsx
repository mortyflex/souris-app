// BeautIzzy — Accueil « Premiers pas avec BeautIzzy »
//
// A contextual, dismissible guide for a Business that just finished its
// onboarding on this device (the `active` flag of first-steps-store.ts). An
// established Business never has that flag: for it this component renders
// nothing and reads nothing else.
//
//   Premiers pas avec BeautIzzy                            ✕
//   1 sur 3 · à votre rythme
//   ━━━━━━━━──────────────────                              the progress line
//   ( ) Compléter vos prestations et tarifs      ›    → Prestations & tarifs
//   (✓) Importer votre clientèle                       done: no chevron
//   ( ) Créer votre premier rendez-vous          ›    → new appointment
//   ( ) Ajouter vos produits  Facultatif         ›    → new product
//
// Each state is derived from the professional's own data (first-steps.ts);
// nothing is ticked without evidence. « ✕ » closes it for good. Online
// booking is never mentioned: it is not available.
//
// Motion (`firstSteps` tokens, DESIGN_OVERRIDES §46.1):
//
//   entrance     the card fades in and rises 14 pt (450 ms), its rows follow
//                60 ms apart;
//   completion   ONLY a step that turns done while the card is mounted —
//                never the data it mounted with, never a remount (a new
//                Playground scenario is one), never the same state twice: the
//                check pops on a soft spring over a short lavender highlight,
//                the line reaches its new value, one light haptic for a
//                counted step (none for the optional products), one spoken
//                sentence. A change made while Accueil is covered (a pushed
//                screen, a sheet) waits until Accueil is in front again;
//   3 sur 3      the card stays: last check, full line, « Votre espace est
//                prêt à vous accompagner ! » over a lavender wash, one success
//                haptic. Once those visuals have settled (0.6 s), the card
//                stays still for a 3 s reading period, then fades and folds
//                its height away (480 ms). The `completed` flag is written at
//                once. With VoiceOver on, nothing is removed by a clock: the
//                card waits for its « Fermer » button, so the announcement and
//                the message are never cut short.
//
// Reduce Motion keeps every state change and the « ready » message for the
// whole reading period, without a single movement. Every timer is cleared on
// unmount.

import { useIsFocused, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import {
  easing,
  firstSteps as motion,
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  areFirstStepsComplete,
  FIRST_STEPS_READY_MESSAGE,
  formatFirstStepsAnnouncement,
  formatFirstStepsProgress,
  getDoneStepKeys,
  getFirstSteps,
  getNewlyCompletedSteps,
  type FirstStep,
  type FirstStepKey,
} from './first-steps';
import { closeFirstSteps, readFirstStepsStatus } from './first-steps-store';

export const FIRST_STEPS_TITLE = 'Premiers pas avec BeautIzzy';

const MARK_SIZE = 24;
const ROW_SEPARATOR_INSET = spacing.base + MARK_SIZE + spacing.md;
const settle = Easing.bezier(...easing.out);

const destinations = {
  services: '/services',
  clients: '/clients/import',
  appointment: '/appointments/new',
  products: '/products/new',
} as const satisfies Record<FirstStepKey, string>;

interface FirstStepsCardProps {
  /**
   * The gap the parent stack puts before the card: the fold-away takes it
   * back too, so nothing below jumps when the card unmounts.
   */
  readonly stackGap?: number;
}

/** Renders the guide only while it is `active` for the current Business. */
export function FirstStepsCard({ stackGap = 0 }: FirstStepsCardProps) {
  const { database } = usePersistence();
  const business = useCurrentBusiness();
  const [active, setActive] = useState(() => readFirstStepsStatus(database, business.id) === 'active');
  if (!active) return null;
  return (
    <FirstStepsGuide
      onClose={(status) => closeFirstSteps(database, business.id, status)}
      onHidden={() => setActive(false)}
      stackGap={stackGap}
    />
  );
}

interface FirstStepsGuideProps {
  /** Writes the permanent outcome. */
  readonly onClose: (status: 'dismissed' | 'completed') => void;
  /** Removes the card from Accueil. */
  readonly onHidden: () => void;
  readonly stackGap: number;
}

function FirstStepsGuide({ onClose, onHidden, stackGap }: FirstStepsGuideProps) {
  const router = useRouter();
  const focused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const { activeServices } = useServiceCatalog();
  const { activeClients } = useClientSession();
  const { appointments } = useAppointmentSession();
  const { products } = useProductCatalog();

  const steps = getFirstSteps({
    activeServices,
    clientCount: activeClients.length,
    appointmentCount: appointments.length,
    productCount: products.length,
  });
  const complete = areFirstStepsComplete(steps);
  const doneKeys = getDoneStepKeys(steps);
  const doneSignature = [...doneKeys].join(',');

  // Mounted already complete (data that came in while Accueil was elsewhere
  // on another launch, a Playground stage): closed silently, never celebrated.
  const [mountedComplete] = useState(complete);
  // What the card has shown so far: hydration is the baseline, never a completion.
  const acknowledged = useRef(doneKeys);
  // A counter per step: each genuine completion replays that row's check once.
  const [celebrations, setCelebrations] = useState<Partial<Record<FirstStepKey, number>>>({});
  const [finale, setFinale] = useState(false);
  // 3 sur 3 under VoiceOver: the card waits for « Fermer » instead of a clock.
  const [closeByHand, setCloseByHand] = useState(false);

  // The latest callbacks, so the effects below never restart for a new closure.
  const callbacks = useRef({ onClose, onHidden });
  useEffect(() => {
    callbacks.current = { onClose, onHidden };
  });

  useEffect(() => {
    if (!mountedComplete) return;
    callbacks.current.onClose('completed');
    callbacks.current.onHidden();
  }, [mountedComplete]);

  // Genuine completions only — and only once Accueil is in front, so a step
  // done in a pushed screen or a sheet is celebrated when the card is seen.
  useEffect(() => {
    if (mountedComplete || finale || !focused) return;
    const fresh = getNewlyCompletedSteps(acknowledged.current, steps);
    // A step that came undone (a client deleted) may be celebrated again later.
    acknowledged.current = doneKeys;
    if (fresh.length === 0) return;

    setCelebrations((current) => {
      const next = { ...current };
      for (const step of fresh) next[step.key] = (current[step.key] ?? 0) + 1;
      return next;
    });
    AccessibilityInfo.announceForAccessibility(formatFirstStepsAnnouncement(fresh, steps));
    if (complete) {
      // Permanent at once: an app closed during the « ready » moment never shows the card again.
      callbacks.current.onClose('completed');
      haptics.success();
      setFinale(true);
    } else if (fresh.some((step) => !step.optional)) {
      haptics.selection();
    }
    // `doneSignature` stands for `steps`/`doneKeys`: a re-render with the same states does nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSignature, focused, mountedComplete, finale, complete]);

  // Entrance, then — at 3 sur 3 — the hold and the fold-away.
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const ready = useSharedValue(0);
  const exit = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    enter.set(withTiming(1, { duration: motion.enter, easing: settle }));
  }, [enter, reducedMotion]);

  useEffect(() => {
    if (!finale) return;
    ready.set(reducedMotion ? 1 : withTiming(1, { duration: motion.progress, easing: settle }));

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((screenReader) => {
        if (cancelled) return;
        if (screenReader) {
          setCloseByHand(true);
          return;
        }
        // Without motion the message is there at once: the reading period starts now.
        const readingStarts = reducedMotion ? 0 : motion.finalSettle;
        if (!reducedMotion) {
          exit.set(withDelay(readingStarts + motion.finalHold, withTiming(1, { duration: motion.exit, easing: settle })));
        }
        timer = setTimeout(
          () => callbacks.current.onHidden(),
          readingStarts + motion.finalHold + (reducedMotion ? 0 : motion.exit),
        );
      });
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [exit, finale, ready, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => {
    const folding = exit.get() > 0 && height.get() > 0;
    return {
      opacity: enter.get() * (1 - exit.get()),
      transform: [{ translateY: (1 - enter.get()) * motion.rise }],
      ...(folding && {
        height: height.get() * (1 - exit.get()),
        marginTop: -stackGap * exit.get(),
      }),
    };
  });
  const washStyle = useAnimatedStyle(() => ({ opacity: ready.get() }));
  const readyStyle = useAnimatedStyle(() => ({
    opacity: ready.get(),
    transform: [{ scale: 0.6 + ready.get() * 0.4 }],
  }));

  if (mountedComplete) return null;

  const requiredSteps = steps.filter((step) => !step.optional);
  const ratio = requiredSteps.filter((step) => step.done).length / requiredSteps.length;

  return (
    <Animated.View
      onLayout={(event) => {
        // Measured until the fold starts; the fold then shrinks from it.
        if (!finale) height.set(event.nativeEvent.layout.height);
      }}
      style={[styles.card, cardStyle]}
      testID="home-first-steps"
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wash, washStyle]} />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <AppText accessibilityRole="header" style={styles.title} variant="rowTitle">
              {FIRST_STEPS_TITLE}
            </AppText>
            {finale && (
              <Animated.View style={readyStyle} testID="home-first-steps-flourish">
                <SymbolView
                  name={{ ios: 'sparkles', android: 'auto_awesome' }}
                  size={15}
                  tintColor={semanticColors.accent}
                />
              </Animated.View>
            )}
          </View>
          {finale ? (
            <AppText style={styles.readyText} testID="home-first-steps-ready" variant="metadata">
              {FIRST_STEPS_READY_MESSAGE}
            </AppText>
          ) : (
            <AppText style={styles.progress} testID="home-first-steps-progress" variant="metadata">
              {`${formatFirstStepsProgress(steps)} · à votre rythme`}
            </AppText>
          )}
        </View>
        {!finale && (
          <Pressable
            accessibilityLabel="Masquer les premiers pas"
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={() => {
              haptics.selection();
              onClose('dismissed');
              onHidden();
            }}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            testID="home-first-steps-dismiss"
          >
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={12} tintColor={foregroundSoft} weight="semibold" />
          </Pressable>
        )}
        {closeByHand && (
          <Pressable
            accessibilityLabel="Fermer les premiers pas"
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={onHidden}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            testID="home-first-steps-close"
          >
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={12} tintColor={foregroundSoft} weight="semibold" />
          </Pressable>
        )}
      </View>
      <ProgressLine ratio={ratio} reducedMotion={reducedMotion} />
      {steps.map((step, index) => (
        <View key={step.key}>
          <GroupedSeparator inset={ROW_SEPARATOR_INSET} />
          <FirstStepRow
            celebration={celebrations[step.key] ?? 0}
            index={index}
            interactive={!finale}
            onPress={() => router.push(destinations[step.key])}
            reducedMotion={reducedMotion}
            step={step}
          />
        </View>
      ))}
    </Animated.View>
  );
}

/** The required steps done, as a thin accent line; it glides to each new value. */
function ProgressLine({ ratio, reducedMotion }: { readonly ratio: number; readonly reducedMotion: boolean }) {
  const value = useSharedValue(ratio);
  useEffect(() => {
    value.set(reducedMotion ? ratio : withTiming(ratio, { duration: motion.progress, easing: settle }));
  }, [ratio, reducedMotion, value]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${value.get() * 100}%` }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.track}
      testID="home-first-steps-line"
    >
      <Animated.View style={[styles.fill, fillStyle]} testID="home-first-steps-line-fill" />
    </View>
  );
}

interface FirstStepRowProps {
  readonly step: FirstStep;
  readonly index: number;
  /** Increments on each genuine completion of this step: replays the check once. */
  readonly celebration: number;
  readonly interactive: boolean;
  readonly reducedMotion: boolean;
  readonly onPress: () => void;
}

function FirstStepRow({ step, index, celebration, interactive, reducedMotion, onPress }: FirstStepRowProps) {
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const check = useSharedValue(1);
  const highlight = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    // Rows follow the card a breath later, one after the other.
    enter.set(
      withDelay(
        motion.rowStagger * (index + 1),
        withTiming(1, { duration: motion.enter, easing: settle }),
      ),
    );
  }, [enter, index, reducedMotion]);

  useEffect(() => {
    if (celebration === 0 || reducedMotion) return;
    check.set(withSequence(withTiming(motion.checkFrom, { duration: 0 }), withSpring(1, motion.checkSpring)));
    highlight.set(
      withSequence(
        withTiming(1, { duration: motion.highlightIn }),
        withDelay(motion.highlightHold, withTiming(0, { duration: motion.highlightOut })),
      ),
    );
  }, [celebration, check, highlight, reducedMotion]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: enter.get(),
    transform: [{ translateY: (1 - enter.get()) * (motion.rise / 2) }],
  }));
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.get() }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: check.get() }] }));

  const state = step.done ? 'fait' : step.optional ? 'facultatif' : 'à faire';
  return (
    <Animated.View style={rowStyle}>
      <Pressable
        accessibilityLabel={`${step.title}, ${step.description}, ${state}`}
        accessibilityRole="button"
        accessibilityState={{ checked: step.done, disabled: step.done || !interactive }}
        disabled={step.done || !interactive}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        testID={`home-first-step-${step.key}`}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.rowHighlight, highlightStyle]}
          testID={`home-first-step-${step.key}-highlight`}
        />
        <Animated.View
          style={[styles.mark, step.done && styles.markDone, checkStyle]}
          testID={`home-first-step-${step.key}-mark`}
        >
          {step.done && (
            <SymbolView
              name={{ ios: 'checkmark', android: 'check' }}
              size={12}
              tintColor={semanticColors.onAccent}
              weight="bold"
            />
          )}
        </Animated.View>
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            <AppText numberOfLines={2} style={[styles.stepTitle, step.done && styles.stepTitleDone]} variant="control">
              {step.title}
            </AppText>
            {step.optional && !step.done && (
              <View style={styles.chip}>
                <AppText style={styles.chipText} variant="chip">
                  Facultatif
                </AppText>
              </View>
            )}
          </View>
          <AppText numberOfLines={2} style={styles.description} variant="metadata">
            {step.description}
          </AppText>
        </View>
        {!step.done && interactive && (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={13}
            tintColor={semanticColors.accent}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The grouped white surface of Accueil, borderless like every card of the page.
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    overflow: 'hidden',
  },
  // The « ready » lavender wash, under everything.
  wash: { backgroundColor: semanticColors.surfaceLavender },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  headerCopy: { flex: 1, gap: 2 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs + 2 },
  title: { color: semanticColors.foreground, flexShrink: 1 },
  progress: { color: foregroundSoft },
  readyText: { color: semanticColors.accent },
  close: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  pressed: { opacity: interaction.pressedOpacity },
  track: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 3,
    marginBottom: spacing.md,
    marginHorizontal: spacing.base,
    overflow: 'hidden',
  },
  fill: { backgroundColor: semanticColors.accent, borderRadius: radii.pill, height: '100%' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  rowHighlight: { backgroundColor: semanticColors.surfaceLavender },
  mark: {
    alignItems: 'center',
    borderColor: semanticColors.borderLavender,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: MARK_SIZE,
    justifyContent: 'center',
    width: MARK_SIZE,
  },
  markDone: { backgroundColor: semanticColors.accent, borderColor: semanticColors.accent },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepTitle: { color: semanticColors.foreground, flexShrink: 1 },
  stepTitleDone: { color: foregroundSoft },
  description: { color: foregroundSoft },
  chip: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipText: { color: semanticColors.accent },
});
