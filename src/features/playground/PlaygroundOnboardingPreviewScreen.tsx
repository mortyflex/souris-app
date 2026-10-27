// BeautIzzy — onboarding preview of one profession (development ONLY)
//
// The REAL five steps (`BusinessSetupFlow`), bound to in-memory actions
// (preview-actions.ts): the chosen profession is preselected — and still
// changeable, the announced ones included — the steps advance and go back
// exactly as the product's do, and the last step reads « Terminer l’aperçu »
// instead of entering an app. « Quitter » at the end of every top bar leaves
// at any moment. Every surface carries the « Mode démonstration » eyebrow.
//
// Nothing of the real application is touched: no session, no persistence,
// no gateway is read or written; the preview state is this component's and
// dies with it. The screen re-checks the availability rule and renders
// nothing when the Playground is unavailable.

import { useRouter } from 'expo-router';
import { useState } from 'react';

import type { ProfessionId } from '@/domain/business';
import { BusinessSetupFlow } from '@/features/business/setup/BusinessSetupScreen';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';

import { isPlaygroundAvailable } from './availability';
import { PLAYGROUND_MODE_LABEL } from './PlaygroundScreen';
import { createPreviewSetupActions } from './preview-actions';

export const FINISH_PREVIEW_TITLE = 'Terminer l’aperçu';

interface PlaygroundOnboardingPreviewScreenProps {
  readonly activityType: ProfessionId;
}

export function PlaygroundOnboardingPreviewScreen({ activityType }: PlaygroundOnboardingPreviewScreenProps) {
  const router = useRouter();

  // Back to the Playground landing — the preview unmounts, and its state with it.
  // `useRouter` returns the stable imperative router, so the closure never goes stale.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/playground');
  };

  // One set of in-memory actions per mounted preview: a new scenario is a new mount.
  const [actions] = useState(() => createPreviewSetupActions({ onFinish: leave }));

  if (!isPlaygroundAvailable()) return null;

  return (
    <BusinessSetupFlow
      actions={actions}
      activityAcceptance="every-profession"
      eyebrow={PLAYGROUND_MODE_LABEL}
      finishTitle={FINISH_PREVIEW_TITLE}
      initialActivityType={activityType}
      topBarEnd={
        <AppButton
          accessibilityLabel="Quitter l’aperçu"
          onPress={() => {
            haptics.action();
            leave();
          }}
          testID="playground-leave-preview"
          title="Quitter"
          variant="tertiary"
        />
      }
    />
  );
}
