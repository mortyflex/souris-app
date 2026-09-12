// Souris — recoverable account state (Auth or Business resolution failed)

import { AccountStateScreen } from '@/features/auth/components/AccountStateScreen';
import { formatAuthFailure } from '@/features/auth/messages';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { AppButton } from '@/shared/ui/AppButton';

import { formatBusinessSessionFailure } from './messages';
import { useBusinessSession } from './session/BusinessSessionProvider';

export function AccountUnavailableScreen() {
  const auth = useAuth();
  const business = useBusinessSession();

  const message =
    auth.state.status === 'error'
      ? formatAuthFailure(auth.state.failure.code)
      : business.state.status === 'error'
        ? formatBusinessSessionFailure(business.state.failure.code)
        : 'Une erreur est survenue. Réessayez.';
  const retry = auth.state.status === 'error' ? auth.retry : business.retry;

  return (
    <AccountStateScreen
      actions={
        <>
          <AppButton onPress={retry} title="Réessayer" />
          {auth.state.status === 'authenticated' && (
            <AppButton onPress={() => void auth.signOut()} title="Se déconnecter" variant="tertiary" />
          )}
        </>
      }
      message={message}
      testID="account-unavailable-screen"
      title="Souris n’a pas pu ouvrir votre compte"
    />
  );
}
