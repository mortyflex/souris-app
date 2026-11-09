// BeautIzzy — the end of « Continuer avec Google » (sourisapp://auth-callback)
//
// The browser flow (SocialSignInButtons → AuthProvider.signInWithGoogle)
// normally receives Google's answer itself. This route covers the two ways
// the answer reaches the app as a deep link instead:
//
//   Android    the Custom Tab hands the redirect to the app: the router opens
//              this route WHILE the browser flow resolves. Both hand the same
//              code to the gateway, which runs ONE exchange and lets the
//              second caller join it;
//   cold start the app was killed while the browser was open: the code is
//              exchanged here, with the PKCE verifier this installation stored
//              before opening the browser.
//
// Each code is judged once per screen. A code already settled (the router
// replaying its last URL after a sign-out) is « nothing to do » and leads back
// to « Se connecter » — never a second sign-in. A refused consent is a
// cancellation, not an error. On success the root gate leaves the (auth)
// group: new account → Business setup, existing account → its Business.
// The code is never displayed, stored or logged.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { semanticColors, spacing } from '@/shared/ui/theme';

import type { AuthFailureCode } from './gateway';
import { formatAuthFailure } from './messages';
import type { OAuthCallback } from './oauth-callback';
import { useAuth } from './session/AuthProvider';

interface AuthCallbackScreenProps {
  readonly callback: OAuthCallback;
}

export function AuthCallbackScreen({ callback }: AuthCallbackScreenProps) {
  const router = useRouter();
  const { state, completeOAuthCallback } = useAuth();
  const [exchangeFailure, setExchangeFailure] = useState<{ readonly code: string; readonly failure: AuthFailureCode } | null>(
    null,
  );
  const handledCode = useRef<string | null>(null);

  const backToSignIn = () => router.replace('/sign-in');

  // A cancelled consent returns to « Se connecter » without a word.
  useEffect(() => {
    if (callback.kind === 'cancelled') router.replace('/sign-in');
  }, [callback.kind, router]);

  // Exchanged only once the stored session is known to be absent (a cold
  // start restores first), and each code once.
  useEffect(() => {
    if (callback.kind !== 'code' || state.status !== 'unauthenticated' || handledCode.current === callback.code) return;
    const { code } = callback;
    handledCode.current = code;
    void completeOAuthCallback(code).then((outcome) => {
      if (outcome.kind === 'cancelled') {
        router.replace('/sign-in');
      } else if (outcome.kind === 'failed') {
        haptics.warning();
        setExchangeFailure({ code, failure: outcome.failure.code });
      }
      // authenticated: the root gate takes over.
    });
  }, [callback, completeOAuthCallback, router, state.status]);

  const failure =
    callback.kind === 'failed'
      ? callback.failure.code
      : callback.kind === 'code' && exchangeFailure?.code === callback.code
        ? exchangeFailure.failure
        : null;

  if (failure !== null) {
    return (
      <OnboardingStepLayout
        brand
        brandSize="large"
        eyebrow="COMPTE"
        footer={<AppButton onPress={backToSignIn} testID="auth-callback-back" title="Retour à la connexion" />}
        subtitle={formatAuthFailure(failure)}
        testID="auth-callback-failed"
        title="Connexion impossible"
      />
    );
  }

  return (
    <OnboardingStepLayout brand brandSize="large" eyebrow="COMPTE" footer={null} testID="auth-callback-verifying" title="Connexion en cours…">
      <View style={styles.verifying}>
        <ActivityIndicator accessibilityLabel="Connexion en cours" color={semanticColors.accent} />
      </View>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  verifying: { alignItems: 'center', paddingVertical: spacing.xl },
});
