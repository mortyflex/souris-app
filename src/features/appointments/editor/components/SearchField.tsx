// Souris — Search field (Appointment service editor)
//
// Subtle native search field: Souris surface, search symbol on the left,
// white background + accent outline on focus, comfortable native height.

import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { foregroundSoft, radii, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

interface SearchFieldProps {
  readonly accessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

export function SearchField({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
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
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
});
