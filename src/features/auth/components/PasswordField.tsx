// Souris — password field with a native visibility toggle

import { SymbolView } from 'expo-symbols';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, type TextInput } from 'react-native';

import { TextField } from '@/shared/ui/TextField';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

interface PasswordFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly error?: string;
  /** `new` = account creation (password managers offer to save). */
  readonly intent: 'new' | 'current';
  readonly onSubmitEditing?: () => void;
  readonly inputRef?: Ref<TextInput>;
  readonly editable?: boolean;
}

export function PasswordField({
  value,
  onChangeText,
  error,
  intent,
  onSubmitEditing,
  inputRef,
  editable = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      accessibilityLabel="Mot de passe"
      autoCapitalize="none"
      autoComplete={intent === 'new' ? 'new-password' : 'password'}
      editable={editable}
      error={error}
      inputRef={inputRef}
      label="Mot de passe"
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      placeholder={intent === 'new' ? '8 caractères minimum' : 'Votre mot de passe'}
      returnKeyType="done"
      secureTextEntry={!visible}
      testID="password-input"
      textContentType={intent === 'new' ? 'newPassword' : 'password'}
      trailingAccessory={
        <Pressable
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => setVisible((current) => !current)}
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
