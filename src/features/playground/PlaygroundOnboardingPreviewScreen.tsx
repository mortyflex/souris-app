// BeautIzzy — onboarding preview of one profession (development ONLY)
//
// The REAL five steps (`BusinessSetupFlow`), bound to in-memory actions
// (preview-actions.ts): the chosen profession is preselected — and still
// changeable, the announced ones included — the steps advance and go back
// exactly as the product's do. The last step is the product's own: the
// preparation interlude, the recap, the optional client import card and its
// two actions. Either action continues the first-time experience in a
// FIRST-USE demo (demo/scenarios/first-use.ts): a new in-memory Business
// carrying the name typed and the starters kept here, at 0 €, whose Accueil
// shows « Premiers pas avec BeautIzzy » — and, after « Importer ma
// clientèle », opens the real import flow over it, on that demo's memory.
// « Quitter » at the end of every top bar leaves at any moment. Every
// surface carries the « Mode démonstration » eyebrow.
//
// Nothing of the real application is touched: no session, no persistence,
// no gateway is read or written; the preview state is this component's and
// dies with it, and the demo lives in its own in-memory database. The screen
// re-checks the availability rule and renders nothing when the Playground
// is unavailable.

import { useRouter } from 'expo-router';
import { useState } from 'react';

import { isProfessionId, type ProfessionId } from '@/domain/business';
import { BusinessSetupFlow } from '@/features/business/setup/BusinessSetupScreen';
import { requestFirstArrival } from '@/features/home/first-steps/arrival';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';

import { isPlaygroundAvailable } from './availability';
import { usePlaygroundDemoSession } from './demo/session';
import { DEMO_ENTRY_HREF, PLAYGROUND_MODE_LABEL } from './PlaygroundScreen';
import { createPreviewSetupActions, type PreviewFinish } from './preview-actions';

interface PlaygroundOnboardingPreviewScreenProps {
  readonly activityType: ProfessionId;
}

export function PlaygroundOnboardingPreviewScreen({ activityType }: PlaygroundOnboardingPreviewScreenProps) {
  const router = useRouter();
  const demo = usePlaygroundDemoSession();

  // Back to the Playground landing — the preview unmounts, and its state with it.
  // `useRouter` returns the stable imperative router, so the closure never goes stale.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/playground');
  };

  // The product's last step ends here: the first-use demo of the Business
  // just « created », in a fresh in-memory runtime, replacing the preview.
  const continueInFirstUseDemo = ({ business, keptStarterKeys, importClients }: PreviewFinish) => {
    if (!isProfessionId(business.activityType)) {
      leave();
      return;
    }
    demo.start(business.activityType, {
      stage: 'just-onboarded',
      origin: {
        businessName: business.name,
        ownerFirstName: business.ownerFirstName,
        ownerLastName: business.ownerLastName,
        keptStarterKeys,
      },
    });
    // The demo's Accueil consumes it and opens the import over itself, as the product's does.
    if (importClients) requestFirstArrival('client-import');
    router.replace(DEMO_ENTRY_HREF);
  };

  // One set of in-memory actions per mounted preview: a new scenario is a new mount.
  const [actions] = useState(() => createPreviewSetupActions({ onFinish: continueInFirstUseDemo }));

  if (!isPlaygroundAvailable()) return null;

  return (
    <BusinessSetupFlow
      actions={actions}
      activityAcceptance="every-profession"
      eyebrow={PLAYGROUND_MODE_LABEL}
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
