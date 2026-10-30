// BeautIzzy — Mot de passe oublié (request a recovery link)
//
// The professional types the email of their account; Supabase sends a link
// that returns to the app (sourisapp://reset-password) where the new
// password is chosen. The answer is the same whether or not an account
// exists for the address — the confirmation never tells. The link only works
// on this installation (PKCE), which the copy says plainly. Drawn in the same
// first-run frame as sign-in; the sent state reuses the lavender notice of
// the email confirmation.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { TextField } from '@/shared/ui/TextField';
import { rose, semanticColors, spacing } from '@/shared/ui/theme';

import { EmailSentNotice } from './components/EmailSentNotice';
import { isPlausibleEmail, normalizeEmail } from './form';
import { formatAuthFailure } from './messages';
import { useAuth } from './session/AuthProvider';

interface ForgotPasswordScreenProps {
  /** The email already typed on sign-in, if any. */
  readonly initialEmail?: string;
}

type Notice = { readonly text: string; readonly tone: 'info' | 'error' };

export function ForgotPasswordScreen({ initialEmail = '' }: ForgotPasswordScreenProps) {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const emailError = attempted ? validateEmail(email) : undefined;
  const backToSignIn = () => router.replace('/sign-in');

  const send = async (target: string) => {
    setSending(true);
    setNotice(null);
    const outcome = await requestPasswordReset(target);
    setSending(false);
    return outcome;
  };

  const submit = async () => {
    if (sending) return;
    setAttempted(true);
    if (validateEmail(email) !== undefined) return;

    const target = normalizeEmail(email);
    const outcome = await send(target);
    if (outcome.kind === 'sent') {
      haptics.success();
      setSentTo(target);
      return;
    }
    haptics.warning();
    setNotice({ text: formatAuthFailure(outcome.failure.code), tone: 'error' });
  };

  const resend = async () => {
    if (sending || sentTo === null) return;
    const outcome = await send(sentTo);
    setNotice(
      outcome.kind === 'sent'
        ? { text: 'Lien renvoyé.', tone: 'info' }
        : { text: formatAuthFailure(outcome.failure.code), tone: 'error' },
    );
  };

  const noticeText = notice && (
    <AppText
      variant="metadata"
      style={notice.tone === 'error' ? styles.error : styles.info}
      accessibilityLiveRegion="polite"
    >
      {notice.text}
    </AppText>
  );

  if (sentTo !== null) {
    return (
      <OnboardingStepLayout
        brand
        brandSize="large"
        eyebrow="MOT DE PASSE"
        footer={
          <>
            <AppButton onPress={backToSignIn} testID="back-to-sign-in" title="Retour à la connexion" />
            <AppButton
              disabled={sending}
              onPress={() => void resend()}
              testID="resend-reset-link"
              title={sending ? 'Envoi…' : 'Renvoyer le lien'}
              variant="tertiary"
            />
          </>
        }
        subtitle="Ouvrez-le sur ce téléphone pour choisir un nouveau mot de passe. Pensez à regarder dans les courriers indésirables."
        testID="forgot-password-sent"
        // A no-break space keeps the sparkle with « mail » on a narrow phone.
        title={'Vérifiez votre boîte mail ✨'}
      >
        <EmailSentNotice
          email={sentTo}
          emailTestID="forgot-password-address"
          lead="Si un compte existe pour cette adresse, un lien vient d’être envoyé à"
        />
        {noticeText}
      </OnboardingStepLayout>
    );
  }

  return (
    <OnboardingStepLayout
      brand
      brandSize="large"
      eyebrow="MOT DE PASSE"
      footer={
        <>
          <AppButton
            disabled={sending}
            onPress={() => void submit()}
            testID="submit-forgot-password"
            title={sending ? 'Envoi…' : 'Recevoir le lien'}
          />
          <AppButton disabled={sending} onPress={backToSignIn} title="Retour à la connexion" variant="tertiary" />
        </>
      }
      onBack={() => (router.canGoBack() ? router.back() : backToSignIn())}
      subtitle="Indiquez l’email de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe."
      testID="forgot-password-screen"
      title="Mot de passe oublié"
    >
      <TextField
        accessibilityLabel="Email"
        placement="page"
        autoCapitalize="none"
        autoComplete="email"
        editable={!sending}
        error={emailError}
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        onSubmitEditing={() => void submit()}
        placeholder="vous@exemple.fr"
        returnKeyType="send"
        testID="email-input"
        textContentType="emailAddress"
        value={email}
      />
      {noticeText}
    </OnboardingStepLayout>
  );
}

function validateEmail(value: string): string | undefined {
  const email = normalizeEmail(value);
  if (email.length === 0) return 'L’email est requis.';
  return isPlausibleEmail(email) ? undefined : 'Adresse email invalide.';
}

const styles = StyleSheet.create({
  info: { color: semanticColors.foregroundSoft, paddingTop: spacing.xs },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  error: { color: rose.rose700, paddingTop: spacing.xs },
});
