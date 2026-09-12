// Souris — DEVICE_ACCOUNT_CONFLICT
//
// The local database already belongs to another account. V1 keeps ONE
// Business per device: nothing from that Business is shown, rebound, or
// wiped. The only way out is signing out and using the original account (or
// another device) until Cloud Sync makes multi-account restoration safe.

import { AccountStateScreen } from '@/features/auth/components/AccountStateScreen';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { AppButton } from '@/shared/ui/AppButton';

export function AccountConflictScreen() {
  const { signOut } = useAuth();

  return (
    <AccountStateScreen
      actions={<AppButton onPress={() => void signOut()} title="Se déconnecter" variant="secondary" />}
      message="Les données Souris enregistrées sur cet appareil appartiennent à un autre compte. Pour les protéger, elles ne sont pas affichées. Reconnectez-vous avec le compte d’origine, ou utilisez un autre appareil."
      testID="account-conflict-screen"
      title="Cet appareil est lié à un autre compte"
    />
  );
}
