// BeautIzzy — email confirmation pending
//
// Shown when Supabase requires the email link before issuing a session. It
// states what happened and offers the way back to sign-in; the resend action
// is restrained and reports its own outcome. No token handling: the link
// confirms the address in the browser, returns to the app on the sign-in
// screen (sourisapp://sign-in), and the owner signs in normally. Drawn in
// the same first-run frame as the account forms, without the celebration
// master of sign-up: the large editorial brand mark anchors the screen and
// the lavender notice carries the envelope glyph and the address.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { rose, semanticColors } from '@/shared/ui/theme';

import { EmailSentNotice } from './components/EmailSentNotice';
import { formatAuthFailure } from './messages';
import { useAuth } from './session/AuthProvider';

interface VerifyEmailScreenProps {
  readonly email: string;
}

export function VerifyEmailScreen({ email }: VerifyEmailScreenProps) {
  const router = useRouter();
  const { resendSignUpConfirmation } = useAuth();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<{ readonly text: string; readonly tone: 'info' | 'error' } | null>(null);

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setNotice(null);
    const outcome = await resendSignUpConfirmation(email);
    setResending(false);
    setNotice(
      outcome.kind === 'sent'
        ? { text: 'Email renvoyé.', tone: 'info' }
        : { text: formatAuthFailure(outcome.failure.code), tone: 'error' },
    );
  };

  return (
    <OnboardingStepLayout
      brand
      brandSize="large"
      eyebrow="COMPTE"
      footer={
        <>
          <AppButton
            onPress={() => router.replace('/sign-in')}
            testID="back-to-sign-in"
            title="Retour à la connexion"
          />
          <AppButton
            disabled={resending}
            onPress={() => void resend()}
            title={resending ? 'Envoi…' : 'Renvoyer l’email'}
            variant="tertiary"
          />
        </>
      }
      subtitle="Ouvrez le lien pour confirmer votre adresse, puis connectez-vous."
      testID="verify-email-screen"
      // A no-break space keeps the sparkle with « mail » on a narrow phone.
      title={'Vérifiez votre boîte mail\u00a0✨'}
    >
      <EmailSentNotice email={email} emailTestID="verify-email-address" lead="Nous vous avons envoyé un lien à" />
      {notice && (
        <AppText
          variant="metadata"
          style={notice.tone === 'error' ? styles.error : styles.info}
          accessibilityLiveRegion="polite"
        >
          {notice.text}
        </AppText>
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  info: { color: semanticColors.foregroundSoft },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  error: { color: rose.rose700 },
});
