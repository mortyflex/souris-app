// BeautIzzy — Caisse heatmap hint: its legend IS the calendar halo, never a
// copy; it materialises and leaves through ONE animated wrapper, and Reduce
// Motion keeps a fade alone. Animations are asserted by their configuration,
// never by waiting real milliseconds.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MonthCalendarIntensitySwatch, MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';

import { HEATMAP_HINT_MOTION, RevenueHeatmapHint } from '../components/RevenueHeatmapHint';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

let mockReducedMotion = false;
const mockWithSpring = jest.fn((value: unknown, _config?: unknown) => value);
const mockWithTiming = jest.fn((value: unknown, _config?: unknown) => value);
const mockWithDelay = jest.fn((_delay: number, value: unknown) => value);

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) => React.createElement(View, props);
  return {
    __esModule: true,
    default: Object.assign(AnimatedView, { View: AnimatedView }),
    Easing: { bezier: () => (value: number) => value },
    // Stable across renders, like the real hook.
    useSharedValue: (initial: unknown) => {
      const [shared] = React.useState(() => {
        const holder = {
          value: initial,
          get: () => holder.value,
          set: (next: unknown) => {
            holder.value = next;
          },
        };
        return holder;
      });
      return shared;
    },
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => mockReducedMotion,
    withSpring: (value: unknown, config?: unknown) => mockWithSpring(value, config),
    withTiming: (value: unknown, config?: unknown) => mockWithTiming(value, config),
    withDelay: (delay: number, value: unknown) => mockWithDelay(delay, value),
  };
});

const LEVELS = ['low', 'medium', 'high'] as const;
const { from, spring, exit } = HEATMAP_HINT_MOTION;

async function renderHint(visible = true, onDismiss = jest.fn()) {
  const view = await render(<RevenueHeatmapHint onDismiss={onDismiss} testID="hint" visible={visible} />);
  return { view, onDismiss };
}
const revealStyle = (view: Awaited<ReturnType<typeof renderHint>>['view']) =>
  StyleSheet.flatten(view.getByTestId('hint-reveal').props.style);
const timingTargets = () => mockWithTiming.mock.calls.map(([value]) => value);

