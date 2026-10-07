// BeautIzzy — Welcome motifs
//
// A small weightless scene around the brand logo: six approved beauty
// objects (assets/brand/welcome-floating) — hairdryer, scissors, mirror,
// brush, comb, nail polish. They accompany the logo and never compete with
// it: smaller, staggered around it with plenty of air, never over the word.
// The PNGs are drawn as supplied (transparent, `contain`, no plate, no shadow).
//
// Two motions add up on every object, both on the UI thread:
//
//   idle     one slow sine drift (vertical float, a hint of sway and tilt),
//            each object on its own period so the group never moves in unison;
//            it fades out while the object is in flight, so the two never fight;
//   physics  every object is a small body (welcome-physics): a finger in the
//            hero pushes it away and, when it swipes past, throws it. The body
//            coasts, bounces softly off the hero's edges and off the logo,
//            slows down, then drifts back home and settles.
//
// The simulation is one frame callback per object. It only runs between the
// first touch and the moment the object is home again: waking and sleeping are
// the only hops to the JS thread (scheduleOnRN). No React render happens while
// the finger moves — the touch lives in shared values written by the gesture
// (useWelcomeTouch) and read by the bodies.
//
// Decoration only: pointer-transparent and hidden from assistive technology.
// Reduced motion renders the scene still and switches the touch field off.

import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { isSettled, stepBody, type Bounds, type World } from './welcome-physics';

export type WelcomeMotifKind = 'hairdryer' | 'scissors' | 'mirror' | 'brush' | 'comb' | 'nailPolish';

// Mapped by what each PNG actually shows: the files numbered 04–06 do not
// carry the name of their content (04 is the comb, 05 the nail polish, 06 the
// brush).
const motifSources: Record<WelcomeMotifKind, number> = {
  hairdryer: require('../../../../assets/brand/welcome-floating/01-hairdryer.png'),
  scissors: require('../../../../assets/brand/welcome-floating/02-scissors.png'),
  mirror: require('../../../../assets/brand/welcome-floating/03-mirror.png'),
  comb: require('../../../../assets/brand/welcome-floating/04-brush.png'),
  nailPolish: require('../../../../assets/brand/welcome-floating/05-comb.png'),
  brush: require('../../../../assets/brand/welcome-floating/06-nail-polish.png'),
};

interface MotifPlacement {
  readonly kind: WelcomeMotifKind;
  /** Resting centre, offset from the logo centre, in dp on the 393 dp reference width. */
  readonly x: number;
  readonly y: number;
  /** Side of the square PNG box; the artwork fills 56–85 % of it. */
  readonly size: number;
  readonly tilt: number;
  /** Idle drift amplitudes (dp, dp, degrees) and the period of one sway (ms). */
  readonly floatY: number;
  readonly floatX: number;
  readonly sway: number;
  readonly period: number;
  /** Heavier objects answer the finger more slowly. */
  readonly mass: number;
  /** Lean in flight: degrees per dp/s of horizontal speed, and the most it may lean. */
  readonly spinGain: number;
  readonly maxSpin: number;
}

/**
 * Staggered ring around the logo (artwork ≈ ±145 × ±45 dp, a horizontal
 * band): mirror, hairdryer and scissors above it, brush, comb and nail polish
 * below. Every object rests at least 84 dp above or below the logo centre, so
 * nothing rests over the word.
 */
export const welcomeMotifs: readonly MotifPlacement[] = [
  { kind: 'mirror', x: -98, y: -168, size: 80, tilt: -8, floatY: 6, floatX: 3, sway: 2.5, period: 6200, mass: 1.1, spinGain: 0.012, maxSpin: 8 },
  { kind: 'hairdryer', x: 106, y: -152, size: 90, tilt: 6, floatY: -7, floatX: -3, sway: -2, period: 7400, mass: 1.4, spinGain: 0.02, maxSpin: 12 },
  { kind: 'scissors', x: -140, y: -84, size: 70, tilt: -12, floatY: -5, floatX: 4, sway: 3.5, period: 5600, mass: 1, spinGain: 0.05, maxSpin: 26 },
  { kind: 'brush', x: 140, y: 100, size: 76, tilt: 10, floatY: 6, floatX: -4, sway: -3, period: 6800, mass: 1, spinGain: 0.03, maxSpin: 16 },
  { kind: 'comb', x: -110, y: 146, size: 66, tilt: -6, floatY: -6, floatX: 2.5, sway: 3, period: 5200, mass: 0.9, spinGain: 0.03, maxSpin: 16 },
  { kind: 'nailPolish', x: 84, y: 172, size: 58, tilt: 8, floatY: 5, floatX: -2, sway: -2.5, period: 6000, mass: 0.8, spinGain: 0.012, maxSpin: 8 },
];

