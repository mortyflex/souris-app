// BeautIzzy — DEVICE_ACCOUNT_CONFLICT: the device belongs to another account
//
// The local database is bound to account A; account B just signed in. Nothing
// of A is shown, rebound or uploaded (AUTH.md §6). Two ways out, both explicit:
//
//   « Se déconnecter »                         always: A signs back in here and
//                                              finds everything, pending changes
//                                              included
//   « Utiliser cet appareil avec mon compte »  ONLY when everything A holds on
//                                              this device was acknowledged by
//                                              the remote (persistence/
//                                              account-handover.ts) → one
//                                              confirmation → the device is
//                                              released (A's rows, bookkeeping,
//                                              binding and owned images removed
//                                              in one go) and the tree remounts
//                                              on an EMPTY, UNBOUND database:
//                                              B binds and restores exactly like
//                                              a fresh install
//
// While A still holds something unsent — a change, a deletion, a refused
// write, a row never uploaded, a device-only photo — no hand-over is offered:
// the only way is A signing in again here, which sends it. Nothing is removed
// before the confirmation, nothing automatically, and a run of the sync
// worker still in flight for A is awaited before the release (`whenIdle`).
//
// Wording: plain product French (« envoyées », « récupérées »); no mechanism
// is named. The local state is read when the screen mounts and again after a
// refused attempt; it is never cached anywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AccountStateScreen } from '@/features/auth/components/AccountStateScreen';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { assessLocalAccountData, hasUnsentLocalData } from '@/persistence/account-handover';
import type { SourisDatabase } from '@/persistence/database';
import { useCloudSyncControl } from '@/providers/CloudSyncControl';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { rose } from '@/shared/ui/theme';

import { useBusinessSession } from './session/BusinessSessionProvider';

export const ACCOUNT_CONFLICT_TITLE = 'Cet appareil est lié à un autre compte';

/** Everything the other account holds here was sent: the hand-over may be offered. */
export const ACCOUNT_CONFLICT_HANDOVER_MESSAGE =
  'Les données BeautIzzy enregistrées sur cet appareil appartiennent à un autre compte et ne sont pas affichées. Elles ont toutes été envoyées : vous pouvez préparer cet appareil pour votre compte. Les données de l’autre compte seront retirées de cet appareil et resteront disponibles en se reconnectant avec lui.';

/** Something of the other account exists on this device only: no hand-over. */
export const ACCOUNT_CONFLICT_UNSENT_MESSAGE =
  'Les données BeautIzzy enregistrées sur cet appareil appartiennent à un autre compte et ne sont pas affichées. Certaines d’entre elles n’existent pour l’instant que sur cet appareil : pour ne rien perdre, reconnectez-vous d’abord avec ce compte sur cet appareil, le temps qu’elles soient envoyées. Vous pourrez ensuite préparer cet appareil pour votre compte.';

/** The local state could not be read: the original behaviour, sign-out only. */
export const ACCOUNT_CONFLICT_UNAVAILABLE_MESSAGE =
  'Les données BeautIzzy enregistrées sur cet appareil appartiennent à un autre compte. Pour les protéger, elles ne sont pas affichées. Reconnectez-vous avec le compte d’origine, ou utilisez un autre appareil.';

export const ACCOUNT_CONFLICT_HANDOVER_ACTION = 'Utiliser cet appareil avec mon compte';
export const ACCOUNT_CONFLICT_DIALOG_TITLE = 'Préparer cet appareil ?';
export const ACCOUNT_CONFLICT_DIALOG_BODY =
  'Les données de l’autre compte seront retirées de cet appareil. Elles restent enregistrées sur son compte. Vos données seront ensuite récupérées.';
export const ACCOUNT_CONFLICT_DIALOG_CONFIRM = 'Préparer cet appareil';
export const ACCOUNT_CONFLICT_HANDOVER_FAILED_MESSAGE =
  'Impossible de préparer cet appareil pour le moment. Réessayez.';

type ConflictSituation = 'handover-available' | 'unsent-changes' | 'unknown';

/** Read only: what the other account still holds here that was never acknowledged. */
function readSituation(database: SourisDatabase, businessId: string | undefined): ConflictSituation {
  if (businessId === undefined) return 'unknown';
  try {
    return hasUnsentLocalData(assessLocalAccountData(database, businessId)) ? 'unsent-changes' : 'handover-available';
  } catch {
    return 'unknown';
  }
}

const MESSAGES: Record<ConflictSituation, string> = {
  'handover-available': ACCOUNT_CONFLICT_HANDOVER_MESSAGE,
  'unsent-changes': ACCOUNT_CONFLICT_UNSENT_MESSAGE,
  unknown: ACCOUNT_CONFLICT_UNAVAILABLE_MESSAGE,
};

export function AccountConflictScreen() {
  const { signOut } = useAuth();
  const { state } = useBusinessSession();
  const { database, prepareForAnotherAccount } = usePersistence();
  const { whenIdle } = useCloudSyncControl();
  const businessId = state.status === 'device-account-conflict' ? state.business.id : undefined;

  // Read again after a refused attempt (the state may have changed meanwhile).
  const [attempt, setAttempt] = useState(0);
  const situation = useMemo(
    () => readSituation(database, businessId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` forces a fresh read
    [database, businessId, attempt],
  );
  const [confirming, setConfirming] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  // A successful hand-over remounts the tree under this screen: nothing is set after it.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const prepare = useCallback(async () => {
    if (businessId === undefined) return;
    setPreparing(true);
    setFailed(false);
    try {
      // A run still in flight for the other account finishes first.
      await whenIdle();
      if (!mounted.current) return;
      prepareForAnotherAccount(businessId);
    } catch {
      if (!mounted.current) return;
      setPreparing(false);
      setConfirming(false);
      setFailed(true);
      setAttempt((current) => current + 1);
    }
  }, [businessId, prepareForAnotherAccount, whenIdle]);

  return (
    <>
      <AccountStateScreen
        accessory={
          failed ? (
            <AppText variant="metadata" style={styles.failure} testID="account-conflict-failure">
              {ACCOUNT_CONFLICT_HANDOVER_FAILED_MESSAGE}
            </AppText>
          ) : undefined
        }
        actions={
          <>
            {situation === 'handover-available' && (
              <AppButton
                disabled={preparing}
                onPress={() => setConfirming(true)}
                testID="account-conflict-prepare"
                title={ACCOUNT_CONFLICT_HANDOVER_ACTION}
              />
            )}
            <AppButton
              disabled={preparing}
              onPress={() => void signOut()}
              testID="account-conflict-sign-out"
              title="Se déconnecter"
              variant={situation === 'handover-available' ? 'tertiary' : 'secondary'}
            />
          </>
        }
        message={MESSAGES[situation]}
        testID="account-conflict-screen"
        title={ACCOUNT_CONFLICT_TITLE}
      />
      <ConfirmationDialog
        body={ACCOUNT_CONFLICT_DIALOG_BODY}
        busy={preparing}
        cancelLabel="Annuler"
        cancelTestID="cancel-prepare-device"
        confirmLabel={ACCOUNT_CONFLICT_DIALOG_CONFIRM}
        confirmTestID="confirm-prepare-device"
        eyebrow="COMPTE"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void prepare()}
        testID="account-conflict-dialog"
        title={ACCOUNT_CONFLICT_DIALOG_TITLE}
        tone="destructive"
        visible={confirming}
      />
    </>
  );
}

const styles = StyleSheet.create({
  failure: { color: rose.rose600, textAlign: 'center' },
});
