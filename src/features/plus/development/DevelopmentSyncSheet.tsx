// Souris — development sync control (Cloud Sync V1C / V1D, __DEV__ ONLY)
//
// A supervised test bench for the initial-upload approval, the new-device
// restore approval, and the push / pull on a real device or simulator. It is
// NOT product UI:
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
//   * "Approve restore" is its mirror image for an EMPTY device: enabled ONLY
//     when the stored state is RESTORE_REQUIRED, same second confirmation,
//     calls `approveInitialRestore(db, thatId)`. Approving restores nothing by
//     itself: the NEXT run ("Run sync now" included) performs the
//     transactional restore, and a failed restore keeps the approval;
//   * "Run sync now" triggers the runner's OWN single-flight worker, under the
//     same live-session conditions as every automatic run;
//   * it displays state codes and counts only, and logs nothing.

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { approveInitialRestore, approveInitialUpload } from '@/persistence/sync/bootstrap';
import { useCloudSyncControl } from '@/providers/CloudSyncRunner';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

import {
  canApproveInitialRestore,
  canApproveInitialUpload,
  formatSyncRunResult,
  readDevelopmentSyncStatus,
  readLastSyncResult,
  rememberLastSyncResult,
  type DevelopmentSyncStatus,
} from './sync-status';

type ApprovalKind = 'UPLOAD' | 'RESTORE';

const APPROVAL = {
  UPLOAD: {
    allowed: canApproveInitialUpload,
    title: 'Approuver l’envoi initial ?',
    action: 'Approve initial upload',
    body: (name: string, id: string) =>
      `TOUTES les données locales de cet appareil seront envoyées vers le Business « ${name} » (${id}). À faire uniquement lors d’une migration supervisée.`,
    approved: 'APPROVAL · APPROVED · run sync to upload',
  },
  RESTORE: {
    allowed: canApproveInitialRestore,
    title: 'Approuver la restauration ?',
    action: 'Approve restore',
    body: (name: string, id: string) =>
      `La base locale VIDE de cet appareil sera reconstruite à partir des données distantes du Business « ${name} » (${id}). Rien n’est restauré tant qu’une sync n’est pas lancée.`,
    approved: 'RESTORE APPROVAL · APPROVED · run sync to restore',
  },
} as const;

interface DevelopmentSyncSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function DevelopmentSyncSheet({ visible, onClose }: DevelopmentSyncSheetProps) {
  const { database } = usePersistence();
  const { runNow } = useCloudSyncControl();
  const [status, setStatus] = useState<DevelopmentSyncStatus>(() => readDevelopmentSyncStatus(database));
  const [lastResult, setLastResult] = useState<string | undefined>(readLastSyncResult);
  const [running, setRunning] = useState(false);
  /** What the second confirmation is currently asking about, and for which Business. */
  const [confirming, setConfirming] = useState<{
    readonly kind: ApprovalKind;
    readonly business: NonNullable<DevelopmentSyncStatus['business']>;
  }>();

  const refresh = useCallback(() => setStatus(readDevelopmentSyncStatus(database)), [database]);

  if (!__DEV__) return null;

  // A restore or an applied pull remounts this sheet: the line outlives it.
  const showResult = (line: string) => {
    rememberLastSyncResult(line);
    setLastResult(line);
  };

  const runSyncNow = async () => {
    if (!__DEV__ || !runNow || running) return;
    setRunning(true);
    try {
      showResult(formatSyncRunResult(await runNow()));
    } finally {
      setRunning(false);
      refresh();
    }
  };

  // First press: re-read the state and only ASK. Nothing is approved here.
  const requestApproval = (kind: ApprovalKind) => {
    const current = readDevelopmentSyncStatus(database);
    setStatus(current);
    if (__DEV__ && current.business && APPROVAL[kind].allowed(current)) {
      setConfirming({ kind, business: current.business });
    }
  };

  // Second, explicit confirmation: approve exactly the Business that was shown.
  const confirmApproval = () => {
    const target = confirming;
    setConfirming(undefined);
    if (!__DEV__ || !target) return;
    const label = target.kind === 'UPLOAD' ? 'APPROVAL' : 'RESTORE APPROVAL';
    const current = readDevelopmentSyncStatus(database);
    if (!APPROVAL[target.kind].allowed(current) || current.business?.id !== target.business.id) {
      showResult(`${label} · REFUSED · STATE_CHANGED`);
      setStatus(current);
      return;
    }
    const result =
      target.kind === 'UPLOAD'
        ? approveInitialUpload(database, target.business.id)
        : approveInitialRestore(database, target.business.id);
    showResult(
      result.status === 'APPROVED' ? APPROVAL[target.kind].approved : `${label} · REFUSED · ${result.reason}`,
    );
    refresh();
  };

  const approvable = canApproveInitialUpload(status);
  const restorable = canApproveInitialRestore(status);

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
          label="Restauration"
          testID="development-sync-restore"
          value={
            status.restoreApprovalPending
              ? 'APPROUVÉE — en attente de la prochaine sync'
              : status.decision === 'RESTORE_REQUIRED'
                ? 'REQUISE — base locale vide, Business distant peuplé'
                : 'aucune en attente'
          }
        />
        <DetailRow
          label="Curseur pull"
          testID="development-sync-pull-cursor"
          value={status.pullCursor?.toISOString() ?? '—'}
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
          onPress={() => requestApproval('UPLOAD')}
          testID="development-sync-approve"
          title="Approve initial upload"
          variant="dangerSoft"
        />
        <AppButton
          disabled={!restorable}
          onPress={() => requestApproval('RESTORE')}
          testID="development-sync-approve-restore"
          title="Approve restore"
          variant="dangerSoft"
        />
        <AppButton onPress={refresh} testID="development-sync-refresh" title="Actualiser" variant="tertiary" />
      </View>

      <ConfirmationDialog
        body={
          confirming
            ? APPROVAL[confirming.kind].body(confirming.business.name, confirming.business.id)
            : undefined
        }
        cancelLabel="Annuler"
        cancelTestID="development-sync-approve-cancel"
        confirmLabel={confirming ? APPROVAL[confirming.kind].action : 'Approve'}
        confirmTestID="development-sync-approve-confirm"
        eyebrow="DÉVELOPPEMENT"
        onCancel={() => setConfirming(undefined)}
        onConfirm={confirmApproval}
        testID="development-sync-approve-dialog"
        title={confirming ? APPROVAL[confirming.kind].title : 'Approuver ?'}
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
