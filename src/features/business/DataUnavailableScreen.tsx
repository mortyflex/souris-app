// Souris — the data of this account could not be fetched yet
//
// Shown INSTEAD of the application on a device that holds no data while Souris
// could not establish what the account already holds (first launch after a
// sign-in, a reinstall, a new phone — offline or on a failing network).
// Opening an empty application there would let the user create a first record
// on top of data that simply has not arrived yet.
//
// Plain product wording only: nothing here names the mechanism behind it.
// Retrying is also automatic (return to the foreground, periodic check); the
// button is the same attempt, on demand.

import { AccountStateScreen } from '@/features/auth/components/AccountStateScreen';
import { AppButton } from '@/shared/ui/AppButton';

interface DataUnavailableScreenProps {
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onSignOut: () => void;
}

export function DataUnavailableScreen({ retrying, onRetry, onSignOut }: DataUnavailableScreenProps) {
  return (
    <AccountStateScreen
      actions={
        <>
          <AppButton
            disabled={retrying}
            onPress={onRetry}
            testID="data-unavailable-retry"
            title={retrying ? 'Nouvelle tentative…' : 'Réessayer'}
          />
          <AppButton onPress={onSignOut} title="Se déconnecter" variant="tertiary" />
        </>
      }
      message="Vérifiez votre connexion internet, puis réessayez. Souris réessaie aussi automatiquement."
      testID="data-unavailable-screen"
      title="Impossible de récupérer vos données"
    />
  );
}
