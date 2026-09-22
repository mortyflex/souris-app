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
// An option may carry its own `selectedColor` when the options ARE a
// taxonomy (Services / Techniques, DESIGN_OVERRIDES.md §27): selected, it is
// filled with that colour and its label turns white — the caller passes a
// colour that holds white text at ≥ 4.5:1. `stretch` spreads the options over
// the full width. An option may also carry a `count`, drawn as a subtle pill
// after its label (Rendez-vous 20 | Produits achetés 8) and spoken with it;
// counts above 999 read `999+` so the capsule never breaks.
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
  /** Spoken label when the visible one is a bare symbol (`%`, `€`). */
  readonly accessibilityLabel?: string;
  /** Solid fill of the selected option (white label); defaults to the glass accent style. */
  readonly selectedColor?: string;
  /** Subtle count pill after the label, spoken with it. */
  readonly count?: number;
  readonly testID?: string;
}

interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentedControlOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** Spreads the options over the full available width. */
  readonly stretch?: boolean;
  readonly testID?: string;
}

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

/** Vertical touch slop that restores the platform touch target around an option. */
const optionTouchSlop = 4;
/** Visible height of an option: 36 pt on iOS, 40 dp on Android. */
export const segmentedControlOptionHeight = minimumTouchTarget - optionTouchSlop * 2;

const optionHitSlop = { bottom: optionTouchSlop, top: optionTouchSlop } as const;

const MAX_DISPLAYED_COUNT = 999;

/** `8`, `120`, `999+`. */
export function formatSegmentCount(count: number): string {
  return count > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : String(count);
}

export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  stretch = false,
  testID,
}: SegmentedControlProps<Value>) {
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, stretch && styles.stretchedContainer]}
      testID={testID}
    >
      <GlassSurface shape={styles.capsule} testID={testID ? `${testID}-glass` : undefined} />
      {options.map((option) => {
        const selected = option.value === value;
        const filled = selected && option.selectedColor !== undefined;
        const select = () => {
          if (!selected) haptics.selection();
          onChange(option.value);
        };
        const label = option.accessibilityLabel ?? option.label;
        return (
          <Pressable
            accessibilityLabel={option.count === undefined ? label : `${label}, ${option.count}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={optionHitSlop}
            key={option.value}
            onPress={select}
            style={({ pressed }) => [
              styles.option,
              stretch && styles.stretchedOption,
              pressed && styles.pressedOption,
              selected && styles.selectedOption,
              filled && { backgroundColor: option.selectedColor, borderColor: option.selectedColor },
            ]}
            testID={option.testID}
          >
            <AppText
              variant="control"
              numberOfLines={1}
              style={[
                styles.label,
                filled ? styles.filledText : selected ? styles.selectedText : styles.unselectedText,
              ]}
            >
              {option.label}
            </AppText>
            {option.count !== undefined && (
              <View style={[styles.countPill, selected && styles.selectedCountPill]}>
                <AppText
                  variant="chip"
                  style={[styles.countText, selected && styles.selectedCountText]}
                  testID={option.testID ? `${option.testID}-count` : undefined}
                >
                  {formatSegmentCount(option.count)}
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
  container: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    ...nativeShadows.glassCapsule,
  },
  stretchedContainer: { alignSelf: 'stretch' },
  stretchedOption: { flex: 1 },
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
    flexDirection: 'row',
    gap: 6,
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
  label: { flexShrink: 1, fontSize: 15 },
  countPill: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 20,
    minWidth: 22,
    paddingHorizontal: 6,
  },
  selectedCountPill: { backgroundColor: semanticColors.accent },
  countText: { color: semanticColors.accent, fontVariant: ['tabular-nums'] },
  selectedCountText: { color: semanticColors.surfaceElevated },
  selectedText: { color: semanticColors.accent },
  filledText: { color: semanticColors.surfaceElevated },
  unselectedText: { color: semanticColors.foregroundSoft },
});
