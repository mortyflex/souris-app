import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

interface ServiceTextFieldProps {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder: string;
  readonly error?: string;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly suffix?: string;
  readonly autoFocus?: boolean;
}

export function ServiceTextField({
  accessibilityLabel,
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  suffix,
  autoFocus = false,
}: ServiceTextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputShell,
          focused && styles.inputFocused,
          error && styles.inputInvalid,
        ]}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="sentences"
          autoCorrect={false}
          autoFocus={autoFocus}
          keyboardType={keyboardType}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={semanticColors.foregroundMuted}
          style={styles.input}
          value={value}
        />
        {suffix && (
          <AppText variant="control" style={styles.suffix}>
            {suffix}
          </AppText>
        )}
      </View>
      {error && (
        <AppText variant="metadata" style={styles.error}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: semanticColors.foregroundSoft },
  inputShell: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  inputFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  inputInvalid: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  input: {
    color: semanticColors.foreground,
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    minHeight: 42,
    paddingVertical: 0,
  },
  suffix: { color: semanticColors.foregroundSoft, marginLeft: spacing.sm },
  error: { color: rose.rose600 },
});
