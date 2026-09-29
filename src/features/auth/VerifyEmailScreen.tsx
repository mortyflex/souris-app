// Souris — email confirmation pending
//
// Shown when Supabase requires the email link before issuing a session. It
// states what happened and offers the way back to sign-in; the resend action
// is restrained and reports its own outcome. No token handling: the link
// confirms the address in the browser, returns to the app on the sign-in
// screen (sourisapp://sign-in), and the owner signs in normally.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { rose, semanticColors, spacing } from '@/shared/ui/theme';

import { AuthScreenLayout } from './components/AuthScreenLayout';
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
    <AuthScreenLayout
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
      title="Vérifiez votre boîte mail"
    >
      <AppText variant="body" style={styles.copy}>
        Nous vous avons envoyé un lien à
      </AppText>
      <AppText variant="rowTitle" testID="verify-email-address">
        {email}
      </AppText>
      {notice && (
        <AppText
          variant="metadata"
          style={notice.tone === 'error' ? styles.error : styles.info}
          accessibilityLiveRegion="polite"
        >
          {notice.text}
        </AppText>
      )}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  copy: { color: semanticColors.foregroundSoft },
  info: { color: semanticColors.foregroundSoft, paddingTop: spacing.sm },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  error: { color: rose.rose700, paddingTop: spacing.sm },
});
