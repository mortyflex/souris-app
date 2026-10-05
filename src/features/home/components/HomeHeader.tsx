// Souris — Accueil welcome
//
// A compact branded welcome: the canonical Souris wordmark (BrandMark — the
// one way the app draws its identity) with today's date facing it, then the
// greeting and one quiet line. The greeting is the page header but no longer
// a screen-sized title: the cards below carry the weight of the page.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark, brandAssets } from '@/shared/ui/BrandMark';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

/** Rendered width of the wordmark box; its artwork is about 92 pt wide. */
const WORDMARK_SIZE = 150;
// The canonical PNG carries transparent padding around the artwork (BrandMark):
// the artwork starts 410 px from the left and 65 px from the top of the
// 2172 × 724 box. Pulling the box back by that much sets the ARTWORK, not the
// box, on the page gutter and on the top of the header.
const WORDMARK_SCALE = WORDMARK_SIZE / brandAssets.wordmark.width;
const WORDMARK_INSET_LEFT = Math.round(410 * WORDMARK_SCALE);
const WORDMARK_INSET_TOP = Math.round(65 * WORDMARK_SCALE);

interface HomeHeaderProps {
  readonly greeting: string;
  /** `Lundi 5 octobre` */
  readonly dateLabel: string;
}

export function HomeHeader({ greeting, dateLabel }: HomeHeaderProps) {
  return (
    <View style={styles.header} testID="home-header">
      <View style={styles.brandRow}>
        <BrandMark size={WORDMARK_SIZE} style={styles.wordmark} variant="wordmark" />
        <AppText variant="metadata" numberOfLines={1} style={styles.date}>
          {dateLabel}
        </AppText>
      </View>
      <View>
        <AppText accessibilityRole="header" variant="summaryValue" style={styles.greeting}>
          {greeting}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Votre journée en un coup d’œil.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  wordmark: { marginLeft: -WORDMARK_INSET_LEFT, marginTop: -WORDMARK_INSET_TOP },
  date: { color: foregroundSoft, flexShrink: 1, textAlign: 'right' },
  greeting: { color: semanticColors.foreground },
  subtitle: { color: foregroundSoft },
});
