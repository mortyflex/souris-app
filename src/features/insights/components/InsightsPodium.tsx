// BeautIzzy — InsightsPodium
//
// ONE ranking category of « Tops & tendances » as a Top 3 podium — the visual
// signature of the receipt (DESIGN_OVERRIDES.md §34): the category eyebrow,
// then three places, each ONE vertical unit — medal, name, metric, plinth:
//
//                   (1)
//                   /\
//                Balayage
//              18 prestations
//      (2)    ┌───────────┐     (3)
//     Coupe   │     1     │    Gloss
//   ┌────────┐│           │┌────────┐
//   │   2    ││           ││   3    │
//   └────────┘└───────────┘└────────┘
//
// #1 centred on the tallest, strongest plinth with the largest medal; #2 on
// the left, #3 on the right; the three plinths touch on one floor. Medals are
// flat metal discs with a rim, an inset ring, the digit and two ribbon tails —
// Views only, no image, no gradient. Everything visual is decorative: each
// place is ONE accessible element carrying its spoken label.
//
// Self-contained and carousel-agnostic: it receives an already-worded
// category (`InsightsRankingSection`) and renders it on paper — the receipt
// page, or the share card (`BusinessInsightsShareCard`), which renders it on
// its own, without the carousel or a capture of the private receipt. It sizes
// itself from its container's width. Computes nothing.
//
// A metric (« 2 prestations ») uses the whole width of its column and is never
// truncated or shrunk: at worst it wraps onto a second line. Only names keep a
// side padding, so two neighbouring names never touch.
//
// Share-card options: `allowFontScaling={false}` keeps an exported bitmap independent from the
// device text size; `layout="story"` widens #1 on the narrower card (below).

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import {
  fontFamilies,
  lavender,
  radii,
  receiptMedal,
  receiptPaper,
  receiptPodium,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { InsightsRankingRow, InsightsRankingSection } from '../insights-receipt';

/**
 * `receipt` — #1 36 %, #2 / #3 32 % of the page (the in-app ticket).
 * `story`   — the share card: #1 40 %, #2 / #3 30 %.
 */
export type InsightsPodiumLayout = 'receipt' | 'story';

interface InsightsPodiumProps {
  readonly section: InsightsRankingSection;
  readonly layout?: InsightsPodiumLayout;
  /** `false` for an exported image: the layout never follows the device text size. */
  readonly allowFontScaling?: boolean;
  readonly testID?: string;
}

const MEDALS = { 1: receiptMedal.gold, 2: receiptMedal.silver, 3: receiptMedal.bronze } as const;

/** Disc diameter, ribbon tail size and plinth height of each place (pt). */
const GEOMETRY = {
  1: { disc: 48, tailWidth: 12, tailHeight: 18, plinth: 66 },
  2: { disc: 38, tailWidth: 10, tailHeight: 14, plinth: 46 },
  3: { disc: 38, tailWidth: 10, tailHeight: 14, plinth: 32 },
} as const;

export function InsightsPodium({
  section,
  layout = 'receipt',
  allowFontScaling = true,
  testID,
}: InsightsPodiumProps) {
  const [first, second, third] = section.rows;
  const story = layout === 'story';
  const slot = { allowFontScaling, testID };

  return (
    <View style={styles.root} testID={testID}>
      <AppText
        accessibilityRole="header"
        allowFontScaling={allowFontScaling}
        style={styles.title}
        variant="eyebrow"
      >
        {section.title}
      </AppText>

      {first === undefined ? (
        <View accessible style={styles.empty} testID={testID ? `${testID}-empty` : undefined}>
          <AppText allowFontScaling={allowFontScaling} variant="metadata" style={styles.emptyText}>
            {section.emptyMessage}
          </AppText>
        </View>
      ) : (
        // Tree (and reading) order is first, second, third. #1 is in the flow,
        // centred — always the tallest place, it gives the stage its height —
        // and #2 / #3 stand on the same floor, left and right.
        <View style={styles.stage}>
          <PodiumSlot {...slot} row={first} style={[styles.center, story && styles.storyCenter]} />
          {second && (
            <PodiumSlot {...slot} row={second} style={[styles.side, story && styles.storySide, styles.left]} />
          )}
          {third && (
            <PodiumSlot {...slot} row={third} style={[styles.side, story && styles.storySide, styles.right]} />
          )}
        </View>
      )}
    </View>
  );
}

/** One place of the podium: ONE vertical unit. A missing place renders nothing: #1 stays centred. */
function PodiumSlot({
  row,
  style,
  allowFontScaling,
  testID,
}: {
  readonly row: InsightsRankingRow;
  readonly style: StyleProp<ViewStyle>;
  readonly allowFontScaling: boolean;
  readonly testID?: string;
}) {
  const winner = row.rank === 1;
  const plinth = winner ? receiptPodium.first : receiptPodium.place;

  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      style={style}
      testID={testID ? `${testID}-place-${row.rank}` : undefined}
    >
      <Medal allowFontScaling={allowFontScaling} rank={row.rank} />
      <AppText
        allowFontScaling={allowFontScaling}
        numberOfLines={2}
        style={[styles.label, winner && styles.labelWinner]}
        variant="rowTitle"
      >
        {row.label}
      </AppText>
      <AppText
        allowFontScaling={allowFontScaling}
        numberOfLines={2}
        style={[styles.value, winner && styles.valueWinner]}
        variant={winner ? 'control' : 'metadata'}
      >
        {row.value}
      </AppText>
      <View
        style={[
          styles.plinth,
          { backgroundColor: plinth.face, borderTopColor: plinth.top, height: GEOMETRY[row.rank].plinth },
        ]}
        testID={testID ? `${testID}-plinth-${row.rank}` : undefined}
      >
        <AppText
          allowFontScaling={allowFontScaling}
          style={[styles.plinthNumber, { color: plinth.number }]}
          variant={winner ? 'sectionTitle' : 'control'}
        >
          {row.rank}
        </AppText>
      </View>
    </View>
  );
}

