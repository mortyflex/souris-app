// BeautIzzy — password field with a native visibility toggle
//
// Hidden by default; the trailing eye shows or hides it without touching the
// value, the focus or the autofill hints. On iOS a secure field empties itself
// on the first keystroke after it is hidden again or refocused: that first
// change is read through `readSecureEntryChange`, so nothing typed is lost.

import { SymbolView } from 'expo-symbols';
import { useRef, useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, type TextInput } from 'react-native';

import { TextField } from '@/shared/ui/TextField';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  ARMED_SECURE_ENTRY_WATCH,
  IDLE_SECURE_ENTRY_WATCH,
  readSecureEntryChange,
  type SecureEntryWatch,
} from '../secure-entry';

interface PasswordFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly error?: string;
  /** `new` = account creation (password managers offer to save). */
  readonly intent: 'new' | 'current';
  readonly onSubmitEditing?: () => void;
  readonly inputRef?: Ref<TextInput>;
  readonly editable?: boolean;
  /** Defaults to « Mot de passe »; also the accessibility label. */
  readonly label?: string;
  readonly testID?: string;
}

export function PasswordField({
  value,
  onChangeText,
  error,
  intent,
  onSubmitEditing,
  inputRef,
  editable = true,
  label = 'Mot de passe',
  testID = 'password-input',
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  // Watches for iOS emptying the masked field (secure-entry.ts). Never armed on Android.
  const watch = useRef<SecureEntryWatch>(IDLE_SECURE_ENTRY_WATCH);
  const arm = () => {
    watch.current = Platform.OS === 'ios' ? ARMED_SECURE_ENTRY_WATCH : IDLE_SECURE_ENTRY_WATCH;
  };

  const toggleVisibility = () => {
    if (visible) arm();
    else watch.current = IDLE_SECURE_ENTRY_WATCH;
    setVisible(!visible);
  };

  const handleFocus = () => {
    if (!visible) arm();
  };

  const handleChangeText = (text: string) => {
    if (visible) {
      watch.current = IDLE_SECURE_ENTRY_WATCH;
      onChangeText(text);
      return;
    }
    const reading = readSecureEntryChange(watch.current, value, text);
    watch.current = reading.watch;
    onChangeText(reading.value);
  };

  return (
    <TextField
      accessibilityLabel={label}
      placement="page"
      autoCapitalize="none"
      autoComplete={intent === 'new' ? 'new-password' : 'password'}
      editable={editable}
      error={error}
      inputRef={inputRef}
      label={label}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
      onSubmitEditing={onSubmitEditing}
      placeholder={intent === 'new' ? '8 caractères minimum' : 'Votre mot de passe'}
      returnKeyType="done"
      secureTextEntry={!visible}
      testID={testID}
      textContentType={intent === 'new' ? 'newPassword' : 'password'}
      trailingAccessory={
        <Pressable
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={toggleVisibility}
          testID={`${testID}-visibility`}
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        >
          <SymbolView
            name={visible ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
            size={18}
            tintColor={semanticColors.foregroundSoft}
          />
        </Pressable>
      }
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignItems: 'center',
    borderRadius: radii.small,
    height: 32,
    justifyContent: 'center',
    marginRight: -spacing.xs,
    width: 32,
  },
  togglePressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
});
