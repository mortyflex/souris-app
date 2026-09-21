// Souris — birthday confetti
//
// One short, tasteful burst: a restrained handful of paper pieces fan out
// from the top of the screen, flutter down and fade. THE one implementation,
// shared by the Client Profile (each entry) and the Cliente step of
// Appointment creation (each birthday selection). It plays once per mount
// (BIRTHDAY_CONFETTI_DURATION_MS), then asks to be unmounted; a caller that
// wants another burst mounts it again (a new `key`).
//
// Performance: ONE shared value (`progress`, 0 → 1, linear) drives every
// piece. Each piece derives its whole trajectory from it inside a worklet, so
// the animation lives on the UI thread and causes no React render per frame.
// The only JS work is a single timer that reports the end.
//
// Decoration only: pointer-transparent (it never blocks the profile) and
// hidden from assistive technology, particles included. Reduced motion is the
// caller's decision — this component is simply not rendered then.
//
// Palette: approved Souris violets, lilac, rose and one soft gold. No
// primary-colour rainbow, no neon, no emoji.

import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { appointmentPastels, colors, peach, rose } from '@/shared/ui/theme';

export const BIRTHDAY_CONFETTI_DURATION_MS = 2200;
export const BIRTHDAY_CONFETTI_PARTICLE_COUNT = 26;

const DURATION_SECONDS = BIRTHDAY_CONFETTI_DURATION_MS / 1000;
/** Air drag on the launch impulse (1/s) and the steady fall that takes over (dp/s²). */
const DRAG = 1.6;
const GRAVITY = 380;
/** Share of the timeline over which a piece appears, and after which it fades out. */
const FADE_IN_END = 0.06;
const FADE_OUT_START = 0.62;
/** The burst starts this far down the screen (share of its height). */
const ORIGIN_Y_RATIO = 0.22;

const palette = [
  colors.accent,
  appointmentPastels.lilac.accent,
  appointmentPastels.lavender.accent,
  appointmentPastels.softRose.accent,
  rose.rose200,
  peach.peach200,
  appointmentPastels.softYellow.accent,
] as const;

interface ConfettiPiece {
  readonly key: string;
  readonly color: string;
  readonly width: number;
  readonly height: number;
  readonly round: boolean;
  /** Launch velocity (dp/s); negative `vy` is upward. */
  readonly vx: number;
  readonly vy: number;
  /** Tumble (deg/s) and flutter (rad/s) of the paper. */
  readonly spin: number;
  readonly flutter: number;
  /** Share of the timeline the piece waits before leaving. */
  readonly delay: number;
}

/** Deterministic 0..1 noise: the burst is identical on every play and every render. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const pieces: readonly ConfettiPiece[] = Array.from(
  { length: BIRTHDAY_CONFETTI_PARTICLE_COUNT },
  (_, index) => {
    // An upward fan, 30° to 150°, evenly spread then jittered.
    const spread = (index + noise(index, 1)) / BIRTHDAY_CONFETTI_PARTICLE_COUNT;
    const angle = (Math.PI / 6) * (1 + 4 * spread);
    const speed = 280 + 260 * noise(index, 2);
    const round = index % 4 === 0;
    const size = 6 + Math.round(4 * noise(index, 3));
    return {
      key: `confetti-${index}`,
      color: palette[index % palette.length],
      width: size,
      height: round ? size : size + 5,
      round,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      spin: (noise(index, 4) - 0.5) * 720,
      flutter: 5 + 6 * noise(index, 5),
      delay: 0.12 * noise(index, 6),
    };
  },
);

interface BirthdayConfettiProps {
  /** Called once, when the burst is over: the caller unmounts the component. */
  readonly onFinished: () => void;
}

export function BirthdayConfetti({ onFinished }: BirthdayConfettiProps) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withTiming(1, { duration: BIRTHDAY_CONFETTI_DURATION_MS, easing: Easing.linear }),
    );
    const finishTimer = setTimeout(onFinished, BIRTHDAY_CONFETTI_DURATION_MS);
    return () => clearTimeout(finishTimer);
  }, [onFinished, progress]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="birthday-confetti"
    >
      <View style={[styles.origin, { left: width / 2, top: height * ORIGIN_Y_RATIO }]}>
        {pieces.map((piece) => (
          <ConfettiParticle key={piece.key} piece={piece} progress={progress} />
        ))}
      </View>
    </View>
  );
}

interface ConfettiParticleProps {
  readonly piece: ConfettiPiece;
  readonly progress: SharedValue<number>;
}

function ConfettiParticle({ piece, progress }: ConfettiParticleProps) {
  const { vx, vy, spin, flutter, delay } = piece;

  const animatedStyle = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, (progress.get() - delay) / (1 - delay)));
    const seconds = local * DURATION_SECONDS;
    // The launch impulse dies out under drag; a steady fall takes over.
    const impulse = (1 - Math.exp(-DRAG * seconds)) / DRAG;
    const opacity =
      local < FADE_IN_END
        ? local / FADE_IN_END
        : local > FADE_OUT_START
          ? 1 - (local - FADE_OUT_START) / (1 - FADE_OUT_START)
          : 1;
    return {
      opacity,
      transform: [
        { translateX: vx * impulse },
        { translateY: vy * impulse + 0.5 * GRAVITY * seconds * seconds },
        { rotate: `${spin * seconds}deg` },
        { scaleY: 0.35 + 0.65 * Math.abs(Math.cos(flutter * seconds)) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          backgroundColor: piece.color,
          borderRadius: piece.round ? piece.width / 2 : 2,
          height: piece.height,
          width: piece.width,
        },
        animatedStyle,
      ]}
      testID="birthday-confetti-particle"
    />
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute' },
  piece: { position: 'absolute' },
});
