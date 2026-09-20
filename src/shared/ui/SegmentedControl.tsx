// Souris — SegmentedControl
//
// The ONE compact option switcher of Souris — Agenda Jour / Semaine, Caisse
// Jour / Mois: a light-glass capsule (GlassSurface, DESIGN_OVERRIDES.md §21)
// from the same family as the glass icon buttons and the native tab bar,
// slightly lighter than the circles since it covers more area. The selected
// option lets the glass read through: a whisper of accent, an accent hairline
// and a violet label, like the bar's selected tab; the others stay plainly
// readable navy-soft labels on the glass. Content-agnostic; labels stay
// feature-owned.
//
// The visible capsule is deliberately lower than the platform touch target;
// each option's vertical hitSlop gives the missing height back to the finger.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import { GlassSurface } from './GlassSurface';
import { gloss, interaction, nativeShadows, radii, semanticColors, touchTarget } from './theme';

export interface SegmentedControlOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentedControlOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly testID?: string;
}

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

/** Vertical touch slop that restores the platform touch target around an option. */
const optionTouchSlop = 4;
/** Visible height of an option: 36 pt on iOS, 40 dp on Android. */
export const segmentedControlOptionHeight = minimumTouchTarget - optionTouchSlop * 2;

const optionHitSlop = { bottom: optionTouchSlop, top: optionTouchSlop } as const;

export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<Value>) {
  return (
    <View accessibilityRole="tablist" style={styles.container} testID={testID}>
      <GlassSurface shape={styles.capsule} testID={testID ? `${testID}-glass` : undefined} />
      {options.map((option) => {
        const selected = option.value === value;
        const select = () => {
          if (!selected) haptics.selection();
          onChange(option.value);
        };
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={optionHitSlop}
            key={option.value}
            onPress={select}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressedOption,
              selected && styles.selectedOption,
            ]}
          >
            <AppText variant="control" style={[styles.label, selected ? styles.selectedText : styles.unselectedText]}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    ...nativeShadows.glassCapsule,
  },
  // Same material as the glass circles, lightened for the capsule's wider area.
  capsule: {
    backgroundColor: gloss.glass.fillCapsule,
    borderColor: gloss.glass.borderCapsule,
    borderRadius: radii.pill,
  },
  option: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: segmentedControlOptionHeight,
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 10,
  },
  selectedOption: {
    backgroundColor: gloss.glass.selectedFill,
    borderColor: gloss.glass.selectedBorder,
  },
  pressedOption: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  // The control role, one step smaller so the capsule stays light.
  label: { fontSize: 15 },
  selectedText: { color: semanticColors.accent },
  unselectedText: { color: semanticColors.foregroundSoft },
});
