import { useState, type ReactNode, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { fontFamilies, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

interface TextFieldProps {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder: string;
  readonly error?: string;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly suffix?: string;
  readonly autoFocus?: boolean;
  /** Optional generic trailing accessory (e.g. a scan action or a visibility toggle). */
  readonly trailingAccessory?: ReactNode;
  readonly autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Native autofill hints (password managers, keyboard suggestions). */
  readonly autoComplete?: TextInputProps['autoComplete'];
  readonly textContentType?: TextInputProps['textContentType'];
  readonly secureTextEntry?: boolean;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly onSubmitEditing?: () => void;
  /** `submit` keeps the keyboard up so the next field can take focus. */
  readonly submitBehavior?: TextInputProps['submitBehavior'];
  readonly editable?: boolean;
  readonly inputRef?: Ref<TextInput>;
  readonly testID?: string;
}

export function TextField({
  accessibilityLabel,
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  suffix,
  autoFocus = false,
  trailingAccessory,
  autoCapitalize = 'sentences',
  autoComplete,
  textContentType,
  secureTextEntry = false,
  returnKeyType,
  onSubmitEditing,
  submitBehavior,
  editable = true,
  inputRef,
  testID,
}: TextFieldProps) {
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
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={editable}
          keyboardType={keyboardType}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={semanticColors.foregroundMuted}
          ref={inputRef}
          returnKeyType={returnKeyType}
          secureTextEntry={secureTextEntry}
          style={styles.input}
          submitBehavior={submitBehavior}
          testID={testID}
          textContentType={textContentType}
          value={value}
        />
        {suffix && (
          <AppText variant="control" style={styles.suffix}>
            {suffix}
          </AppText>
        )}
        {trailingAccessory}
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
    fontFamily: fontFamilies['400'],
    fontSize: 16,
    minHeight: 42,
    paddingVertical: 0,
  },
  suffix: { color: semanticColors.foregroundSoft, marginLeft: spacing.sm },
  error: { color: rose.rose600 },
});
