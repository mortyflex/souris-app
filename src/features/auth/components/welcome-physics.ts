// BeautIzzy — Welcome physics
//
// The weightless objects of the Welcome hero can be pushed and thrown. Each
// object is a tiny body — an offset from its resting place, a velocity and a
// lean angle — advanced one frame at a time by `stepBody`:
//
//   finger   while a finger is down, nearby bodies are pushed away from it
//            (the closer, the harder) AND pick up a share of the finger's own
//            velocity: a slow finger nudges, a fast swipe throws;
//   flight   a thrown body keeps going on its inertia, slowed by a light drag;
//   walls    it bounces softly off the hero's edges and off the logo (an
//            ellipse), losing energy every time;
//   home     a pull toward the resting place that is weak while the body is
//            fast — so it can travel — and firmer, well damped, once it has
//            slowed down: it drifts back and settles without wobbling;
//   lean     it tips with its horizontal speed, per object, never spinning.
//
// No engine: plain arithmetic on plain objects, deterministic, so every rule
// is unit-tested here. Rendering it smoothly is another matter — the throw
// itself must be judged by hand on a simulator or a device.
//
// WORKLET BOUNDARY — everything below runs on the UI thread. Every helper is
// a module-level function carrying the 'worklet' directive and calls only
// such functions (see welcome-force-field for why nothing may be declared
// inside a component's worklet). worklet-closures.test.ts guards it.

import { fieldFalloff } from "./welcome-force-field";

/** A body's state, relative to its resting place. dp, dp/s, degrees. */
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

export const BODY_AT_REST: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };

/** What never changes for a body during a gesture. Positions are relative to the logo centre. */
export interface BodyTraits {
  readonly restX: number;
  readonly restY: number;
  /** Collision radius (dp): how far the artwork reaches from the body's centre. */
  readonly radius: number;
  /** Heavier bodies answer the finger more slowly. */
  readonly mass: number;
  /** Degrees of lean per dp/s of horizontal speed, and the most it may lean. */
  readonly spinGain: number;
  readonly maxSpin: number;
}

