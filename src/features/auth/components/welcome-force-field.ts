// BeautIzzy — Welcome force field
//
// The finger's field in the Welcome hero: how strongly a finger is felt at a
// distance (used by welcome-physics to push and throw the floating objects),
// and the tiny lean the logo answers with.
//
// Runs on the UI thread (worklets) and stays plain TypeScript so the rules are
// tested directly.
//
// WORKLET BOUNDARY — every function a worklet calls must itself be a worklet.
// Helpers therefore live HERE, as module-level functions carrying the
// 'worklet' directive, and never as functions declared inside a component's
// worklet: the React Compiler hoists such an inner function out to a plain
// module-level `_temp` function BEFORE the worklets plugin runs, so the
// worklet ends up capturing a non-worklet (a "Remote Function") and throws on
// the UI runtime the first time it runs. Jest cannot see this (no UI runtime):
// worklet-closures.test.ts checks the real Babel output instead, and the
// interaction itself must be validated on a simulator or a device.

export interface FieldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How strongly a finger `distance` dp away is felt, from 1 (on the object) to
 * 0 (at `radius` and beyond). Quadratic — `(1 − d / radius)²` — so the effect
 * rises sharply at close range and fades out smoothly, with no edge to feel.
 */
export function fieldFalloff(distance: number, radius: number): number {
  'worklet';
  if (distance >= radius) return 0;
  const closeness = 1 - distance / radius;
  return closeness * closeness;
}

/**
 * The logo's answer to the finger: it leans away by `ratio` of the finger's
 * offset from the logo centre, never more than `maxOffset` dp on either axis.
 */
export function parallaxOffset(finger: FieldPoint, ratio: number, maxOffset: number): FieldPoint {
  'worklet';
  return {
    x: Math.max(-maxOffset, Math.min(maxOffset, -finger.x * ratio)),
    y: Math.max(-maxOffset, Math.min(maxOffset, -finger.y * ratio)),
  };
}
