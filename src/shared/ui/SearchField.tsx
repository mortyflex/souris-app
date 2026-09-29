// Souris — Search field
//
// Subtle native search field: search symbol on the left, accent outline on
// focus, comfortable native height. Its idle fill follows `FieldPlacement`:
// white directly on the app background, `surfaceInput` on a sheet or card.

import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { FieldPlacement } from './TextField';
import { fontFamilies, foregroundSoft, radii, semanticColors, spacing, touchTarget } from './theme';

interface SearchFieldProps {
  readonly accessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** Optional generic trailing accessory (e.g. a scan action). */
  readonly trailingAccessory?: ReactNode;
  /** Idle fill context — `page` on the app background, `raised` (default) on a sheet or card. */
  readonly placement?: FieldPlacement;
  readonly testID?: string;
}

export function SearchField({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  trailingAccessory,
  placement = 'raised',
  testID,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

  return (
    <View
      style={[
        styles.field,
        placement === 'page' && styles.fieldOnPage,
        { minHeight: minimumHeight },
        focused && styles.fieldFocused,
      ]}
      testID={testID}
    >
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
    backgroundColor: semanticColors.surfaceInput,
    borderColor: semanticColors.surfaceInput,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fieldOnPage: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.surfaceElevated,
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
