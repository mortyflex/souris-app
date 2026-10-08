// BeautIzzy — Accueil greeting card
//
// The first card of the top area: « Bonjour » / « Bonsoir » and one quiet
// line, on a plain white surface. It is the page header for assistive
// technology, but never a screen-sized title: the tinted next-appointment
// card beside it stays the highlight. As the narrow column of the top row
// (about 115 pt on an iPhone SE) its quiet line wraps onto two or three
// lines; it is never shortened.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeGreetingCardProps {
  readonly greeting: string;
  /** The narrow column of the top row: a smaller quiet line that wraps. */
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function HomeGreetingCard({ greeting, compact = false, style }: HomeGreetingCardProps) {
  return (
    <View style={[styles.card, style]} testID="home-greeting">
      <AppText accessibilityRole="header" variant="summaryValue" style={styles.greeting}>
        {greeting}
      </AppText>
      <AppText variant={compact ? 'metadata' : 'body'} style={styles.subtitle}>
        Votre journée en un coup d’œil.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
    padding: spacing.md,
  },
  greeting: { color: semanticColors.foreground },
  subtitle: { color: foregroundSoft },
});