/** The finger, relative to the logo centre. dp and dp/s. */
export interface Finger {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** The physical area of the hero, relative to the logo centre. */
export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The logo as an obstacle: an ellipse centred on the logo centre. */
export interface Obstacle {
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface World {
  readonly bounds: Bounds;
  readonly obstacle: Obstacle;
  /** Scale of the scene (1 on the 393 dp reference width): distances and speeds follow it. */
  readonly scale: number;
}

/** Every number worth tuning after a try on device. Distances in dp on the reference width. */
export const physics = {
  /** Reach of the finger around a body. */
  fieldRadius: 130,
  /** Push away from a finger sitting on the body (dp/s²). A still finger holds a body ≈ 40 dp away. */
  repulsion: 620,
  /** Share of the finger's velocity a body can pick up. */
  velocityTransfer: 0.65,
  /** How fast it picks it up at point-blank range (1/s). */
  velocityCoupling: 18,
  /** Finger speed (dp/s) from which a pass counts as a full swipe rather than a nudge. */
  swipeSpeed: 320,
  /** Hard ceiling on a body's speed (dp/s). */
  maxSpeed: 1200,
  /** Drag in free flight (1/s) and the extra drag once the body has slowed down. */
  flightDrag: 1,
  settleDrag: 2.6,
  /** Pull toward rest (1/s²): weak while fast, firm once slow. */
  homePullFast: 0.8,
  homePullSlow: 7,
  /** Speed (dp/s) above which a body counts as "fast" for the two blends above. */
  cruiseSpeed: 260,
  /**
   * Beyond this distance from rest (dp) the body is reined in: a little more
   * pull (1/s²) and, above all, more drag (1/s, fully reached `leashSoftness`
   * dp further) — it runs out of breath rather than being slung back.
   */
  leash: 110,
  leashPull: 4,
  leashDrag: 7,
  leashSoftness: 40,
  /** Share of the speed kept after bouncing off a hero edge / off the logo. */
  wallRestitution: 0.55,
  logoRestitution: 0.5,
  /** Below this speed (dp/s) a contact kills the bounce instead of chattering. */
  restingContactSpeed: 12,
  /** How quickly the lean follows the speed (1/s). */
  spinResponse: 7,
  /** Longest step integrated at once (s): a dropped frame never tunnels a body through a wall. */
  maxStep: 1 / 30,
} as const;

/** Speed and distance under which a released body is considered back home. */
const SETTLED_SPEED = 3;
const SETTLED_DISTANCE = 0.4;
const SETTLED_ANGLE = 0.2;

/** 0 when the body is slow, 1 at cruise speed and beyond. */
export function speedBlend(speed: number, cruiseSpeed: number): number {
  "worklet";
  return Math.max(0, Math.min(1, speed / cruiseSpeed));
}

/** Pull toward rest (1/s²) for a body moving at `speed`: weak when fast, firm when slow. */
export function homePull(speed: number, cruiseSpeed: number): number {
  "worklet";
  const fast = speedBlend(speed, cruiseSpeed);
  return (
    physics.homePullSlow + (physics.homePullFast - physics.homePullSlow) * fast
  );
}

/** Drag (1/s) for a body moving at `speed`: light in flight, heavier when settling. */
export function dragAt(speed: number, cruiseSpeed: number): number {
  "worklet";
  return (
    physics.flightDrag +
    physics.settleDrag * (1 - speedBlend(speed, cruiseSpeed))
  );
}

interface Velocity {
  readonly vx: number;
  readonly vy: number;
}

/**
 * What a finger does to a body at (`px`, `py`) during `dt`: a push straight
 * away from it, plus a share of its own velocity — both fading with distance,
 * the second one also with how slowly the finger moves.
 */
export function fingerEffect(
  px: number,
  py: number,
  velocity: Velocity,
  finger: Finger,
  mass: number,
  scale: number,
  dt: number,
): Velocity {
  "worklet";
  const dx = px - finger.x;
  const dy = py - finger.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const falloff = fieldFalloff(distance, physics.fieldRadius * scale);
  if (falloff === 0) return velocity;

  // Push away (a finger exactly on the body pushes it upward).
  const push = (physics.repulsion * scale * falloff * dt) / mass;
  let vx = velocity.vx + (distance < 0.001 ? 0 : (dx / distance) * push);
  let vy = velocity.vy + (distance < 0.001 ? -push : (dy / distance) * push);

  // Throw: move toward a share of the finger's velocity, faster when close and when swiping.
  const fingerSpeed = Math.sqrt(finger.vx * finger.vx + finger.vy * finger.vy);
  const swipe = Math.min(1, fingerSpeed / (physics.swipeSpeed * scale));
  const grip =
    1 - Math.exp((-physics.velocityCoupling * falloff * swipe * dt) / mass);
  vx += (finger.vx * physics.velocityTransfer - vx) * grip;
  vy += (finger.vy * physics.velocityTransfer - vy) * grip;
  return { vx, vy };
}

interface Contact {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** Bounced component of a velocity hitting a surface at `speedIntoSurface` (> 0). */
export function bounce(speedIntoSurface: number, restitution: number): number {
  "worklet";
  return speedIntoSurface < physics.restingContactSpeed
    ? 0
    : speedIntoSurface * restitution;
}

/** Keeps a body of `radius` inside the hero: clamps it and reflects the velocity, with a loss. */
export function collideBounds(
  px: number,
  py: number,
  vx: number,
  vy: number,
  radius: number,
  bounds: Bounds,
): Contact {
  "worklet";
  let x = px;
  let y = py;
  let nextVx = vx;
  let nextVy = vy;
  if (x - radius < bounds.left) {
    x = bounds.left + radius;
    if (nextVx < 0) nextVx = bounce(-nextVx, physics.wallRestitution);
  } else if (x + radius > bounds.right) {
    x = bounds.right - radius;
    if (nextVx > 0) nextVx = -bounce(nextVx, physics.wallRestitution);
  }
  if (y - radius < bounds.top) {
    y = bounds.top + radius;
    if (nextVy < 0) nextVy = bounce(-nextVy, physics.wallRestitution);
  } else if (y + radius > bounds.bottom) {
    y = bounds.bottom - radius;
    if (nextVy > 0) nextVy = -bounce(nextVy, physics.wallRestitution);
  }
  return { x, y, vx: nextVx, vy: nextVy };
}

/**
 * Keeps a body of `radius` out of the logo ellipse: moves it back to the
 * surface and reflects the part of its velocity heading inward, with a loss.
 */
export function collideObstacle(
  px: number,
  py: number,
  vx: number,
  vy: number,
  radius: number,
  obstacle: Obstacle,
): Contact {
  "worklet";
  const a = obstacle.radiusX + radius;
  const b = obstacle.radiusY + radius;
  const inside = (px * px) / (a * a) + (py * py) / (b * b);
  if (inside >= 1) return { x: px, y: py, vx, vy };

  // Dead centre has no way out: leave upward.
  const fromX = inside < 0.000001 ? 0 : px;
  const fromY = inside < 0.000001 ? -1 : py;
  const level = (fromX * fromX) / (a * a) + (fromY * fromY) / (b * b);
  const x = fromX / Math.sqrt(level);
  const y = fromY / Math.sqrt(level);

  // Outward normal of the ellipse at the contact point.
  const nx = x / (a * a);
  const ny = y / (b * b);
  const length = Math.sqrt(nx * nx + ny * ny);
  const normalX = nx / length;
  const normalY = ny / length;
  const inward = -(vx * normalX + vy * normalY);
  if (inward <= 0) return { x, y, vx, vy };

  const kick = inward + bounce(inward, physics.logoRestitution);
  return { x, y, vx: vx + normalX * kick, vy: vy + normalY * kick };
}

/** One frame of a body's life. `finger` is null when no finger is down. */
export function stepBody(
  body: Body,
  traits: BodyTraits,
  finger: Finger | null,
  world: World,
  elapsed: number,
): Body {
  "worklet";
  const dt = Math.min(elapsed, physics.maxStep);
  const scale = world.scale;
  const cruise = physics.cruiseSpeed * scale;
  let vx = body.vx;
  let vy = body.vy;

  if (finger !== null) {
    const pushed = fingerEffect(
      traits.restX + body.x,
      traits.restY + body.y,
      { vx, vy },
      finger,
      traits.mass,
      scale,
      dt,
    );
    vx = pushed.vx;
    vy = pushed.vy;
  }

  // Home: a pull toward rest, plus the leash once the body has wandered far.
  const speed = Math.sqrt(vx * vx + vy * vy);
  const distance = Math.sqrt(body.x * body.x + body.y * body.y);
  const overLeash = Math.max(0, distance - physics.leash * scale);
  const pull =
    homePull(speed, cruise) +
    (distance < 0.001 ? 0 : (physics.leashPull * overLeash) / distance);
  const leashDrag =
    physics.leashDrag *
    Math.min(1, overLeash / (physics.leashSoftness * scale));
  vx -= pull * body.x * dt;
  vy -= pull * body.y * dt;

  // Drag, then the speed ceiling.
  const slowed = Math.exp(-(dragAt(speed, cruise) + leashDrag) * dt);
  vx *= slowed;
  vy *= slowed;
  const nextSpeed = Math.sqrt(vx * vx + vy * vy);
  const ceiling = physics.maxSpeed * scale;
  if (nextSpeed > ceiling) {
    vx *= ceiling / nextSpeed;
    vy *= ceiling / nextSpeed;
  }

  // Move, then resolve the contacts in scene coordinates.
  const walls = collideBounds(
    traits.restX + body.x + vx * dt,
    traits.restY + body.y + vy * dt,
    vx,
    vy,
    traits.radius,
    world.bounds,
  );
  const contact = collideObstacle(
    walls.x,
    walls.y,
    walls.vx,
    walls.vy,
    traits.radius,
    world.obstacle,
  );

  // Lean with the horizontal speed, smoothly, never past the object's limit.
  const leanTarget = Math.max(
    -traits.maxSpin,
    Math.min(traits.maxSpin, (contact.vx / scale) * traits.spinGain),
  );
  const angle =
    body.angle +
    (leanTarget - body.angle) * (1 - Math.exp(-physics.spinResponse * dt));

  return {
    x: contact.x - traits.restX,
    y: contact.y - traits.restY,
    vx: contact.vx,
    vy: contact.vy,
    angle,
  };
}

/** True once a released body is back home and still: the simulation may stop. */
export function isSettled(body: Body): boolean {
  "worklet";
  return (
    Math.abs(body.vx) < SETTLED_SPEED &&
    Math.abs(body.vy) < SETTLED_SPEED &&
    Math.abs(body.x) < SETTLED_DISTANCE &&
    Math.abs(body.y) < SETTLED_DISTANCE &&
    Math.abs(body.angle) < SETTLED_ANGLE
  );
}
