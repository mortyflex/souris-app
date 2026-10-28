// BeautIzzy — « Catégorie » of the Prestation form
//
// The professional's categories as selectable chips (a radio group: the
// selection is stated by a thicker accent border, the radio state and the
// label — never by colour alone), « Aucune » first. The form only CHOOSES:
// categories are created, renamed, reordered and deleted in Prestations &
// tarifs › Catégories, never from inside a prestation. Without any category
// yet, a short line says where they are made. The chip pattern is the
// Calendar Block reason's (CalendarBlockForm).
//
// A category id the list does not know (removed on another device) selects
// no chip and is kept as it is until the professional picks another one: the
// form never rewrites a reference silently.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { ServiceCategory } from '@/domain/services';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, interaction, radii, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];
const chipHeight = 40;
const chipTouchSlop = Math.max(0, (minimumTouchTarget - chipHeight) / 2);
const chipHitSlop = { bottom: chipTouchSlop, top: chipTouchSlop } as const;

export const NO_CATEGORY_LABEL = 'Aucune';
export const NO_CATEGORIES_HINT = 'Créez vos catégories depuis Prestations & tarifs › Catégories.';

interface ServiceCategoryFieldProps {
  readonly categories: readonly ServiceCategory[];
  readonly value: string | undefined;
  readonly onChange: (categoryId: string | undefined) => void;
}

export function ServiceCategoryField({ categories, value, onChange }: ServiceCategoryFieldProps) {
  const choose = (categoryId: string | undefined) => {
    if (categoryId === value) return;
    haptics.selection();
    onChange(categoryId);
  };

  const chips: readonly { readonly id: string | undefined; readonly label: string }[] = [
    { id: undefined, label: NO_CATEGORY_LABEL },
    ...categories.map((category) => ({ id: category.id, label: category.name })),
  ];

  return (
    <View style={styles.container} testID="service-form-category">
      <AppText variant="control" style={styles.title}>
        Catégorie
      </AppText>
      <View accessibilityLabel="Catégorie" accessibilityRole="radiogroup" style={styles.chips}>
        {chips.map((chip) => {
          const selected = chip.id === value;
          return (
            <Pressable
              accessibilityLabel={chip.id === undefined ? 'Aucune catégorie' : chip.label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              hitSlop={chipHitSlop}
              key={chip.id ?? 'none'}
              onPress={() => choose(chip.id)}
              style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
              testID={`service-category-chip-${chip.id ?? 'none'}`}
            >
              <AppText
                numberOfLines={1}
                style={selected ? styles.chipTextSelected : styles.chipText}
                variant="control"
              >
                {chip.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {categories.length === 0 && (
        <AppText style={styles.hint} testID="service-form-category-hint" variant="metadata">
          {NO_CATEGORIES_HINT}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { color: semanticColors.foreground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: chipHeight,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: spacing.base,
  },
  chipSelected: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.accent,
    borderWidth: 1.5,
  },
  chipText: { color: semanticColors.foreground },
  chipTextSelected: { color: semanticColors.accent },
  hint: { color: foregroundSoft },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});
