import { fieldFalloff, parallaxOffset } from '../welcome-force-field';

describe('fieldFalloff', () => {
  it('is felt fully on the object and not at all at the radius and beyond', () => {
    expect(fieldFalloff(0, 130)).toBe(1);
    expect(fieldFalloff(130, 130)).toBe(0);
    expect(fieldFalloff(400, 130)).toBe(0);
  });

  it('grows the closer the finger is, fading out smoothly near the radius', () => {
    expect(fieldFalloff(20, 130)).toBeGreaterThan(fieldFalloff(60, 130));
    expect(fieldFalloff(60, 130)).toBeGreaterThan(fieldFalloff(110, 130));
    expect(fieldFalloff(110, 130)).toBeGreaterThan(0);
    expect(fieldFalloff(129, 130)).toBeLessThan(0.001);
  });
});

describe('parallaxOffset', () => {
  it('leans away from the finger, proportionally to its offset from the logo centre', () => {
    const lean = parallaxOffset({ x: 100, y: -50 }, 0.012, 2.5);
    expect(lean.x).toBeCloseTo(-1.2);
    expect(lean.y).toBeCloseTo(0.6);
    expect(Math.hypot(...Object.values(parallaxOffset({ x: 0, y: 0 }, 0.012, 2.5)))).toBe(0);
  });

  it('never leans more than the maximum on either axis', () => {
    expect(parallaxOffset({ x: 5000, y: -5000 }, 0.012, 2.5)).toEqual({ x: -2.5, y: 2.5 });
  });
});
