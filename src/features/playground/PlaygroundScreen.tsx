// BeautIzzy — Playground développeur (development ONLY)
//
// The landing of the internal development utility that previews the
// onboarding of every profession — the announced ones included — without an
// account, a network request or a single write. It reuses the first-run
// frame and the real profession cards, so the preview is judged in the
// product's own clothes, and says plainly what it is: « Mode démonstration »,
// an internal tool, nothing created.
//
// Reached from Discovery (« Playground développeur ») when, and only when,
// the Playground is available (availability.ts); this screen re-checks the
// same rule and renders nothing otherwise. The chosen profession is handed to
// the preview route; selecting another one later starts a NEW preview with
// fresh state — nothing is kept between two scenarios.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BusinessActivityType } from '@/domain/business';
import { formatBusinessActivityType } from '@/features/business/presentation';
import { ActivityOptionList } from '@/features/business/setup/components/ActivityOptionList';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { isPlaygroundAvailable } from './availability';

/** The discreet, explicit mention carried by every Playground surface. */
export const PLAYGROUND_MODE_LABEL = 'Mode démonstration';
export const PLAYGROUND_TITLE = 'Playground développeur';

export function PlaygroundScreen() {
  const router = useRouter();
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

  const chosen = activityType === null ? undefined : formatBusinessActivityType(activityType);

  return (
    <OnboardingStepLayout
      eyebrow={PLAYGROUND_MODE_LABEL}
      footer={
        <AppButton
          disabled={activityType === null}
          onPress={preview}
          testID="playground-preview-onboarding"
          title={chosen === undefined ? 'Prévisualiser l’onboarding' : `Prévisualiser l’onboarding ${chosen}`}
        />
      }
      onBack={leave}
      subtitle="Parcourez l’onboarding de chaque activité, sans compte et sans rien enregistrer."
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
        accessibilityLabel="Outil interne de développement. Aucun compte, aucune activité ni aucune donnée n’est créée ; rien n’est synchronisé."
        style={styles.notice}
        testID="playground-notice"
      >
        <AppText style={styles.noticeTitle} variant="control">
          Outil interne de développement
        </AppText>
        <AppText style={styles.noticeBody} variant="metadata">
          Build de développement sur Supabase Staging. Aucun compte, aucune activité ni aucune donnée n’est
          créée ; rien n’est synchronisé.
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