/**
 * A medal of Views: two ribbon tails (each notched at its end) hanging behind
 * a flat metal disc with a darker rim, a lighter inset ring and the digit.
 */
function Medal({
  rank,
  allowFontScaling,
}: {
  readonly rank: 1 | 2 | 3;
  readonly allowFontScaling: boolean;
}) {
  const medal = MEDALS[rank];
  const { disc, tailWidth, tailHeight } = GEOMETRY[rank];
  const tailTop = disc * 0.62;
  const inset = rank === 1 ? 4 : 3;

  return (
    <View style={{ height: tailTop + tailHeight, width: disc }}>
      {([-1, 1] as const).map((side) => (
        <View
          key={side}
          style={[
            styles.tail,
            {
              backgroundColor: side < 0 ? medal.ribbon : medal.ribbonShade,
              height: tailHeight,
              left: disc / 2 - tailWidth + (side < 0 ? 1 : tailWidth - 1),
              top: tailTop,
              // A positive angle swings the free end left: the tails part outwards.
              transform: [{ rotate: `${-side * 16}deg` }],
              width: tailWidth,
            },
          ]}
        >
          {/* The swallow-tail notch: a paper-coloured triangle at the end. */}
          <View
            style={[
              styles.notch,
              {
                borderBottomWidth: tailWidth * 0.45,
                borderLeftWidth: tailWidth / 2,
                borderRightWidth: tailWidth / 2,
              },
            ]}
          />
        </View>
      ))}
      <View
        style={[
          styles.disc,
          { backgroundColor: medal.fill, borderColor: medal.rim, height: disc, width: disc },
        ]}
      >
        <View style={[styles.discInset, { borderColor: medal.inset, margin: inset }]} />
        <AppText
          allowFontScaling={allowFontScaling}
          style={[styles.medalDigit, { color: medal.text }]}
          variant={rank === 1 ? 'sectionTitle' : 'control'}
        >
          {rank}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  title: { color: semanticColors.accent, textAlign: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', minHeight: 176, paddingHorizontal: spacing.lg },
  emptyText: { textAlign: 'center' },
  // One floor: #1 in the flow (always the tallest unit, it gives the stage
  // its height), #2 and #3 absolutely on the same baseline. The widths add up
  // to the whole page, so the three plinths touch.
  stage: { alignItems: 'center' },
  center: { alignItems: 'center', width: '36%' },
  side: { alignItems: 'center', bottom: 0, position: 'absolute', width: '32%' },
  storyCenter: { width: '40%' },
  storySide: { width: '30%' },
  left: { left: 0 },
  right: { right: 0 },
  label: {
    color: semanticColors.foreground,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
  },
  labelWinner: { fontFamily: fontFamilies['700'] },
  value: { fontVariant: ['tabular-nums'], textAlign: 'center' },
  valueWinner: { color: lavender.lav700 },
  plinth: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.small,
    borderTopRightRadius: radii.small,
    borderTopWidth: 3,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  plinthNumber: { fontVariant: ['tabular-nums'], opacity: 0.8 },
  disc: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  discInset: { ...StyleSheet.absoluteFill, borderRadius: radii.pill, borderWidth: 1 },
  medalDigit: { fontVariant: ['tabular-nums'], textAlign: 'center' },
  tail: { alignItems: 'center', justifyContent: 'flex-end', position: 'absolute' },
  notch: {
    borderBottomColor: receiptPaper.surface,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    height: 0,
    width: 0,
  },
});