/** Half-height of the scene on the reference width (farthest object edge + breathing room). */
export const WELCOME_MOTIFS_HALF_HEIGHT = 212;

/** Collision radius of an object, as a share of its PNG box (the artwork does not fill the box). */
const COLLISION_RADIUS_RATIO = 0.36;
/** The logo as an obstacle: half-axes of its ellipse on the reference width (artwork ≈ ±145 × ±45 dp). */
const LOGO_OBSTACLE = { radiusX: 145, radiusY: 45 } as const;
/** Air kept between the logo band and the box of an object resting above or below it. */
const LOGO_REST_GAP = 4;
/** Speed (dp/s) at which the idle drift has fully faded out in favour of the physics. */
const IDLE_FADE_SPEED = 90;
/** A released object that stays this slow for this long stops simulating even if something keeps it from home. */
const CALM_SPEED = 3;
const CALM_TIMEOUT = 1.5;

const driftEasing = Easing.inOut(Easing.sin);

/** Where the finger is, relative to the logo centre. Written by the gesture, read on the UI thread. */
export interface WelcomeTouch {
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  /** Finger velocity as reported by the pan gesture (dp/s). */
  readonly vx: SharedValue<number>;
  readonly vy: SharedValue<number>;
  /** 1 while a finger is down in the hero, 0 otherwise. */
  readonly active: SharedValue<number>;
}

/**
 * Touch field of the hero: the shared finger position and the gesture to
 * attach to the hero view. `centre` is the logo centre in the hero's own
 * coordinates. Disabled under reduced motion.
 */
export function useWelcomeTouch(centre: { readonly x: number; readonly y: number }) {
  const reducedMotion = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const vx = useSharedValue(0);
  const vy = useSharedValue(0);
  const active = useSharedValue(0);
  const { x: centreX, y: centreY } = centre;

  const gesture = Gesture.Pan()
    .enabled(!reducedMotion)
    .minDistance(0)
    .onBegin((event) => {
      x.set(event.x - centreX);
      y.set(event.y - centreY);
      vx.set(0);
      vy.set(0);
      active.set(1);
    })
    .onUpdate((event) => {
      x.set(event.x - centreX);
      y.set(event.y - centreY);
      vx.set(event.velocityX);
      vy.set(event.velocityY);
    })
    .onFinalize(() => {
      active.set(0);
    });

  const touch: WelcomeTouch = { x, y, vx, vy, active };
  return { gesture, touch };
}

interface FloatingMotifProps {
  readonly placement: MotifPlacement;
  readonly scale: number;
  readonly verticalScale: number;
  readonly touch: WelcomeTouch;
  /** Null until the hero is measured: no physics without walls. */
  readonly world: World | null;
}

