// BeautIzzy — Sign up (email + password)
//
// Local validation avoids pointless round trips; Supabase remains the
// authority. A failure keeps the entered email and password. When the
// project requires email confirmation, the dedicated verify screen takes
// over — we never pretend the account is confirmed.

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { TextField } from '@/shared/ui/TextField';
import { rose, spacing } from '@/shared/ui/theme';

import { PasswordField } from './components/PasswordField';
import { SocialSignInButtons } from './components/SocialSignInButtons';
import {
  EMPTY_CREDENTIALS,
  hasCredentialErrors,
  normalizeEmail,
  validateCredentials,
  type CredentialFormValues,
} from './form';
import { welcomeIllustration } from './illustrations';
import { formatAuthFailure } from './messages';
import { useAuth } from './session/AuthProvider';

export function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [values, setValues] = useState<CredentialFormValues>(EMPTY_CREDENTIALS);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A Google / Apple attempt on its way: the email form waits.
  const [socialPending, setSocialPending] = useState(false);
  const busy = submitting || socialPending;
  const [failure, setFailure] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const errors = attempted ? validateCredentials(values, 'sign-up') : {};

  const submit = async () => {
    if (busy) return;
    setAttempted(true);
    setFailure(null);
    const nextErrors = validateCredentials(values, 'sign-up');
    if (hasCredentialErrors(nextErrors)) return;

    setSubmitting(true);
    const email = normalizeEmail(values.email);
    const outcome = await signUp({ email, password: values.password });
    setSubmitting(false);

    switch (outcome.kind) {
      case 'authenticated':
        haptics.success();
        return;
      case 'confirmation-required':
        router.push({ pathname: '/verify-email', params: { email: outcome.email } });
        return;
      case 'failed':
        haptics.warning();
        setFailure(formatAuthFailure(outcome.failure.code));
    }
  };

  return (
    <OnboardingStepLayout
      eyebrow="COMPTE"
      illustration={welcomeIllustration}
      footer={
        <>
          <AppButton
            disabled={busy}
            onPress={() => void submit()}
            testID="submit-sign-up"
            title={submitting ? 'Création du compte…' : 'Créer mon compte'}
          />
          <AppButton
            disabled={busy}
            onPress={() => router.replace('/sign-in')}
            title="J’ai déjà un compte"
            variant="tertiary"
          />
        </>
      }
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      subtitle="Quelques secondes suffisent pour commencer avec BeautIzzy."
      testID="sign-up-screen"
      title="Créons votre compte"
      topBarBrand
    >
      <SocialSignInButtons disabled={submitting} onPendingChange={setSocialPending} />
      <TextField
        accessibilityLabel="Email"
        placement="page"
        autoCapitalize="none"
        autoComplete="email"
        editable={!busy}
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
        editable={!busy}
        error={errors.password}
        inputRef={passwordRef}
        intent="new"
        onChangeText={(password) => setValues((current) => ({ ...current, password }))}
        onSubmitEditing={() => void submit()}
        value={values.password}
      />
      {failure && (
        <AppText variant="metadata" style={styles.failure} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700, paddingTop: spacing.xs },
});
