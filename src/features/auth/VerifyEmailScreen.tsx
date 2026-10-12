// BeautIzzy — email confirmation pending
//
// Shown when Supabase requires the email link before issuing a session. It
// states what happened and offers the way back to sign-in; the resend action
// is restrained and reports its own outcome. No token handling: the link
// confirms the address in the browser, returns to the app on the sign-in
// screen (sourisapp://sign-in), and the owner signs in normally. Drawn in
// the same first-run frame as Welcome and the account forms.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { welcomeIllustration } from './illustrations';
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
      eyebrow="COMPTE"
      illustration={welcomeIllustration}
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
      topBarBrand
    >
      <View
        accessible
        accessibilityLabel={`Nous vous avons envoyé un lien à ${email}`}
        style={styles.notice}
      >
        <View style={styles.glyph}>
          <SymbolView
            name={{ ios: 'envelope', android: 'mail' }}
            size={20}
            tintColor={semanticColors.accent}
          />
        </View>
        <View style={styles.noticeCopy}>
          <AppText variant="metadata" style={styles.copy}>
            Nous vous avons envoyé un lien à
          </AppText>
          <AppText variant="rowTitle" testID="verify-email-address">
            {email}
          </AppText>
        </View>
      </View>
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
  // The same calm lavender notice as the setup steps: nothing went wrong.
  notice: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  noticeCopy: { flex: 1, gap: 2, minWidth: 0 },
  copy: { color: semanticColors.foregroundSoft },
  info: { color: semanticColors.foregroundSoft },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  error: { color: rose.rose700 },
});
