// Rules of the Welcome physics, tested as plain functions. This says nothing
// about how the throw FEELS or renders: that is judged by hand on a simulator
// or a device (see worklet-closures.test.ts for the runtime boundary).

import {
  BODY_AT_REST,
  collideBounds,
  collideObstacle,
  dragAt,
  fingerEffect,
  homePull,
  isSettled,
  physics,
  stepBody,
  type Body,
  type BodyTraits,
  type Finger,
  type World,
} from '../welcome-physics';

const FRAME = 1 / 60;
const world: World = {
  bounds: { left: -190, right: 190, top: -230, bottom: 230 },
  obstacle: { radiusX: 132, radiusY: 66 },
  scale: 1,
};
// Rests up and to the right of the logo, like the hairdryer.
const traits: BodyTraits = { restX: 100, restY: -150, radius: 30, mass: 1, spinGain: 0.03, maxSpin: 16 };
const speedOf = (body: { vx: number; vy: number }) => Math.hypot(body.vx, body.vy);
const still = { vx: 0, vy: 0 };

/** Runs the simulation for `seconds` with no finger, returning every frame. */
function coast(start: Body, seconds: number, bodyTraits: BodyTraits = traits): Body[] {
  const frames: Body[] = [start];
  for (let time = 0; time < seconds; time += FRAME) {
    frames.push(stepBody(frames[frames.length - 1], bodyTraits, null, world, FRAME));
  }
  return frames;
}

describe('fingerEffect — impulse from the finger', () => {
  const swipeLeft = (distance: number, speed: number): Finger => ({ x: 100 + distance, y: -150, vx: -speed, vy: 0 });

  it('ignores a finger beyond the field radius', () => {
    expect(fingerEffect(100, -150, still, swipeLeft(physics.fieldRadius + 1, 1500), 1, 1, FRAME)).toEqual(still);
  });

  it('throws the body in the direction of a fast swipe, harder the closer the finger passes', () => {
    const near = fingerEffect(100, -150, still, swipeLeft(15, 1500), 1, 1, FRAME);
    const far = fingerEffect(100, -150, still, swipeLeft(90, 1500), 1, 1, FRAME);
    expect(near.vx).toBeLessThan(0);
    expect(far.vx).toBeLessThan(0);
    expect(speedOf(near)).toBeGreaterThan(speedOf(far));
  });

  it('gives a clearly larger impulse to a fast swipe than to a slow pass', () => {
    const fast = fingerEffect(100, -150, still, swipeLeft(15, 1500), 1, 1, FRAME);
    const slow = fingerEffect(100, -150, still, swipeLeft(15, 60), 1, 1, FRAME);
    expect(speedOf(fast)).toBeGreaterThan(speedOf(slow) * 3);
  });

  it('only repels, straight away from the finger, when the finger is still', () => {
    const pushed = fingerEffect(100, -150, still, { x: 60, y: -150, vx: 0, vy: 0 }, 1, 1, FRAME);
    expect(pushed.vx).toBeGreaterThan(0);
    expect(pushed.vy).toBeCloseTo(0);
  });

  it('never hands over more than its share of the finger velocity, however long the contact', () => {
    let velocity = still;
    for (let frame = 0; frame < 600; frame++) {
      // The finger rides along right behind the body.
      velocity = fingerEffect(100, -150, velocity, { x: 101, y: -150, vx: -1500, vy: 0 }, 1, 1, FRAME);
    }
    expect(Math.abs(velocity.vx)).toBeLessThanOrEqual(1500 * physics.velocityTransfer + physics.repulsion);
  });

  it('moves a heavy body less than a light one', () => {
    const light = fingerEffect(100, -150, still, swipeLeft(15, 1500), 0.8, 1, FRAME);
    const heavy = fingerEffect(100, -150, still, swipeLeft(15, 1500), 1.4, 1, FRAME);
    expect(speedOf(heavy)).toBeLessThan(speedOf(light));
  });
});

describe('inertia, drag and the way home', () => {
  it('keeps a thrown body travelling after the finger is gone, slowing down progressively', () => {
    const frames = coast({ ...BODY_AT_REST, vx: -500 }, 0.5);
    const travelled = frames.map((body) => body.x);
    expect(travelled[travelled.length - 1]).toBeLessThan(-80);
    expect(speedOf(frames[10])).toBeLessThan(speedOf(frames[1]));
    expect(speedOf(frames[30])).toBeLessThan(speedOf(frames[10]));
  });

  it('lets an energetic throw travel far, but reins it in past the leash', () => {
    // Thrown to the left, where nothing is in the way.
    const farthest = Math.max(...coast({ ...BODY_AT_REST, vx: -700 }, 3).map((body) => Math.hypot(body.x, body.y)));
    expect(farthest).toBeGreaterThan(80);
    expect(farthest).toBeLessThan(physics.leash + 90);
  });

  it('pulls weakly on a fast body and firmly on a slow one, with more drag when settling', () => {
    expect(homePull(physics.cruiseSpeed * 2, physics.cruiseSpeed)).toBeCloseTo(physics.homePullFast);
    expect(homePull(0, physics.cruiseSpeed)).toBeCloseTo(physics.homePullSlow);
    expect(dragAt(0, physics.cruiseSpeed)).toBeGreaterThan(dragAt(physics.cruiseSpeed, physics.cruiseSpeed));
  });

  it('brings a displaced body back to rest, takes its time, and settles without wobbling', () => {
    const frames = coast({ ...BODY_AT_REST, x: -90, y: 40 }, 8);
    expect(isSettled(frames[frames.length - 1])).toBe(true);
    // Not an instant snap back: still clearly away from home after half a second.
    expect(Math.hypot(frames[30].x, frames[30].y)).toBeGreaterThan(30);
    // Well damped: it never swings past home by more than a few dp.
    expect(Math.max(...frames.map((body) => body.x))).toBeLessThan(6);
  });

  it('is not settled while it still moves, leans, or sits away from home', () => {
    expect(isSettled(BODY_AT_REST)).toBe(true);
    expect(isSettled({ ...BODY_AT_REST, vx: 20 })).toBe(false);
    expect(isSettled({ ...BODY_AT_REST, y: 5 })).toBe(false);
    expect(isSettled({ ...BODY_AT_REST, angle: 3 })).toBe(false);
  });
});

