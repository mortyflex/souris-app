// Souris — development sync control (Cloud Sync V1C, __DEV__ ONLY)
//
// A supervised test bench for the initial-upload approval and the push on a
// real device or simulator. It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it from release bundles, and the
//     component renders nothing and its actions refuse to act outside
//     `__DEV__` even if something imported it;
//   * it shows the Business this DEVICE is bound to — no account, email or
//     Business id is written anywhere in this file;
//   * "Approve initial upload" is enabled ONLY when the stored state is
//     INITIAL_UPLOAD_REQUIRES_APPROVAL, asks a second confirmation naming the
//     exact Business name and id, and calls the existing
//     `approveInitialUpload(db, thatId)`. Nothing approves on its own: not
//     opening the sheet, not "Run sync now", not a failed attempt;
//   * "Run sync now" triggers the runner's OWN single-flight worker, under the
//     same live-session conditions as every automatic run;
//   * it displays state codes and counts only, and logs nothing.

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { approveInitialUpload } from '@/persistence/sync/bootstrap';
import { useCloudSyncControl } from '@/providers/CloudSyncRunner';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

import {
  canApproveInitialUpload,
  formatSyncRunResult,
  readDevelopmentSyncStatus,
  type DevelopmentSyncStatus,
} from './sync-status';

interface DevelopmentSyncSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function DevelopmentSyncSheet({ visible, onClose }: DevelopmentSyncSheetProps) {
  const { database } = usePersistence();
  const { runNow } = useCloudSyncControl();
  const [status, setStatus] = useState<DevelopmentSyncStatus>(() => readDevelopmentSyncStatus(database));
  const [lastResult, setLastResult] = useState<string>();
  const [running, setRunning] = useState(false);
  /** The Business the second confirmation is currently asking about. */
  const [confirming, setConfirming] = useState<DevelopmentSyncStatus['business']>();

  const refresh = useCallback(() => setStatus(readDevelopmentSyncStatus(database)), [database]);

  if (!__DEV__) return null;

  const runSyncNow = async () => {
    if (!__DEV__ || !runNow || running) return;
    setRunning(true);
    try {
      setLastResult(formatSyncRunResult(await runNow()));
    } finally {
      setRunning(false);
      refresh();
    }
  };

  // First press: re-read the state and only ASK. Nothing is approved here.
  const requestApproval = () => {
    const current = readDevelopmentSyncStatus(database);
    setStatus(current);
    if (__DEV__ && canApproveInitialUpload(current)) setConfirming(current.business);
  };

  // Second, explicit confirmation: approve exactly the Business that was shown.
  const confirmApproval = () => {
    const target = confirming;
    setConfirming(undefined);
    if (!__DEV__ || !target) return;
    const current = readDevelopmentSyncStatus(database);
    if (!canApproveInitialUpload(current) || current.business?.id !== target.id) {
      setLastResult('APPROVAL · REFUSED · STATE_CHANGED');
      setStatus(current);
      return;
    }
    const result = approveInitialUpload(database, target.id);
    setLastResult(
      result.status === 'APPROVED' ? 'APPROVAL · APPROVED · run sync to upload' : `APPROVAL · REFUSED · ${result.reason}`,
    );
    refresh();
  };

  const approvable = canApproveInitialUpload(status);

  return (
    <BottomSheet
      backdropLabel="Fermer le contrôle Sync V1C"
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: onClose }}
          eyebrow="DÉVELOPPEMENT"
          title="Sync V1C"
        />
      }
      onClose={onClose}
      onShow={refresh}
      testID="development-sync-sheet"
      visible={visible}
    >
      <View style={styles.details}>
        <DetailRow label="Business lié" testID="development-sync-business" value={status.business?.name ?? 'Aucun (base non liée)'} />
        <DetailRow label="Business id" testID="development-sync-business-id" value={status.business?.id ?? '—'} />
        <DetailRow label="État bootstrap" testID="development-sync-state" value={
            status.decision === undefined
              ? 'NON CLASSÉ (lancer une sync)'
              : status.decisionStale
                ? `${status.decision} (périmé — lancer une sync)`
                : status.decision
          }
        />
        <DetailRow
          label="Approbation"
          testID="development-sync-approval"
          value={status.approvalPending ? 'DONNÉE — en attente de la prochaine sync' : 'aucune en attente'}
        />
        <DetailRow
          label="Outbox"
          testID="development-sync-outbox"
          value={`${status.pendingOutboxCount} en attente · ${status.failedOutboxCount} en échec · ${status.acknowledgedCount} acquittés`}
        />
        <DetailRow label="Dernier résultat" testID="development-sync-result" value={lastResult ?? '—'} />
      </View>

      <View style={styles.actions}>
        <AppButton
          disabled={!runNow || running}
          onPress={() => void runSyncNow()}
          testID="development-sync-run"
          title={runNow ? 'Run sync now' : 'Run sync now (session live requise)'}
          variant="secondary"
        />
        <AppButton
          disabled={!approvable}
          onPress={requestApproval}
          testID="development-sync-approve"
          title="Approve initial upload"
          variant="dangerSoft"
        />
        <AppButton onPress={refresh} testID="development-sync-refresh" title="Actualiser" variant="tertiary" />
      </View>

      <ConfirmationDialog
        body={
          confirming
            ? `TOUTES les données locales de cet appareil seront envoyées vers le Business « ${confirming.name} » (${confirming.id}). À faire uniquement lors d’une migration supervisée.`
            : undefined
        }
        cancelLabel="Annuler"
        cancelTestID="development-sync-approve-cancel"
        confirmLabel="Approve initial upload"
        confirmTestID="development-sync-approve-confirm"
        eyebrow="DÉVELOPPEMENT"
        onCancel={() => setConfirming(undefined)}
        onConfirm={confirmApproval}
        testID="development-sync-approve-dialog"
        title="Approuver l’envoi initial ?"
        tone="destructive"
        visible={confirming !== undefined}
      />
    </BottomSheet>
  );
}

function DetailRow({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="metadata" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText selectable variant="body" style={styles.detailValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.xs, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  detailRow: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingVertical: spacing.xs,
  },
  detailLabel: { color: semanticColors.foregroundSoft },
  detailValue: { color: semanticColors.foreground },
  actions: { gap: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.sm },
});
