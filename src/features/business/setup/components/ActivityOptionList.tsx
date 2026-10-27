// BeautIzzy — the profession cards of onboarding
//
// One full-width option card per profession (activity-options.ts), stacked,
// single selection — the same card as the reminder opt-in: a white card with
// a hairline border, the profession pictogram on a lavender disc, the label,
// one supporting line and the selection mark; the selected one turns light
// lavender with the accent border and the check. A « Bientôt disponible »
// profession keeps its place but is NOT a choice: its card is disabled,
// quieter, carries the badge instead of the mark, and announces both states
// to assistive technology. Each card is a radio.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BusinessActivityType } from '@/domain/business';
import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { ACTIVITY_OPTIONS, COMING_SOON_LABEL } from '../activity-options';
import { SelectionCheck } from './SelectionCheck';

interface ActivityOptionListProps {
  readonly value: BusinessActivityType | null;
  readonly onSelect: (activityType: BusinessActivityType) => void;
  readonly disabled?: boolean;
}

export function ActivityOptionList({ value, onSelect, disabled = false }: ActivityOptionListProps) {
  return (
    <View accessibilityRole="radiogroup" style={styles.list} testID="activity-options">
      {ACTIVITY_OPTIONS.map((option) => {
        const available = option.availability === 'AVAILABLE';
        const selected = available && option.type === value;
        const inactive = disabled || !available;
        return (
          <Pressable
            accessibilityHint={available ? undefined : 'Cette activité n’est pas encore disponible.'}
            accessibilityLabel={available ? option.label : `${option.label}, ${COMING_SOON_LABEL.toLowerCase()}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: inactive }}
            disabled={inactive}
            key={option.type}
            onPress={() => onSelect(option.type)}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              !available && styles.cardComingSoon,
              pressed && styles.cardPressed,
            ]}
            testID={`activity-${option.type}`}
          >
            <View style={[styles.glyph, selected && styles.glyphSelected, !available && styles.glyphComingSoon]}>
              <SymbolView
                name={option.icon}
                size={20}
                tintColor={
                  selected ? semanticColors.onAccent : available ? semanticColors.accent : semanticColors.foregroundMuted
                }
              />
            </View>
            <View style={styles.copy}>
              <AppText
                numberOfLines={1}
                style={selected ? styles.labelSelected : available ? styles.label : styles.labelComingSoon}
                variant="rowTitle"
              >
                {option.label}
              </AppText>
              <AppText numberOfLines={2} style={styles.description} variant="metadata">
                {option.description}
              </AppText>
            </View>
            {available ? (
              <SelectionCheck selected={selected} />
            ) : (
              <View style={styles.badge} testID={`activity-${option.type}-coming-soon`}>
                <AppText style={styles.badgeText} variant="chip">
                  {COMING_SOON_LABEL}
                </AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.base,
  },
  cardSelected: { backgroundColor: semanticColors.surfaceLavender, borderColor: semanticColors.accent },
  // Quieter, never greyed to illegibility: the label stays readable, the
  // badge says why the card does not answer.
  cardComingSoon: { backgroundColor: semanticColors.surface },
  cardPressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.cardPressedScale }] },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  glyphSelected: { backgroundColor: semanticColors.accent },
  glyphComingSoon: { backgroundColor: semanticColors.surfaceInput },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  label: { color: semanticColors.foreground },
  labelSelected: { color: semanticColors.accent },
  labelComingSoon: { color: semanticColors.foregroundSoft },
  description: { color: semanticColors.foregroundSoft },
  badge: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { color: semanticColors.accent },
});
