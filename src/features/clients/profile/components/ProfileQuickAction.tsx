// BeautIzzy — Client Profile quick action
//
// One compact tile of the profile's action row: an accent glyph in a quiet
// lavender disc beside a navy label, on a white card. Tiles share the row
// equally and carry the same weight — there is no primary / secondary pair.
// Pressing only reports; behaviour stays with the profile.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { fontFamilies, interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface ProfileQuickActionProps {
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly testID: string;
}

export function ProfileQuickAction({ label, icon, onPress, testID }: ProfileQuickActionProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      testID={testID}
    >
      <View style={styles.glyph}>
        <SymbolView name={icon} size={18} tintColor={semanticColors.accent} />
      </View>
      <AppText variant="metadata" numberOfLines={2} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tilePressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  label: { color: semanticColors.foreground, flex: 1, fontFamily: fontFamilies['600'] },
});
