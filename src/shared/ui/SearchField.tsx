// Souris — Search field
//
// Subtle native search field: Souris surface, search symbol on the left,
// white background + accent outline on focus, comfortable native height.

import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { fontFamilies, foregroundSoft, radii, semanticColors, spacing, touchTarget } from './theme';

interface SearchFieldProps {
  readonly accessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** Optional generic trailing accessory (e.g. a scan action). */
  readonly trailingAccessory?: ReactNode;
}

export function SearchField({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  trailingAccessory,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

  return (
    <View style={[styles.field, { minHeight: minimumHeight }, focused && styles.fieldFocused]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search' }}
        size={14}
        tintColor={foregroundSoft}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={foregroundSoft}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {trailingAccessory}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fieldFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  input: {
    color: semanticColors.foreground,
    flex: 1,
    fontFamily: fontFamilies['400'],
    fontSize: 15,
  },
});
