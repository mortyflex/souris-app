// Souris — Calendar Block card (Agenda Day)
//
// Personal unavailability on the timeline. Same card construction as an
// Appointment — flat fill, solid left accent, height-following radius — so it
// belongs to the same planning language, but ONE fixed mauve family for every
// block (DESIGN_OVERRIDES.md §24): never a client pastel, never a status
// colour, never a warning. It is recognised without colour too: the word
// « Indisponible », the glyph, and a spoken label with the reason and hours.

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { getCalendarBlockAccessibilityLabel } from '@/features/calendar-blocks/presentation';
import { calendarBlockIcon } from '@/shared/icons/calendar-block-icon';
import { AppText } from '@/shared/ui/AppText';
import { calendarBlockColors, interaction, radii } from '@/shared/ui/theme';

import { getCalendarBlockCardContent } from '../calendar-block-content';

interface CalendarBlockCardProps {
  readonly calendarBlock: CalendarBlock;
  readonly height: number;
  readonly onPress: () => void;
}

export function CalendarBlockCard({ calendarBlock, height, onPress }: CalendarBlockCardProps) {
  const content = getCalendarBlockCardContent(calendarBlock, height);
  // Same rule as the Appointment cards: short cards stay cards, never pills.
  const borderRadius = Math.min(radii.small, Math.max(3, Math.round(height / 4)));

  return (
    <Pressable
      accessible
      accessibilityHint="Ouvre le détail du créneau indisponible"
      accessibilityLabel={getCalendarBlockAccessibilityLabel(calendarBlock)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { borderRadius },
        pressed && styles.pressed,
      ]}
    >
      {content.mode === 'lines' && (
        <>
          <View style={styles.titleRow}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <SymbolView name={calendarBlockIcon} size={12} tintColor={calendarBlockColors.accent} />
            </View>
            <AppText variant="rowTitle" numberOfLines={1} style={styles.title}>
              {content.title}
            </AppText>
          </View>
          <AppText variant="metadata" numberOfLines={1} style={styles.reason}>
            {content.reason}
          </AppText>
        </>
      )}
      {content.mode === 'compact' && (
        <AppText variant="chip" numberOfLines={1} style={styles.compactTitle}>
          {content.title}
          <AppText variant="metadata" style={styles.compactReason}>
            {' · '}
            {content.reason}
          </AppText>
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: calendarBlockColors.background,
    borderLeftColor: calendarBlockColors.accent,
    borderLeftWidth: 3,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  title: { color: calendarBlockColors.title, flexShrink: 1, lineHeight: 16 },
  reason: { color: calendarBlockColors.subtitle, lineHeight: 15 },
  compactTitle: { color: calendarBlockColors.title, lineHeight: 14 },
  compactReason: { color: calendarBlockColors.subtitle, lineHeight: 14 },
  pressed: {
    backgroundColor: calendarBlockColors.backgroundPressed,
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