function FloatingMotif({ placement, scale, verticalScale, touch, world }: FloatingMotifProps) {
  const reducedMotion = useReducedMotion();
  const { floatX, floatY, period, sway, tilt } = placement;

  const size = Math.round(placement.size * verticalScale);
  const restX = placement.x * scale;
  // A short hero pulls the objects in, but never onto the logo: the logo keeps
  // its size, so an object stays clear of its band, above or below it.
  const logoClearance = LOGO_OBSTACLE.radiusY * scale + size / 2 + LOGO_REST_GAP;
  const restY = Math.sign(placement.y) * Math.max(Math.abs(placement.y * verticalScale), logoClearance);
  const traits = {
    restX,
    restY,
    radius: size * COLLISION_RADIUS_RATIO,
    mass: placement.mass,
    spinGain: placement.spinGain,
    maxSpin: placement.maxSpin,
  };

  // Idle: 0 → 1 → 0 …; 0.5 is the resting position.
  const drift = useSharedValue(0.5);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(drift);
      drift.set(0.5);
      return;
    }
    drift.set(0);
    drift.set(withRepeat(withTiming(1, { duration: period, easing: driftEasing }), -1, true));
    return () => cancelAnimation(drift);
  }, [drift, period, reducedMotion]);

  // Physics: the body, relative to its resting place (welcome-physics).
  const bodyX = useSharedValue(0);
  const bodyY = useSharedValue(0);
  const bodyVx = useSharedValue(0);
  const bodyVy = useSharedValue(0);
  const bodyAngle = useSharedValue(0);
  // Where the finger was on the previous frame: the gesture only reports a
  // velocity while the finger moves, so a finger that stopped must read as still.
  const lastFingerX = useSharedValue(0);
  const lastFingerY = useSharedValue(0);
  const calmFor = useSharedValue(0);
  const asleep = useSharedValue(1);

  const frame = useFrameCallback((info) => {
    if (world === null) return;
    const fingerDown = touch.active.get() === 1;
    if (asleep.get() === 1 && !fingerDown) return;

    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    const fingerX = touch.x.get();
    const fingerY = touch.y.get();
    const fingerMoved = fingerX !== lastFingerX.get() || fingerY !== lastFingerY.get();
    lastFingerX.set(fingerX);
    lastFingerY.set(fingerY);

    const next = stepBody(
      { x: bodyX.get(), y: bodyY.get(), vx: bodyVx.get(), vy: bodyVy.get(), angle: bodyAngle.get() },
      traits,
      fingerDown
        ? { x: fingerX, y: fingerY, vx: fingerMoved ? touch.vx.get() : 0, vy: fingerMoved ? touch.vy.get() : 0 }
        : null,
      world,
      dt,
    );

    if (fingerDown) {
      calmFor.set(0);
    } else if (isSettled(next)) {
      // Home and still: snap the last fraction of a dp and stop simulating.
      bodyX.set(0);
      bodyY.set(0);
      bodyVx.set(0);
      bodyVy.set(0);
      bodyAngle.set(0);
      asleep.set(1);
      return;
    } else if (Math.abs(next.vx) < CALM_SPEED && Math.abs(next.vy) < CALM_SPEED) {
      // Still, but held away from home (a wall or the logo is in the way): stop there.
      calmFor.set(calmFor.get() + dt);
      if (calmFor.get() > CALM_TIMEOUT) asleep.set(1);
    } else {
      calmFor.set(0);
    }

    bodyX.set(next.x);
    bodyY.set(next.y);
    bodyVx.set(next.vx);
    bodyVy.set(next.vy);
    bodyAngle.set(next.angle);
  }, false);

  // A finger coming down wakes the body…
  useAnimatedReaction(
    () => touch.active.get(),
    (active, previous) => {
      if (active !== 1 || previous === 1) return;
      calmFor.set(0);
      asleep.set(0);
    },
  );
  // …and `asleep` drives the frame callback. Starting and stopping it are the
  // only hops to the JS thread (setActive is a JS-thread API), once per flight.
  const setSimulating = (simulating: boolean) => frame.setActive(simulating);
  useAnimatedReaction(
    () => asleep.get(),
    (value, previous) => {
      if (previous === null || value === previous) return;
      scheduleOnRN(setSimulating, value === 0);
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    // The idle drift fades out as the body picks up speed, and back in as it settles.
    const speed = Math.sqrt(bodyVx.get() * bodyVx.get() + bodyVy.get() * bodyVy.get());
    const idle = (drift.get() - 0.5) * 2 * (1 - Math.min(1, speed / IDLE_FADE_SPEED));
    return {
      transform: [
        { translateX: idle * floatX + bodyX.get() },
        { translateY: idle * floatY + bodyY.get() },
        { rotate: `${tilt + idle * sway + bodyAngle.get()}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.motif, { left: restX - size / 2, top: restY - size / 2 }, animatedStyle]}
      testID={`welcome-motif-${placement.kind}`}
    >
      <Image
        accessible={false}
        resizeMode="contain"
        source={motifSources[placement.kind]}
        style={{ width: size, height: size }}
      />
    </Animated.View>
  );
}

interface WelcomeMotifsProps {
  /** Horizontal scale of the scene (1 on the 393 dp reference width), shared with the logo. */
  readonly scale: number;
  /** Vertical scale, at most `scale`: short heroes pull the objects in (and shrink them) rather than the logo. */
  readonly verticalScale: number;
  readonly touch: WelcomeTouch;
  /** Physical area of the hero, relative to the logo centre; null until it is measured. */
  readonly bounds: Bounds | null;
}

/** Rendered inside a zero-size anchor placed at the logo centre. */
export function WelcomeMotifs({ scale, verticalScale, touch, bounds }: WelcomeMotifsProps) {
  const world: World | null =
    bounds === null
      ? null
      : {
          bounds,
          obstacle: { radiusX: LOGO_OBSTACLE.radiusX * scale, radiusY: LOGO_OBSTACLE.radiusY * scale },
          scale,
        };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="welcome-motifs"
    >
      {welcomeMotifs.map((placement) => (
        <FloatingMotif
          key={placement.kind}
          placement={placement}
          scale={scale}
          touch={touch}
          verticalScale={verticalScale}
          world={world}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  motif: { position: 'absolute' },
});
