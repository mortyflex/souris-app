// BeautIzzy — Caisse trend badge, row and note
//
// How a Cash Register comparison is shown (DESIGN_OVERRIDES.md §31):
//
//   CashRegisterTrendBadge   the pill — a small direction glyph and the figure
//                            (« +12,4 % », « −8,0 % », « +3 », « Stable ») on the
//                            matching StatePill tone: mint for a rise, rose for a
//                            fall, neutral when nothing moved. The glyph and the
//                            written figure always go with the colour. Its
//                            `secondary` variant — the year-over-year pill — is
//                            the quieter sibling: a plain surface fill, the same
//                            tinted glyph, the figure in soft ink, a size smaller.
//                            When its figure can switch, the pill ends with a
//                            hairline and a tiny ⇄ glyph (`toggleable`): the
//                            quiet cue that a tap changes the display.
//   CashRegisterTrendRow     the badge followed by the compared window in quiet
//                            metadata (« vs 1er–29 sept. »); wraps on a narrow
//                            phone with large text instead of overflowing.
//   CashRegisterTrendToggle  the tappable comparison area: one tap switches the
//                            figures of its card between percent and the change
//                            itself (`useCashRegisterTrendDisplay`), with one
//                            light haptic. A plain group when nothing can switch.
//   CashRegisterComparisonNote
//                            why no comparison is shown, when saying so helps
//                            (`describeCashRegisterComparisonUnavailability`):
//                            a small soft info glyph and one metadata sentence
//                            (« Historique insuffisant pour comparer avec
//                            septembre ») — no tone, no banner, wraps freely.
//
// Speech is the parent's job: these elements sit inside an `accessible` card
// whose label already reads `describeCashRegisterTrend` or the explanation —
// grouped, they are never focused on their own. When the figures can switch,
// that card is the button (`useCashRegisterTrendDisplay().accessibilityProps`).

import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CashRegisterTrend, CashRegisterTrendDirection } from '@/domain/cash-register';
import { trendDisplayToggleIcon, trendIcons } from '@/shared/icons/trend-icons';
import { AppText } from '@/shared/ui/AppText';
import { statePillTones, type StatePillColors } from '@/shared/ui/StatePill';
import { foregroundSoft, interaction, radii, spacing } from '@/shared/ui/theme';

import {
  formatCashRegisterComparisonReference,
  formatCashRegisterTrendValue,
  type CashRegisterTrendDisplay,
  type CashRegisterTrendUnit,
} from '../presentation';

/** THE tone of each direction — the existing state tones, never a new colour. */
export const trendTones: Readonly<Record<CashRegisterTrendDirection, StatePillColors>> = {
  UP: statePillTones.positive,
  DOWN: statePillTones.exception,
  FLAT: statePillTones.neutral,
};

/** Primary: the previous-month pill. Secondary: the quieter year-over-year pill. */
export type CashRegisterTrendVariant = 'primary' | 'secondary';

interface CashRegisterTrendBadgeProps {
  readonly direction: CashRegisterTrendDirection;
  readonly label: string;
  readonly variant?: CashRegisterTrendVariant;
  /** Ends the pill with the ⇄ cue: a tap switches percent ↔ the change itself. */
  readonly toggleable?: boolean;
  readonly testID?: string;
}

export function CashRegisterTrendBadge({
  direction,
  label,
  variant = 'primary',
  toggleable = false,
  testID,
}: CashRegisterTrendBadgeProps) {
  const tone = trendTones[direction];
  const secondary = variant === 'secondary';
  return (
    <View
      style={[
        styles.badge,
        secondary && styles.badgeSecondary,
        { backgroundColor: secondary ? statePillTones.neutral.fill : tone.fill },
      ]}
      testID={testID}
    >
      <SymbolView name={trendIcons[direction]} size={secondary ? 11 : 12} tintColor={tone.dot} weight="bold" />
      <AppText
        numberOfLines={1}
        style={[styles.badgeLabel, { color: secondary ? foregroundSoft : tone.text }]}
        testID={testID === undefined ? undefined : `${testID}-value`}
        variant="chip"
      >
        {label}
      </AppText>
      {toggleable && (
        <View
          style={[styles.toggleCue, { borderLeftColor: tone.dot }]}
          testID={testID === undefined ? undefined : `${testID}-toggle-cue`}
        >
          <SymbolView
            name={trendDisplayToggleIcon}
            size={secondary ? 9 : 10}
            tintColor={secondary ? foregroundSoft : tone.text}
            weight="semibold"
          />
        </View>
      )}
    </View>
  );
}

