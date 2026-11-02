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
import { useFormScrollView } from '@/shared/ui/FormScrollView';
import { fontFamilies, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

/**
 * Where a field sits, which decides its idle fill (DESIGN_OVERRIDES.md §39):
 *   `raised` (default) — on a sheet or inside a white card: `surfaceInput`, a
 *                        lavender near-white that reads on both;
 *   `page`             — directly on the app background (`screen`): white
 *                        (`surfaceElevated`), since `surfaceInput` is too close
 *                        to the page there.
 */
export type FieldPlacement = 'page' | 'raised';

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
  /** Called after the field took focus (its own focus styling still applies). */
  readonly onFocus?: () => void;
  /** `submit` keeps the keyboard up so the next field can take focus. */
  readonly submitBehavior?: TextInputProps['submitBehavior'];
  readonly editable?: boolean;
  /**
   * Free multiline text (notes): Return inserts a line break, the field grows
   * with its content instead of scrolling inside the form, and autocorrect is
   * on because it is prose rather than an identifier.
   */
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly inputRef?: Ref<TextInput>;
  /** Idle fill context — see `FieldPlacement`. */
  readonly placement?: FieldPlacement;
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
  onFocus,
  submitBehavior,
  editable = true,
  multiline = false,
  maxLength,
  inputRef,
  placement = 'raised',
  testID,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  // Inside a FormScrollView, taking focus keeps the field visible above the keyboard.
  const formScroll = useFormScrollView();

  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputShell,
          placement === 'page' && styles.inputShellOnPage,
          multiline && styles.inputShellMultiline,
          focused && styles.inputFocused,
          error && styles.inputInvalid,
        ]}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={multiline}
          autoFocus={autoFocus}
          editable={editable}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            formScroll?.revealFocusedInput();
            onFocus?.();
          }}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={semanticColors.foregroundMuted}
          ref={inputRef}
          returnKeyType={returnKeyType}
          scrollEnabled={!multiline}
          secureTextEntry={secureTextEntry}
          style={[styles.input, multiline && styles.inputMultiline]}
          submitBehavior={submitBehavior}
          testID={testID}
          textAlignVertical={multiline ? 'top' : undefined}
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
        <AppText variant="metadata" style={[styles.error, placement === 'page' && styles.errorOnPage]}>
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
    backgroundColor: semanticColors.surfaceInput,
    borderColor: semanticColors.surfaceInput,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  inputShellOnPage: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.surfaceElevated,
  },
  inputShellMultiline: { alignItems: 'flex-start' },
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
  inputMultiline: {
    lineHeight: 22,
    minHeight: 96,
    paddingVertical: spacing.md,
  },
  suffix: { color: semanticColors.foregroundSoft, marginLeft: spacing.sm },
  error: { color: rose.rose600 },
  // rose600 falls to ~4.3:1 on `screen`: the darker rose keeps small error text readable.
  errorOnPage: { color: rose.rose700 },
});