describe('RevenueHeatmapHint', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  beforeEach(() => {
    mockReducedMotion = false;
    mockWithSpring.mockClear();
    mockWithTiming.mockClear();
    mockWithDelay.mockClear();
  });

  it('draws each legend level with the very halo style of the calendar', async () => {
    const view = await render(
      <>
        <RevenueHeatmapHint onDismiss={jest.fn()} testID="hint" visible />
        <MonthCalendarSheet
          day={new Date(2026, 8, 10)}
          decorateMonth={() => (day) => {
            const level = LEVELS[day.getDate() - 1];
            return day.getMonth() === 8 && level ? { intensity: level } : undefined;
          }}
          onClose={jest.fn()}
          onSelect={jest.fn()}
          testID="calendar"
          today={new Date(2026, 8, 16)}
          visible
        />
      </>,
    );

    LEVELS.forEach((level, index) => {
      const swatch = StyleSheet.flatten(view.getByTestId(`hint-swatch-${level}`).props.style);
      const halo = StyleSheet.flatten(view.getByTestId(`calendar-day-2026-09-0${index + 1}-intensity-${level}`).props.style);
      expect(swatch.backgroundColor).toBe(halo.backgroundColor);
    });
    // Three distinct strengths.
    expect(
      new Set(LEVELS.map((level) => StyleSheet.flatten(view.getByTestId(`hint-swatch-${level}`).props.style).backgroundColor)).size,
    ).toBe(3);
  });

  it('defines no colour of its own: the swatches come from the shared calendar', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'RevenueHeatmapHint.tsx'), 'utf8');

    expect(source).toMatch(/MonthCalendarIntensitySwatch/);
    expect(source).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\bcalendarIntensity\b/);
    expect(MonthCalendarIntensitySwatch).toBeDefined();
  });

  it('is announced as a heading, a sentence, a written legend and a « Compris » button', async () => {
    const { view, onDismiss } = await renderHint();

    expect(view.getByRole('header', { name: 'Intensité du chiffre d’affaires' })).toBeTruthy();
    // Never truncated: no line cap on the sentence, no fixed card height.
    expect(view.getByTestId('hint-body').props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(view.getByTestId('hint').props.style).height).toBeUndefined();
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Compris' }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('materialises in place: from a touch smaller, lower and transparent, on a soft spring', async () => {
    const { view } = await renderHint();

    // The first frame, evaluated before the effect: the origin of the reveal.
    expect(revealStyle(view)).toMatchObject({
      opacity: from.opacity,
      transform: [{ translateY: from.translateY }, { scale: from.scale }],
    });
    expect(from).toEqual({ opacity: 0, scale: 0.96, translateY: 10 });
    // Scale and rise settle on the spring; the fade runs alongside.
    expect(mockWithSpring).toHaveBeenCalledWith(1, spring);
    expect(mockWithSpring).toHaveBeenCalledWith(0, spring);
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: HEATMAP_HINT_MOTION.fadeIn }));
    // Nearly critically damped: no visible bounce.
    const criticalDamping = 2 * Math.sqrt(spring.stiffness * spring.mass);
    expect(spring.damping / criticalDamping).toBeGreaterThan(0.7);
    expect(spring.damping / criticalDamping).toBeLessThan(1);
    // Title, sentence and « Compris » move with the card: one wrapper only.
    expect(view.getByTestId('hint-reveal').props.pointerEvents).toBe('auto');
  });

  it('staggers the three legend samples lightly after the card starts', async () => {
    const { view } = await renderHint();

    const { legend } = HEATMAP_HINT_MOTION;
    expect(mockWithDelay.mock.calls.map(([delay]) => delay)).toEqual([
      legend.delay,
      legend.delay + legend.stagger,
      legend.delay + 2 * legend.stagger,
    ]);
    // A small fade and scale only — never a slide.
    expect(StyleSheet.flatten(view.getByTestId('hint-legend-low').props.style)).toMatchObject({
      opacity: 0,
      transform: [{ scale: legend.scaleFrom }],
    });
  });

  it('plays a shorter exit before unmounting, and ignores a second « Compris »', async () => {
    const { view, onDismiss } = await renderHint();
    mockWithTiming.mockClear();

    await act(async () => {
      view.rerender(<RevenueHeatmapHint onDismiss={onDismiss} testID="hint" visible={false} />);
    });

    expect(exit.duration).toBeLessThan(HEATMAP_HINT_MOTION.fadeIn);
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: exit.duration }));
    expect(timingTargets()).toEqual(expect.arrayContaining([0, exit.scale, exit.translateY]));
    // Still there while it leaves, and no longer tappable.
    expect(view.getByTestId('hint')).toBeTruthy();
    expect(view.getByTestId('hint-reveal').props.pointerEvents).toBe('none');
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Compris' }));
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(exit.duration);
    });
    expect(view.queryByTestId('hint')).toBeNull();
  });

  it('turns the same card back when reopened during its exit', async () => {
    const { view, onDismiss } = await renderHint();
    await act(async () => {
      view.rerender(<RevenueHeatmapHint onDismiss={onDismiss} testID="hint" visible={false} />);
    });
    mockWithSpring.mockClear();

    await act(async () => {
      view.rerender(<RevenueHeatmapHint onDismiss={onDismiss} testID="hint" visible />);
    });
    await act(async () => {
      jest.advanceTimersByTime(exit.duration * 2);
    });

    expect(view.getAllByTestId('hint')).toHaveLength(1);
    expect(mockWithSpring).toHaveBeenCalledWith(1, spring);
    expect(view.getByTestId('hint-reveal').props.pointerEvents).toBe('auto');
  });

  it('keeps a short fade alone under Reduce Motion: no scale, no rise, no stagger', async () => {
    mockReducedMotion = true;
    const { view, onDismiss } = await renderHint();

    expect(revealStyle(view)).toMatchObject({ opacity: 0, transform: [{ translateY: 0 }, { scale: 1 }] });
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockWithDelay).not.toHaveBeenCalled();
    expect(mockWithTiming).toHaveBeenCalledWith(1, { duration: HEATMAP_HINT_MOTION.reducedFade });
    expect(StyleSheet.flatten(view.getByTestId('hint-legend-low').props.style)).toMatchObject({
      opacity: 1,
      transform: [{ scale: 1 }],
    });

    mockWithTiming.mockClear();
    await act(async () => {
      view.rerender(<RevenueHeatmapHint onDismiss={onDismiss} testID="hint" visible={false} />);
    });
    expect(timingTargets()).toEqual([0]);
    await act(async () => {
      jest.advanceTimersByTime(HEATMAP_HINT_MOTION.reducedFade);
    });
    expect(view.queryByTestId('hint')).toBeNull();
  });
});
