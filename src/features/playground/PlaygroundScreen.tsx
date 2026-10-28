// BeautIzzy — Playground développeur (development ONLY)
//
// The landing of the internal development utility: for every profession —
// the announced ones included — either a preview of its onboarding (Step A)
// or an interactive exploration of the application on fictional in-memory
// data (Step B1), without an account, a network request or a single write
// outside memory. It reuses the first-run frame and the real profession
// cards, so each scenario is judged in the product's own clothes, and says
// plainly what it is: « Mode démonstration », an internal tool, nothing
// created.
//
// Reached from Discovery (« Playground développeur ») when, and only when,
// the Playground is available (availability.ts); this screen re-checks the
// same rule and renders nothing otherwise. The chosen profession is handed to
// the preview route, or starts a NEW demo session before the demo group is
// pushed; every entry is a fresh scenario — nothing is kept between two.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isProfessionId, type BusinessActivityType } from '@/domain/business';
import { formatBusinessActivityType } from '@/features/business/presentation';
import { ActivityOptionList } from '@/features/business/setup/components/ActivityOptionList';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { isPlaygroundAvailable } from './availability';
import { usePlaygroundDemoSession } from './demo/session';
import { PLAYGROUND_MODE_LABEL } from './mode-label';

export { PLAYGROUND_MODE_LABEL } from './mode-label';
export const PLAYGROUND_TITLE = 'Playground développeur';
export const EXPLORE_APP_TITLE = 'Explorer l’application';
export const PREVIEW_ONBOARDING_TITLE = 'Prévisualiser l’onboarding';
/** Where a demo starts: its Accueil, as the product does, inside the `(demo)` group of the signed-out stack. */
export const DEMO_ENTRY_HREF = '/(auth)/(demo)/(tabs)/accueil';

export function PlaygroundScreen() {
  const router = useRouter();
  const demo = usePlaygroundDemoSession();
  const [activityType, setActivityType] = useState<BusinessActivityType | null>(null);

  if (!isPlaygroundAvailable()) return null;

  const leave = () => {
    haptics.action();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const preview = () => {
    if (activityType === null) return;
    haptics.action();
    router.push(`/playground/${activityType}`);
  };

  // A NEW demo of the chosen profession: the session is started first, the
  // group is pushed next; its runtime mounts on the fresh scenario.
  const explore = () => {
    if (activityType === null || !isProfessionId(activityType)) return;
    haptics.action();
    demo.start(activityType);
    router.push(DEMO_ENTRY_HREF);
  };

  const chosen = activityType === null ? undefined : formatBusinessActivityType(activityType);

  return (
    <OnboardingStepLayout
      eyebrow={PLAYGROUND_MODE_LABEL}
      footer={
        <>
          <AppButton
            disabled={activityType === null}
            onPress={explore}
            testID="playground-explore-app"
            title={chosen === undefined ? EXPLORE_APP_TITLE : `${EXPLORE_APP_TITLE} ${chosen}`}
          />
          <AppButton
            disabled={activityType === null}
            onPress={preview}
            testID="playground-preview-onboarding"
            title={chosen === undefined ? PREVIEW_ONBOARDING_TITLE : `${PREVIEW_ONBOARDING_TITLE} ${chosen}`}
            variant="secondary"
          />
        </>
      }
      onBack={leave}
      subtitle="Explorez l’application ou parcourez l’onboarding de chaque activité, sans compte et sans rien enregistrer."
      testID="playground-screen"
      title={PLAYGROUND_TITLE}
    >
      <ActivityOptionList
        comingSoonSelectable
        onSelect={(next) => {
          haptics.selection();
          setActivityType(next);
        }}
        value={activityType}
      />
      <View
        accessible
        accessibilityLabel="Outil interne de développement. Aucun compte, aucune activité ni aucune donnée n’est créée ; rien n’est synchronisé. L’exploration utilise des données fictives, en mémoire seulement."
        style={styles.notice}
        testID="playground-notice"
      >
        <AppText style={styles.noticeTitle} variant="control">
          Outil interne de développement
        </AppText>
        <AppText style={styles.noticeBody} variant="metadata">
          Build de développement sur Supabase Staging. Aucun compte, aucune activité ni aucune donnée n’est
          créée ; rien n’est synchronisé. L’exploration utilise des données fictives, en mémoire seulement.
        </AppText>
      </View>
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  // The same calm informative notice as the onboarding steps: never a warning colour.
  notice: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  noticeTitle: { color: semanticColors.accent },
  noticeBody: { color: semanticColors.foregroundSoft },
});
