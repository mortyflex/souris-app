// BeautIzzy — the primary-activity grid of onboarding
//
// Two columns of tiles, one per activity (activity-options.ts), single
// selection. A tile at rest is a white card with a hairline border, the
// profession pictogram on a lavender disc and its label; the selected one
// turns light lavender with the accent border and the check. Each tile is a
// radio for assistive technology and announces its selected state.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BusinessActivityType } from '@/domain/business';
import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { ACTIVITY_OPTIONS } from '../activity-options';
import { SelectionCheck } from './SelectionCheck';

interface ActivityGridProps {
  readonly value: BusinessActivityType | null;
  readonly onSelect: (activityType: BusinessActivityType) => void;
  readonly disabled?: boolean;
}

export function ActivityGrid({ value, onSelect, disabled = false }: ActivityGridProps) {
  return (
    <View accessibilityRole="radiogroup" style={styles.grid} testID="activity-grid">
      {ACTIVITY_OPTIONS.map((option) => {
        const selected = option.type === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled }}
            disabled={disabled}
            key={option.type}
            onPress={() => onSelect(option.type)}
            style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.tilePressed]}
            testID={`activity-${option.type}`}
          >
            <View style={styles.tileTop}>
              <View style={[styles.glyph, selected && styles.glyphSelected]}>
                <SymbolView
                  name={option.icon}
                  size={20}
                  tintColor={selected ? semanticColors.onAccent : semanticColors.accent}
                />
              </View>
              <SelectionCheck selected={selected} />
            </View>
            <AppText numberOfLines={2} style={selected ? styles.labelSelected : styles.label} variant="control">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 104,
    padding: spacing.base,
  },
  tileSelected: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.accent,
  },
  tilePressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.cardPressedScale }] },
  tileTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  glyphSelected: { backgroundColor: semanticColors.accent },
  label: { color: semanticColors.foreground },
  labelSelected: { color: semanticColors.accent },
});
