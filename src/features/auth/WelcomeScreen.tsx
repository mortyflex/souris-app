// BeautIzzy — Welcome, the ONE first-entry screen
//
// The first screen of a fresh install and the only Welcome of the whole
// first run: the brand mark, the approved hero illustration, one promise,
// « Commencer » (account creation) and « J’ai déjà un compte » (sign-in).
// Business setup, which follows authentication, starts directly at the
// primary activity — it never shows a second Welcome. No carousel, no
// marketing, no decoration beyond the illustration, which is drawn as
// supplied (`contain`) and hidden from assistive technology. The headline
// alone speaks in the brand violet (`semanticColors.accent`); the supporting
// line stays navy for readability.

import { useRouter } from 'expo-router';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';

import { welcomeIllustration } from './illustrations';

export function WelcomeScreen() {
  const router = useRouter();

  const start = () => {
    haptics.action();
    router.push('/sign-up');
  };
  const signIn = () => {
    haptics.action();
    router.push('/sign-in');
  };

  return (
    <OnboardingStepLayout
      align="center"
      brand
      footer={
        <>
          <AppButton onPress={start} testID="welcome-start" title="Commencer" />
          <AppButton onPress={signIn} testID="welcome-sign-in" title="J’ai déjà un compte" variant="tertiary" />
        </>
      }
      illustration={welcomeIllustration}
      illustrationSize="hero"
      subtitle="Rendez-vous, clientèle, produits et chiffres : tout ce qu’il faut pour gérer votre activité, simplement."
      testID="welcome-screen"
      title="Votre activité beauté, c’est easy."
      titleTone="accent"
    />
  );
}