describe('collideBounds — edges of the hero', () => {
  it('leaves a body inside the hero alone', () => {
    expect(collideBounds(0, 100, 50, -20, 30, world.bounds)).toEqual({ x: 0, y: 100, vx: 50, vy: -20 });
  });

  it('keeps the whole artwork inside, not just its centre, and bounces with a loss', () => {
    const hit = collideBounds(-175, 0, -400, 30, 30, world.bounds);
    expect(hit.x).toBe(world.bounds.left + 30);
    expect(hit.vx).toBeCloseTo(400 * physics.wallRestitution);
    expect(hit.vy).toBe(30);
  });

  it('bounces off every edge', () => {
    expect(collideBounds(500, 0, 300, 0, 30, world.bounds).vx).toBeLessThan(0);
    expect(collideBounds(0, -500, 0, -300, 30, world.bounds).vy).toBeGreaterThan(0);
    expect(collideBounds(0, 500, 0, 300, 30, world.bounds).vy).toBeLessThan(0);
  });

  it('does not chatter: a body merely resting against an edge stops instead of bouncing', () => {
    expect(collideBounds(-175, 0, -5, 0, 30, world.bounds).vx).toBe(0);
  });
});

describe('collideObstacle — the logo', () => {
  it('leaves a body outside the logo alone', () => {
    expect(collideObstacle(100, -150, -200, 100, 30, world.obstacle)).toEqual({ x: 100, y: -150, vx: -200, vy: 100 });
  });

  it('pushes a penetrating body back out to the surface and bounces it outward with a loss', () => {
    const hit = collideObstacle(0, -80, 0, 300, 30, world.obstacle);
    expect(hit.y).toBeCloseTo(-(world.obstacle.radiusY + 30));
    expect(hit.vy).toBeLessThan(0);
    expect(Math.abs(hit.vy)).toBeCloseTo(300 * physics.logoRestitution);
  });

  it('deflects a glancing body instead of stopping it', () => {
    const hit = collideObstacle(60, -85, -300, 120, 30, world.obstacle);
    expect(hit.vx).toBeLessThan(0);
    expect(hit.vy).toBeLessThan(120);
  });

  it('never lets a body thrown at the logo end up inside it', () => {
    const frames = coast({ ...BODY_AT_REST, vx: -250, vy: 900 }, 3);
    for (const body of frames) {
      const x = traits.restX + body.x;
      const y = traits.restY + body.y;
      const a = world.obstacle.radiusX + traits.radius;
      const b = world.obstacle.radiusY + traits.radius;
      expect((x * x) / (a * a) + (y * y) / (b * b)).toBeGreaterThanOrEqual(0.999);
    }
  });
});

describe('stepBody — a whole flight', () => {
  it('stays inside the hero whatever the throw', () => {
    for (const [vx, vy] of [[1200, 0], [-1200, 0], [0, -1200], [900, 900], [-900, -900]]) {
      for (const body of coast({ ...BODY_AT_REST, vx, vy }, 4)) {
        const x = traits.restX + body.x;
        const y = traits.restY + body.y;
        expect(x).toBeGreaterThanOrEqual(world.bounds.left + traits.radius - 0.001);
        expect(x).toBeLessThanOrEqual(world.bounds.right - traits.radius + 0.001);
        expect(y).toBeGreaterThanOrEqual(world.bounds.top + traits.radius - 0.001);
        expect(y).toBeLessThanOrEqual(world.bounds.bottom - traits.radius + 0.001);
      }
    }
  });

  it('always comes home in the end', () => {
    const frames = coast({ ...BODY_AT_REST, vx: -1000, vy: 600 }, 12);
    expect(isSettled(frames[frames.length - 1])).toBe(true);
  });

  it('leans with its horizontal speed, within its own limit, and straightens up at rest', () => {
    const frames = coast({ ...BODY_AT_REST, vx: -1000 }, 12);
    const leans = frames.map((body) => body.angle);
    expect(Math.min(...leans)).toBeLessThan(-2);
    expect(Math.min(...leans)).toBeGreaterThanOrEqual(-traits.maxSpin);
    expect(Math.abs(leans[leans.length - 1])).toBeLessThan(0.2);
  });

  it('survives a dropped frame without tunnelling through a wall', () => {
    const body = stepBody({ ...BODY_AT_REST, vx: 1200 }, traits, null, world, 2);
    expect(traits.restX + body.x).toBeLessThanOrEqual(world.bounds.right - traits.radius);
  });

  it('is pushed away by a still finger and held at a moderate distance', () => {
    let body: Body = BODY_AT_REST;
    const finger: Finger = { x: 70, y: -150, vx: 0, vy: 0 };
    for (let frame = 0; frame < 300; frame++) body = stepBody(body, traits, finger, world, FRAME);
    expect(body.x).toBeGreaterThan(10);
    expect(body.x).toBeLessThan(80);
  });
});
