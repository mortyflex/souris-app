// Souris — KeyboardDismissAccessory
//
// The « OK » of a numeric keyboard. The iOS decimal / number pad has no return
// key; React Native's own accessory for it is a full-width system toolbar.
// This one keeps the native mechanism (`InputAccessoryView`, attached to the
// keyboard by iOS) but only draws a compact lavender pill on the right, on
// the sheet's own overlay material — so the strip reads as the bottom edge of
// the active sheet and never uncovers what lies beneath it.
//
// It ONLY dismisses the keyboard: the typed value stays, nothing is submitted.
// An input opts in with `inputAccessoryViewID={nativeID}`. iOS binds one
// accessory to ONE input (the first carrying that id, once, at mount): every
// input renders its own instance with its own id — same component, same look.
// Android numeric keyboards carry their own completion key: nothing is
// rendered there.

import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { gutter, interaction, overlayMaterial, radii, semanticColors, spacing, touchTarget } from './theme';

interface KeyboardDismissAccessoryProps {
  /** The `inputAccessoryViewID` of the ONE input it serves. */
  readonly nativeID: string;
  readonly testID?: string;
}

export function KeyboardDismissAccessory({ nativeID, testID = 'keyboard-dismiss' }: KeyboardDismissAccessoryProps) {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView backgroundColor={overlayMaterial.surface} nativeID={nativeID}>
      <View style={styles.bar}>
        <Pressable
          accessibilityLabel="Fermer le clavier"
          accessibilityRole="button"
          onPress={() => Keyboard.dismiss()}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          testID={testID}
        >
          <AppText variant="control" style={styles.label}>
            OK
          </AppText>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'flex-end',
    paddingHorizontal: gutter.ios,
    paddingVertical: spacing.xs,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    minWidth: 64,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: interaction.pressedOpacity },
  label: { color: semanticColors.brandForeground },
});
