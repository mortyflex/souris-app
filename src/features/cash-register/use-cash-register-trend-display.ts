// BeautIzzy — Caisse comparison display (percent ↔ the change itself)
//
// One tap on a card's comparison switches EVERY figure of that card between
// percent and the change itself, with one light haptic. Local to the card,
// never stored: each mount opens on the unit's default display
// (`getDefaultCashRegisterTrendDisplay`). Offered only when a figure would
// actually change (`canToggleCashRegisterTrendDisplay`); the enclosing
// accessible card then becomes the button, its hint saying what comes next.

import { useState } from 'react';
import type { AccessibilityActionEvent, ViewProps } from 'react-native';

import type { CashRegisterTrend } from '@/domain/cash-register';
import { haptics } from '@/shared/lib/haptics';

import {
  canToggleCashRegisterTrendDisplay,
  describeCashRegisterTrendToggle,
  getDefaultCashRegisterTrendDisplay,
  toggleCashRegisterTrendDisplay,
  type CashRegisterTrendDisplay,
  type CashRegisterTrendUnit,
} from './presentation';

type TrendToggleAccessibilityProps = Pick<
  ViewProps,
  'accessibilityActions' | 'accessibilityHint' | 'accessibilityRole' | 'onAccessibilityAction'
>;

export interface CashRegisterTrendDisplayState {
  readonly display: CashRegisterTrendDisplay;
  /** Undefined when no figure of the card would change. */
  readonly toggle: (() => void) | undefined;
  /** For the card's accessible group: a button activated by VoiceOver / TalkBack. */
  readonly accessibilityProps: TrendToggleAccessibilityProps;
}

export function useCashRegisterTrendDisplay(
  unit: CashRegisterTrendUnit,
  trends: readonly (CashRegisterTrend | undefined)[],
): CashRegisterTrendDisplayState {
  const [display, setDisplay] = useState(() => getDefaultCashRegisterTrendDisplay(unit));

  const canToggle = trends.some((trend) => trend !== undefined && canToggleCashRegisterTrendDisplay(trend));
  if (!canToggle) return { display, toggle: undefined, accessibilityProps: {} };

  const toggle = () => {
    haptics.selection();
    setDisplay(toggleCashRegisterTrendDisplay);
  };
  return {
    display,
    toggle,
    accessibilityProps: {
      accessibilityActions: [{ name: 'activate' }],
      accessibilityHint: describeCashRegisterTrendToggle(display, unit),
      accessibilityRole: 'button',
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'activate') toggle();
      },
    },
  };
}
