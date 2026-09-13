// Souris — ScreenWatermarkIcon
//
// The subtle identity element of the four main tabs: one large, low-contrast
// semantic symbol anchored in the top-right corner of the page surface,
// partially cropped by the right edge and rising slightly above the title so
// it reads as embedded in the page — never as a button, a card or a floating
// control.
//
// Anchoring contract: the icon is positioned relative to the SCREEN TITLE
// BLOCK (MainScreenHeader), never relative to the device edge, so the status
// bar, the Dynamic Island and the rounded corners never change where it sits
// on the page. Yoga positions absolute children against the parent's border
// box, so the anchor is always a full-width, unpadded title block. The
// right-edge crop is the same for every symbol.
//
// Optical sizing: symbols do not fill their nominal box the same way (a
// calendar or a box is nearly square, two people are wide and short and sit
// in the middle of the box). Each symbol may carry a restrained optical
// scale and rise so that its recognizable part stays visible around the
// header composition instead of hiding behind the search field. The shared
// anchor (top and right offsets from the base size) never changes per screen.
//
// Decoration only: absolutely positioned (no layout impact), pointer-
// transparent, hidden from accessibility, and drawn UNDER the screen content
// so titles and actions always stay on top. One opacity for every main screen
// (theme `watermark`).

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { semanticColors, watermark } from './theme';

export type ScreenWatermarkKind = 'agenda' | 'clients' | 'products' | 'settings';

/** Canonical semantic mapping (SF Symbol / Material symbol). */
export const screenWatermarkSymbols: Record<ScreenWatermarkKind, SymbolViewProps['name']> = {
  agenda: { ios: 'calendar', android: 'calendar_month' },
  clients: { ios: 'person.2', android: 'group' },
  products: { ios: 'shippingbox', android: 'inventory_2' },
  settings: { ios: 'gearshape', android: 'settings' },
};

interface WatermarkOptics {
  /** Multiplier of the shared size for glyphs that under-fill their box. */
  readonly scale: number;
  /** Extra fraction of the shared size lifted above the title block. */
  readonly rise: number;
}

/** Restrained per-symbol optical adjustments; 1 / 0 is the reference (Produits). */
export const screenWatermarkOptics: Record<ScreenWatermarkKind, WatermarkOptics> = {
  agenda: { scale: 1, rise: 0 },
  // Two people are wide and short: grow and lift them so the heads and the
  // shoulders stay readable above the search field.
  clients: { scale: 1.16, rise: 0.16 },
  products: { scale: 1, rise: 0 },
  settings: { scale: 1, rise: 0 },
};

interface ScreenWatermarkIconProps {
  readonly kind: ScreenWatermarkKind;
}

export function ScreenWatermarkIcon({ kind }: ScreenWatermarkIconProps) {
  const optics = screenWatermarkOptics[kind];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.anchor, { top: styles.anchor.top - watermark.size * optics.rise }]}
      testID={`screen-watermark-${kind}`}
    >
      <SymbolView
        name={screenWatermarkSymbols[kind]}
        size={watermark.size * optics.scale}
        tintColor={semanticColors.accent}
        weight="regular"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    opacity: watermark.opacity,
    position: 'absolute',
    right: -watermark.size * watermark.cropRight,
    top: -watermark.size * watermark.cropTop,
    zIndex: 0,
  },
});
