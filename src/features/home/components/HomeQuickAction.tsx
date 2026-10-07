// BeautIzzy — Accueil quick action
//
// One shortcut of the Accueil action row: a small white rounded square with
// an accent glyph, and a short navy label under it — lighter than a card, so
// the row never competes with the figures above. Four shortcuts share the
// row equally; the whole column is the button and the full action is spoken
// (`accessibilityLabel`). Pressing only reports — the flows opened are the
// existing ones.
//
// Every shortcut CREATES something. Where the system glyph already carries a
// plus (calendar.badge.plus, person.badge.plus) nothing is added; where it
// does not (the box, the bag), `plusBadge` sets the same small plus on the
// glyph's lower-right corner.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

const SURFACE_SIZE = 56;
const PLUS_BADGE_SIZE = 12;

interface HomeQuickActionProps {
  /** Short visible label: one word where possible. */
  readonly label: string;
  /** The full action, spoken. */
  readonly accessibilityLabel: string;
  readonly icon: SymbolViewProps['name'];
  /** Adds the small « + » to a glyph that has none of its own. */
  readonly plusBadge?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

export function HomeQuickAction({
  label,
  accessibilityLabel,
  icon,
  plusBadge = false,
  onPress,
  testID,
}: HomeQuickActionProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      testID={testID}
    >
      <View style={styles.surface} testID={`${testID}-surface`}>
        <View>
          <SymbolView name={icon} size={22} tintColor={semanticColors.accent} />
          {plusBadge && (
            <View style={styles.plusBadge} testID={`${testID}-plus`}>
              <SymbolView
                name={{ ios: 'plus.circle.fill', android: 'add_circle' }}
                size={PLUS_BADGE_SIZE}
                tintColor={semanticColors.accent}
              />
            </View>
          )}
        </View>
      </View>
      <AppText numberOfLines={1} variant="chip" style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flex: 1, gap: spacing.sm, minWidth: 0 },
  actionPressed: { opacity: interaction.pressedOpacity },
  surface: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    height: SURFACE_SIZE,
    justifyContent: 'center',
    width: SURFACE_SIZE,
  },
  // A white disc under the plus knocks it out of the glyph it overlaps, like
  // the system « badge » symbols.
  plusBadge: {
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    bottom: -4,
    padding: 1,
    position: 'absolute',
    right: -6,
  },
  label: { color: semanticColors.foreground, textAlign: 'center' },
});
