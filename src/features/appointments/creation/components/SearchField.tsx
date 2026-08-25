// Souris — Search field (Appointment Creation)
//
// Subtle native search field: Souris surface, search symbol on the left,
// white background + accent outline on focus, comfortable native height.

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, foregroundSoft, radii, spacing, touchTarget } from '@/shared/ui/theme';

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

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
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
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: radii.ios.default,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: touchTarget.ios,
    paddingHorizontal: spacing.md,
  },
  fieldFocused: {
    backgroundColor: colors.background,
    borderColor: colors.accent,
  },
  input: {
    color: colors.foreground,
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
});