interface CashRegisterTrendProps {
  readonly trend: CashRegisterTrend;
  readonly unit: CashRegisterTrendUnit;
  readonly display?: CashRegisterTrendDisplay;
  readonly variant?: CashRegisterTrendVariant;
  readonly toggleable?: boolean;
  readonly testID: string;
}

export function CashRegisterTrendRow({ trend, unit, display, variant, toggleable, testID }: CashRegisterTrendProps) {
  return (
    <View
      style={styles.row}
      testID={testID}
    >
      <CashRegisterTrendBadge
        direction={trend.direction}
        label={formatCashRegisterTrendValue(trend, unit, display)}
        testID={`${testID}-badge`}
        toggleable={toggleable}
        variant={variant}
      />
      <AppText style={styles.reference} testID={`${testID}-reference`} variant="metadata">
        {formatCashRegisterComparisonReference(trend.comparison)}
      </AppText>
    </View>
  );
}

interface CashRegisterTrendToggleProps {
  readonly children: ReactNode;
  /** Absent when nothing would change: the rows then stay a plain group. */
  readonly onToggle: (() => void) | undefined;
  readonly testID: string;
}

export function CashRegisterTrendToggle({ children, onToggle, testID }: CashRegisterTrendToggleProps) {
  if (onToggle === undefined) {
    return (
      <View style={styles.toggle} testID={testID}>
        {children}
      </View>
    );
  }
  // Not an accessibility element of its own: the enclosing card is the button.
  return (
    <Pressable
      accessible={false}
      hitSlop={toggleHitSlop}
      onPress={onToggle}
      style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

// A lone 26 pt pill still offers a 44 pt target.
const toggleHitSlop = { bottom: 9, left: spacing.xs, right: spacing.xs, top: 9 } as const;

/** The shared info glyph of the Caisse (the heatmap hint uses the same one). */
const comparisonNoteIcon = { ios: 'info.circle', android: 'info' } as const;

interface CashRegisterComparisonNoteProps {
  readonly children: string;
  readonly testID: string;
}

export function CashRegisterComparisonNote({ children, testID }: CashRegisterComparisonNoteProps) {
  return (
    <View style={styles.comparisonNote} testID={testID}>
      <View style={styles.comparisonNoteIcon}>
        <SymbolView name={comparisonNoteIcon} size={13} tintColor={foregroundSoft} />
      </View>
      <AppText style={styles.comparisonNoteText} testID={`${testID}-text`} variant="metadata">
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 26,
    paddingHorizontal: spacing.sm + 2,
  },
  // Quieter: a size smaller, on the plain surface of the neutral tone.
  badgeSecondary: { minHeight: 24, paddingHorizontal: spacing.sm },
  badgeLabel: { fontVariant: ['tabular-nums'] },
  // A hairline then the ⇄ glyph, faded: present, never louder than the figure.
  toggleCue: {
    alignSelf: 'stretch',
    borderLeftWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginLeft: 2,
    marginVertical: 6,
    opacity: 0.55,
    paddingLeft: spacing.xs + 2,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  reference: { color: foregroundSoft, flexShrink: 1 },
  toggle: { gap: spacing.sm },
  togglePressed: { opacity: interaction.pressedOpacity },
  // The glyph stays on the first line while the sentence wraps on a narrow phone.
  comparisonNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  // Centred on the metadata line height (13.5 pt text, ~18 pt line).
  comparisonNoteIcon: { height: 18, justifyContent: 'center' },
  comparisonNoteText: { color: foregroundSoft, flex: 1 },
});
