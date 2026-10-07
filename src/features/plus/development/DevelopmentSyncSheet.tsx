// BeautIzzy — development sync control (Cloud Sync V1C–V1D.1, __DEV__ ONLY)
//
// A supervised test bench for the first sync (automatic since V1D.1), the push
// and the pull on a real device or simulator. It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it from release bundles, and the
//     component renders nothing and its action refuses to act outside
//     `__DEV__` even if something imported it;
//   * it shows the Business this DEVICE is bound to — no account, email or
//     Business id is written anywhere in this file;
//   * it approves NOTHING: the initial upload and the new-device restore are
//     approved by the cloud sync runner alone. A pending approval shown here
//     means an automatic first sync that did not complete yet (a failure) and
//     that the next run retries;
//   * "Run sync now" triggers the runner's OWN single-flight orchestration,
//     under the same live-session conditions as every automatic run;
//   * it displays state codes and counts only, and logs nothing.

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCloudSyncControl } from '@/providers/CloudSyncRunner';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

import {
  formatSyncRunResult,
  readDevelopmentSyncStatus,
  readLastSyncResult,
  rememberLastSyncResult,
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
  const [lastResult, setLastResult] = useState<string | undefined>(readLastSyncResult);
  const [running, setRunning] = useState(false);

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
          value={status.approvalPending ? 'ENVOI INITIAL APPROUVÉ — en attente de la prochaine sync' : 'aucune en attente'}
        />
        <DetailRow
          label="Restauration"
          testID="development-sync-restore"
          value={
            status.restoreApprovalPending
              ? 'APPROUVÉE — en attente de la prochaine sync'
              : status.decision === 'RESTORE_REQUIRED'
                ? 'REQUISE — automatique à la prochaine sync'
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
        <AppButton onPress={refresh} testID="development-sync-refresh" title="Actualiser" variant="tertiary" />
      </View>
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
