// BeautIzzy — Client Profile stat card
//
// One glanceable figure of the profile's Activité grid: a small accent glyph
// in a lavender disc, then the value in navy over a short soft label — the
// number is read first. Numbers are never violet. Display only — every value is derived by the
// profile presentation, nothing is computed here.
//
// An optional `accent` draws a thin coloured outline (the glyph takes the same
// colour) without moving anything: the outline is carved out of the padding,
// so an accented card keeps the exact footprint of a plain one. The figure
// and its label never change colour.
//
// Fixed figure size, no `adjustsFontSizeToFit`: measured while the grid was
// still settling (a pushed screen's first layout, a `flex: 1` card of a row),
// it shrank « 0 » and « 0,00 € » to a fraction of their size and never grew
// back — the same failure as the sheet title (DESIGN_OVERRIDES.md §30) and the
// navigator date (§21). The value renders at the `summaryValue` role; growth
// follows the reader's text size up to a cap; a figure too long for the card
// (a large « Total dépensé » on a small phone) is stepped down
// DETERMINISTICALLY from the measured width — same width, same text, same
// size — down to a floor, and truncates beyond it. Zero, small and large
// values therefore share one size whenever they fit.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing, typography } from '@/shared/ui/theme';

/** A severity outline of one card. The colour is never the only cue (see `accessibilityDescription`). */
export interface ProfileStatCardAccent {
  readonly color: string;
}

interface ProfileStatCardProps {
  readonly icon: SymbolViewProps['name'];
  /** Short enough to never truncate in a half-width card. */
  readonly label: string;
  readonly value: string;
  /** The full spoken name of the figure, when the visible label is shortened. */
  readonly accessibilityLabel?: string;
  /** Spoken after the value: what an `accent` means, so it never depends on colour alone. */
  readonly accessibilityDescription?: string;
  readonly accent?: ProfileStatCardAccent;
  /** Identifies the value text. */
  readonly testID: string;
}

const ACCENT_BORDER_WIDTH = 1.5;

/**
 * The figure follows the reader's text size up to this multiplier and stops
 * there: a half-width card has no room for more. Growth is capped — the
 * figure is never shrunk by the text setting itself.
 */
export const profileStatValueMaxFontScale = 1.2;

/**
 * The figure is never stepped down below this share of its role size; a
 * value still too long at the floor truncates (one line, tail ellipsis).
 */
export const profileStatValueMinimumScale = 0.75;

const valueRole = typography.daySummaryValue;

// Advance widths of the figure role (Plus Jakarta Sans Bold, tabular digits),
// as a share of the font size, read from the font file. Every space is
// over-estimated and the negative letter-spacing ignored, so a value steps
// down slightly early rather than clip.
const DIGIT_WIDTH = 0.6;
const GLYPH_WIDTHS: Readonly<Record<string, number>> = {
  '€': 0.77,
  ',': 0.36,
  '.': 0.38,
  ' ': 0.25,
  ' ': 0.25,
  ' ': 0.25,
};
const OTHER_GLYPH_WIDTH = 0.65;

function glyphWidth(character: string): number {
  if (character >= '0' && character <= '9') return DIGIT_WIDTH;
  return GLYPH_WIDTHS[character] ?? OTHER_GLYPH_WIDTH;
}

/** The width (pt) a figure needs at `fontSize`, from the role's glyph advances. */
export function estimateProfileStatValueWidth(value: string, fontSize: number): number {
  let em = 0;
  for (const character of value) em += glyphWidth(character);
  return em * fontSize;
}

/**
 * The unscaled font size (pt) of a figure in a card whose copy column is
 * `availableWidth` wide, under the reader's `fontScale`: the role size when
 * the figure fits, otherwise the largest size that fits, floored at
 * `profileStatValueMinimumScale`. Pure and deterministic.
 */
export function getProfileStatValueFontSize(
  value: string,
  availableWidth: number,
  fontScale: number,
): number {
  const appliedScale = Math.min(fontScale, profileStatValueMaxFontScale);
  const neededWidth = estimateProfileStatValueWidth(value, valueRole.fontSize * appliedScale);
  if (neededWidth <= availableWidth) return valueRole.fontSize;
  const fitted = (valueRole.fontSize * availableWidth) / neededWidth;
  return Math.max(fitted, valueRole.fontSize * profileStatValueMinimumScale);
}

export function ProfileStatCard({
  icon,
  label,
  value,
  accessibilityLabel = label,
  accessibilityDescription,
  accent,
  testID,
}: ProfileStatCardProps) {
  const { fontScale } = useWindowDimensions();
  // Width actually left for the copy column, measured on this card.
  const [copyWidth, setCopyWidth] = useState<number>();
  const onCopyLayout = (event: LayoutChangeEvent) => setCopyWidth(event.nativeEvent.layout.width);

  const fontSize =
    copyWidth === undefined ? valueRole.fontSize : getProfileStatValueFontSize(value, copyWidth, fontScale);
  const lineHeight = (valueRole.lineHeight * fontSize) / valueRole.fontSize;

  const spokenParts = [accessibilityLabel, value];
  if (accent && accessibilityDescription) spokenParts.push(accessibilityDescription);

  return (
    <View
      accessible
      accessibilityLabel={spokenParts.join(', ')}
      style={[styles.card, accent && [styles.accentedCard, { borderColor: accent.color }]]}
    >
      <View style={styles.glyph}>
        <SymbolView name={icon} size={16} tintColor={accent?.color ?? semanticColors.accent} />
      </View>
      <View onLayout={onCopyLayout} style={styles.copy}>
        <AppText
          maxFontSizeMultiplier={profileStatValueMaxFontScale}
          numberOfLines={1}
          variant="summaryValue"
          style={[styles.value, { fontSize, lineHeight }]}
          testID={testID}
        >
          {value}
        </AppText>
        <AppText variant="metadata" numberOfLines={2} style={styles.label}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.md,
  },
  // The outline replaces part of the padding: same outer size as a plain card.
  accentedCard: {
    borderWidth: ACCENT_BORDER_WIDTH,
    padding: spacing.md - ACCENT_BORDER_WIDTH,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: { flex: 1, minWidth: 0 },
  label: { color: foregroundSoft },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
