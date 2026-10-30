// BeautIzzy — lightweight Reanimated test double for the birthday confetti
//
// Used through `jest.mock('react-native-reanimated', () =>
// jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'))`
// by screens that render BirthdayConfetti, by the Agenda for the
// « Résumé du jour » receipt printer, by the Caisse for its heatmap
// hint, and by the onboarding for « On prépare votre espace… ». Nothing animates: a shared value
// jumps straight to its target and an animated style is evaluated once.
// `reducedMotion.enabled` is the switch a test flips to simulate the system
// preference. Never imported by application code.

import { createElement, useState, type ReactNode } from 'react';
import { View } from 'react-native';

export const reducedMotion = { enabled: false };

const AnimatedView = (props: { readonly children?: ReactNode }) => createElement(View, props);

export default Object.assign(AnimatedView, { View: AnimatedView });
export const Easing = {
  linear: (value: number) => value,
  quad: (value: number) => value,
  bezier: () => (value: number) => value,
  out: (easing: (value: number) => number) => easing,
  inOut: (easing: (value: number) => number) => easing,
};
export const useReducedMotion = () => reducedMotion.enabled;
export const useAnimatedStyle = (style: () => object) => style();
export const withTiming = (value: unknown) => value;
export const withSpring = (value: unknown) => value;
export const withDelay = (_delay: number, value: unknown) => value;
export const withSequence = (...values: unknown[]) => values[values.length - 1];

// Stable across renders, like the real hook.
export function useSharedValue<T>(initial: T) {
  const [shared] = useState(() => {
    const holder = {
      value: initial,
      get: () => holder.value,
      set: (next: T) => {
        holder.value = next;
      },
    };
    return holder;
  });
  return shared;
}
