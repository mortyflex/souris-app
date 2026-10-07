// Souris — Accueil welcome
//
// A compact branded welcome: the editorial BeautIzzy logo (BrandMark — the
// one way the app draws its identity) with today's date facing it, then the
// greeting and one quiet line. The greeting is the page header but no longer
// a screen-sized title: the cards below carry the weight of the page.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark, brandMarkInsets } from '@/shared/ui/BrandMark';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

/** Rendered width of the logo box; its artwork is about 116 × 39 pt. */
const LOGO_SIZE = 125;
// The canonical PNG carries a thin transparent safe padding around the artwork
// (BrandMark). Pulling the box back by it sets the ARTWORK, not the box, on
// the page gutter and on the top of the header.
const LOGO_INSETS = brandMarkInsets('editorial', LOGO_SIZE);

interface HomeHeaderProps {
  readonly greeting: string;
  /** `Lundi 5 octobre` */
  readonly dateLabel: string;
}

export function HomeHeader({ greeting, dateLabel }: HomeHeaderProps) {
  return (
    <View style={styles.header} testID="home-header">
      <View style={styles.brandRow}>
        <BrandMark size={LOGO_SIZE} style={styles.logo} variant="editorial" />
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
  logo: {
    marginBottom: -LOGO_INSETS.bottom,
    marginLeft: -LOGO_INSETS.left,
    marginTop: -LOGO_INSETS.top,
  },
  date: { color: foregroundSoft, flexShrink: 1, textAlign: 'right' },
  greeting: { color: semanticColors.foreground },
  subtitle: { color: foregroundSoft },
});
