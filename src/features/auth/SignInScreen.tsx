// Souris — Sign in (email + password)
//
// Wrong credentials, unconfirmed accounts, and network failures each get one
// concise sentence; the entered email survives every failure. Password
// recovery is intentionally absent in V1 (see docs/architecture/AUTH.md).

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { TextField } from '@/shared/ui/TextField';
import { rose, spacing } from '@/shared/ui/theme';

import { AuthScreenLayout } from './components/AuthScreenLayout';
import { PasswordField } from './components/PasswordField';
import {
  EMPTY_CREDENTIALS,
  hasCredentialErrors,
  normalizeEmail,
  validateCredentials,
  type CredentialFormValues,
} from './form';
import { formatAuthFailure } from './messages';
import { useAuth } from './session/AuthProvider';

export function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [values, setValues] = useState<CredentialFormValues>(EMPTY_CREDENTIALS);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const errors = attempted ? validateCredentials(values, 'sign-in') : {};

  const submit = async () => {
    if (submitting) return;
    setAttempted(true);
    setFailure(null);
    setUnconfirmedEmail(null);
    const nextErrors = validateCredentials(values, 'sign-in');
    if (hasCredentialErrors(nextErrors)) return;

    setSubmitting(true);
    const email = normalizeEmail(values.email);
    const outcome = await signIn({ email, password: values.password });
    setSubmitting(false);

    if (outcome.kind === 'authenticated') {
      haptics.success();
      return;
    }
    haptics.warning();
    setFailure(formatAuthFailure(outcome.failure.code));
    if (outcome.failure.code === 'EMAIL_NOT_CONFIRMED') setUnconfirmedEmail(email);
  };

  return (
    <AuthScreenLayout
      eyebrow="COMPTE"
      footer={
        <>
          <AppButton
            disabled={submitting}
            onPress={() => void submit()}
            testID="submit-sign-in"
            title={submitting ? 'Connexion…' : 'Se connecter'}
          />
          <AppButton
            disabled={submitting}
            onPress={() => router.replace('/sign-up')}
            title="Créer un compte"
            variant="tertiary"
          />
        </>
      }
      onBack={() => router.back()}
      testID="sign-in-screen"
      title="Se connecter"
    >
      <TextField
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        editable={!submitting}
        error={errors.email}
        keyboardType="email-address"
        label="Email"
        onChangeText={(email) => setValues((current) => ({ ...current, email }))}
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder="vous@exemple.fr"
        returnKeyType="next"
        submitBehavior="submit"
        testID="email-input"
        textContentType="emailAddress"
        value={values.email}
      />
      <PasswordField
        editable={!submitting}
        error={errors.password}
        inputRef={passwordRef}
        intent="current"
        onChangeText={(password) => setValues((current) => ({ ...current, password }))}
        onSubmitEditing={() => void submit()}
        value={values.password}
      />
      {failure && (
        <AppText variant="metadata" style={styles.failure} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
      {unconfirmedEmail && (
        <AppButton
          onPress={() =>
            router.push({ pathname: '/verify-email', params: { email: unconfirmedEmail } })
          }
          style={styles.inlineAction}
          title="Renvoyer l’email de confirmation"
          variant="secondary"
        />
      )}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  failure: { color: rose.rose600, paddingTop: spacing.xs },
  inlineAction: { alignSelf: 'flex-start', paddingHorizontal: spacing.base },
});
