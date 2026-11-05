// BeautIzzy — Mot de passe oublié (request a recovery link)
//
// The professional types the email of their account; Supabase sends a link
// that returns to the app (sourisapp://reset-password) where the new
// password is chosen. The answer is the same whether or not an account
// exists for the address — the confirmation never tells. The link only works
// on this installation (PKCE), which the copy says plainly. Drawn in the same
// first-run frame as sign-in; the sent state reuses the lavender notice of
// the email confirmation.
//
// After a sent link (or a rate-limit refusal) the address waits a minute
// before another request: the action shows the live countdown and stays
// disabled. The wait is read from the expiry instant the AuthProvider keeps
// (password-reset-cooldown.ts), so leaving the screen, the background or a
// restart never shortens it.

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { TextField } from '@/shared/ui/TextField';
import { rose, semanticColors, spacing } from '@/shared/ui/theme';

import { EmailSentNotice } from './components/EmailSentNotice';
import { isPlausibleEmail, normalizeEmail } from './form';
import type { AuthFailureCode } from './gateway';
import { formatAuthFailure } from './messages';
import { useAuth } from './session/AuthProvider';
import { useCooldownSeconds } from './use-cooldown-seconds';

interface ForgotPasswordScreenProps {
  /** The email already typed on sign-in, if any. */
  readonly initialEmail?: string;
}

type Notice = { readonly text: string; readonly tone: 'info' | 'error' };

export function ForgotPasswordScreen({ initialEmail = '' }: ForgotPasswordScreenProps) {
  const router = useRouter();
  const { requestPasswordReset, passwordResetCooldownEndsAt } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** The cooldown of the address in play (typed, then sent to): survives a remount through the provider. */
  const [cooldownEndsAt, setCooldownEndsAt] = useState(() =>
    passwordResetCooldownEndsAt(normalizeEmail(initialEmail)),
  );
  const waitSeconds = useCooldownSeconds(cooldownEndsAt);
  const waiting = waitSeconds > 0;
  /** Synchronous: a second tap in the same frame sees it, before React re-renders. */
  const inFlight = useRef(false);

  const emailError = attempted ? validateEmail(email) : undefined;
  const backToSignIn = () => router.replace('/sign-in');

  const changeEmail = (value: string) => {
    setEmail(value);
    setCooldownEndsAt(passwordResetCooldownEndsAt(normalizeEmail(value)));
  };

  /** Undefined when a request is already on its way or the address is still waiting. */
  const send = async (target: string) => {
    if (inFlight.current || passwordResetCooldownEndsAt(target) !== undefined) return undefined;
    inFlight.current = true;
    setSending(true);
    setNotice(null);
    try {
      return await requestPasswordReset(target);
    } finally {
      inFlight.current = false;
      setSending(false);
      setCooldownEndsAt(passwordResetCooldownEndsAt(target));
    }
  };

  const submit = async () => {
    if (inFlight.current) return;
    setAttempted(true);
    if (validateEmail(email) !== undefined) return;

    const target = normalizeEmail(email);
    // The keyboard's « Envoyer » bypasses the disabled button: same answer, no request.
    if (passwordResetCooldownEndsAt(target) !== undefined) {
      setCooldownEndsAt(passwordResetCooldownEndsAt(target));
      setNotice({ text: formatResetFailure('RATE_LIMITED'), tone: 'error' });
      return;
    }
    const outcome = await send(target);
    if (outcome === undefined) return;
    if (outcome.kind === 'sent') {
      haptics.success();
      setSentTo(target);
      return;
    }
    haptics.warning();
    setNotice({ text: formatResetFailure(outcome.failure.code), tone: 'error' });
  };

  const resend = async () => {
    if (sentTo === null) return;
    const outcome = await send(sentTo);
    if (outcome === undefined) return;
    setNotice(
      outcome.kind === 'sent'
        ? { text: 'Lien renvoyé.', tone: 'info' }
        : { text: formatResetFailure(outcome.failure.code), tone: 'error' },
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
              accessibilityLabel={waiting ? `Renvoyer le lien, disponible dans ${describeWait(waitSeconds)}` : undefined}
              disabled={sending || waiting}
              onPress={() => void resend()}
              testID="resend-reset-link"
              title={sending ? 'Envoi…' : withCountdown('Renvoyer le lien', waitSeconds)}
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
            accessibilityLabel={waiting ? `Recevoir le lien, disponible dans ${describeWait(waitSeconds)}` : undefined}
            disabled={sending || waiting}
            onPress={() => void submit()}
            testID="submit-forgot-password"
            title={sending ? 'Envoi…' : withCountdown('Recevoir le lien', waitSeconds)}
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
        onChangeText={changeEmail}
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

/** « Renvoyer le lien (42 s) » while the address waits, the plain action otherwise. */
function withCountdown(action: string, seconds: number): string {
  return seconds > 0 ? `${action} (${seconds} s)` : action;
}

function describeWait(seconds: number): string {
  return seconds === 1 ? '1 seconde' : `${seconds} secondes`;
}

/**
 * The request's own wording for a throttled or failed send; every other
 * refusal keeps the shared Auth sentence. Never says whether an account exists.
 */
function formatResetFailure(code: AuthFailureCode): string {
  switch (code) {
    case 'RATE_LIMITED':
      return 'Veuillez patienter avant de demander un nouveau lien.';
    case 'NETWORK':
    case 'UNKNOWN':
      return 'Impossible d’envoyer le lien pour le moment. Vérifiez votre connexion et réessayez.';
    default:
      return formatAuthFailure(code);
  }
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
