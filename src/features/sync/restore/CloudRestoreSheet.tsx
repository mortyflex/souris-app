// Souris — production restore prompt (Cloud Sync V1D)
//
// The ONE user-facing entry point of the new-device restore. It exists for a
// single situation, RESTORE_REQUIRED: this device is empty and the signed-in
// account's Business already holds data (a reinstall, a new phone). It shows
// nothing in any other state, and it is the only sync surface a release build
// contains — no bootstrap, upload or debug control lives here.
//
//   prompt        "Des données existent pour ce compte" — what will be restored, for
//                 which Business, and that Product photos are not part of it (V1F)
//   Restaurer     → the SAME sheet shows the confirmation naming the exact Business
//                 (a second content step, never a second native Modal: iOS refuses
//                 to present a Modal from inside an already presented one)
//   confirm       → re-read the binding and the stored state (both must still be
//                 RESTORE_REQUIRED for THIS Business), approveInitialRestore(db, id),
//                 then ONE run of the runner's own worker, which performs the
//                 transactional restore (restore.ts) and re-hydrates the app
//   Plus tard     → the prompt goes away for this session; nothing is written,
//                 nothing is created locally
//   failure       → non-destructive message; local data untouched; « Réessayer »
//
// Nothing here restores on its own: the worker refuses a restore without the
// approval, and the approval is written only from the confirmation above. No
// aggregate value, account, email or Business id is written in this file.

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { readBoundBusinessId } from '@/persistence/sync/aggregate';
import { approveInitialRestore, readSyncBootstrapRecord } from '@/persistence/sync/bootstrap';
import { useCloudSyncControl } from '@/providers/CloudSyncRunner';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

type RestorePhase =
  /** Waiting for the user. */
  | 'IDLE'
  /** The run is in flight; the confirmation step stays up, busy. */
  | 'RESTORING'
  /** The run did not restore; SQLite is untouched and the approval is kept. */
  | 'FAILED'
  /** The device is no longer an empty device of that Business; nothing was approved. */
  | 'REFUSED';

export function CloudRestoreSheet() {
  const { database } = usePersistence();
  const { state: session } = useBusinessSession();
  const { restoreRequired, runNow } = useCloudSyncControl();
  const [deferred, setDeferred] = useState(false);
  /** Second content step of the sheet: the confirmation naming the Business. */
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<RestorePhase>('IDLE');

  const business = session.status === 'ready' ? session.business : undefined;
  const visible = restoreRequired && !deferred && business !== undefined;

  const defer = () => {
    if (phase === 'RESTORING') return;
    setConfirming(false);
    setDeferred(true);
  };

  /** The only writer of the approval in a release build. */
  const restore = async () => {
    if (!business || !runNow || phase === 'RESTORING') return;
    // Re-checked at confirmation time, not when the prompt appeared.
    const stillRequired =
      readBoundBusinessId(database) === business.id &&
      readSyncBootstrapRecord(database, business.id)?.decision === 'RESTORE_REQUIRED';
    if (!stillRequired || approveInitialRestore(database, business.id).status !== 'APPROVED') {
      setConfirming(false);
      setPhase('REFUSED');
      return;
    }
    setPhase('RESTORING');
    const result = await runNow();
    // RESTORED re-hydrates the whole app (the runner remounts it): this sheet is gone with it.
    setConfirming(false);
    setPhase(result.status === 'RESTORED' ? 'IDLE' : 'FAILED');
  };

  const busy = phase === 'RESTORING';
  const name = business?.name ?? '';

  const body =
    phase === 'REFUSED'
      ? 'La situation a changé : la restauration n’est plus possible depuis cet appareil.'
      : phase === 'FAILED'
        ? 'La restauration n’a pas abouti. Aucune donnée n’a été modifiée sur cet appareil. Vérifiez votre connexion, puis réessayez.'
        : `Souris peut restaurer sur cet appareil les données enregistrées pour « ${name} » : clients, prestations, rendez-vous, produits et ventes. Les photos de produits ne sont pas restaurées pour le moment.`;

  // ONE native presentation: the confirmation is a content step of this sheet.
  if (confirming) {
    return (
      <BottomSheet
        backdropLabel="Annuler"
        dismissOnHardwareBack={!busy}
        header={
          <SheetHeader eyebrow="VOS DONNÉES" title={`Restaurer les données de « ${name} » ?`} />
        }
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
        testID="cloud-restore-sheet"
        visible={visible}
      >
        <View style={styles.body}>
          <AppText style={styles.message} testID="cloud-restore-confirm-message" variant="body">
            {busy
              ? 'Restauration en cours… Gardez l’application ouverte.'
              : 'Les données de ce compte seront copiées sur cet appareil. Rien n’est envoyé ni supprimé.'}
          </AppText>
        </View>
        <View
          accessibilityState={{ busy }}
          style={styles.actions}
          testID="cloud-restore-confirm-step"
        >
          <View style={styles.confirm}>
            <AppButton
              accessibilityState={{ busy }}
              disabled={busy}
              onPress={() => void restore()}
              testID="cloud-restore-confirm"
              title="Restaurer mes données"
            />
            {busy && (
              <View pointerEvents="none" style={styles.busy}>
                <ActivityIndicator color={semanticColors.accent} size="small" />
              </View>
            )}
          </View>
          <AppButton
            disabled={busy}
            onPress={() => setConfirming(false)}
            testID="cloud-restore-cancel"
            title="Annuler"
            variant="secondary"
          />
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      backdropLabel="Plus tard"
      header={<SheetHeader eyebrow="VOS DONNÉES" title="Des données existent pour ce compte" />}
      onClose={defer}
      testID="cloud-restore-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        <AppText style={styles.message} testID="cloud-restore-message" variant="body">
          {body}
        </AppText>
        {phase === 'IDLE' && (
          <AppText style={styles.hint} variant="metadata">
            Si vous ajoutez des données avant de restaurer, la restauration ne sera plus proposée.
          </AppText>
        )}
        {!runNow && phase !== 'REFUSED' && (
          <AppText style={styles.hint} testID="cloud-restore-offline" variant="metadata">
            Une connexion est nécessaire pour restaurer.
          </AppText>
        )}
      </View>
      <View style={styles.actions}>
        {phase !== 'REFUSED' && (
          <AppButton
            disabled={!runNow}
            onPress={() => setConfirming(true)}
            testID="cloud-restore-primary"
            title={phase === 'FAILED' ? 'Réessayer' : 'Restaurer mes données'}
          />
        )}
        <AppButton
          onPress={defer}
          testID="cloud-restore-defer"
          title={phase === 'REFUSED' ? 'Fermer' : 'Plus tard'}
          variant="tertiary"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  message: { color: semanticColors.foreground },
  hint: { color: semanticColors.foregroundSoft },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingTop: spacing.sm,
  },
  confirm: { justifyContent: 'center' },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
