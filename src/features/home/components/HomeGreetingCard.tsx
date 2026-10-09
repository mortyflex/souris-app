// BeautIzzy — Accueil greeting card
//
// The first card of the top area: « Bonjour » / « Bonsoir » and one quiet
// line, on a plain white surface. It is the page header for assistive
// technology, but never a screen-sized title: the tinted next-appointment
// card beside it stays the highlight. As the narrow column of the top row
// (about 115 pt on an iPhone SE) its quiet line wraps onto two or three
// lines; it is never shortened.
//
// With a reminder — an Appointment of today left to collect — the quiet line
// gives way to two: WHICH one (one visual line, a long name is cut) and the
// accent « Reste à encaisser ». The whole card is then ONE button that opens
// that Appointment. Same surface, same greeting: a calm nudge, never an alert,
// and no chevron in so narrow a column.

import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import {
  fontFamilies,
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { HomeEncashmentReminder } from '../presentation';

interface HomeGreetingCardProps {
  readonly greeting: string;
  /** The narrow column of the top row: a smaller quiet line that wraps. */
  readonly compact?: boolean;
  /** An Appointment left to collect: replaces the quiet line. */
  readonly reminder?: HomeEncashmentReminder;
  /** Opens what the reminder is about. The card is pressable only with both. */
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

export function HomeGreetingCard({
  greeting,
  compact = false,
  reminder,
  onPress,
  style,
}: HomeGreetingCardProps) {
  const lineVariant = compact ? 'metadata' : 'body';

  if (reminder && onPress) {
    return (
      <Pressable
        // One button, announced once: the label says everything the lines show.
        accessibilityLabel={`${greeting}. ${reminder.accessibilityLabel}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
        testID="home-greeting"
      >
        <AppText variant="summaryValue" style={styles.greeting}>
          {greeting}
        </AppText>
        <View>
          <AppText variant={lineVariant} numberOfLines={1} style={styles.reminderDetail}>
            {reminder.detail}
          </AppText>
          <AppText variant={lineVariant} style={styles.reminderEmphasis}>
            {reminder.emphasis}
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]} testID="home-greeting">
      <AppText accessibilityRole="header" variant="summaryValue" style={styles.greeting}>
        {greeting}
      </AppText>
      <AppText variant={lineVariant} style={styles.subtitle}>
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
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  greeting: { color: semanticColors.foreground },
  subtitle: { color: foregroundSoft },
  reminderDetail: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  // The action of the card: the accent of every other link of the page.
  reminderEmphasis: { color: semanticColors.accent, fontFamily: fontFamilies['600'] },
});
