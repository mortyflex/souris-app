// BeautIzzy — « Corrections et remboursements »: the adjustment history of ONE Sale
//
// Under the Sale detail. The flows themselves are opened from the « ••• »
// drawer « Actions de la vente » (SaleActionsSheet) — never from buttons here.
// This section lists every record of the Sale, newest first, each with what it says and its auditable
// history — when the money actually left (« Remboursé le ») apart from when it
// was entered (« Enregistré le »). The original Sale above stays untouched.
//
// Per record, only the transitions the domain allows, each behind an explicit
// confirmation:
//   PENDING                    « Marquer comme remboursé » (today, or another day)
//                              « Annuler cette saisie »
//   SETTLED refund             « Corriger ce remboursement… » — a dedicated
//                              screen asks what really happened (entered by
//                              mistake / money returned / really paid) and
//                              records the matching compensation, never an erasure
//   refused by the server      « Annuler cette saisie » — the one way out of a
//                              conflict between two devices
// A record refused by the server says so; nothing is ever claimed synchronized.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  canReverseSaleAdjustment,
  findSaleAdjustmentReversal,
  getSaleAdjustmentAmountCents,
  getSaleAdjustmentEligibility,
  getSaleAdjustmentHistory,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  type Sale,
  type SaleAdjustment,
} from '@/domain/sales';
import { formatEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';
import { haptics } from '@/shared/lib/haptics';

import { formatSaleQuantity } from '../presentation';
import { useSaleSession } from '../session/SaleSessionProvider';
import { getRefundInstant } from './form';
import {
  formatSaleAdjustmentDay,
  formatSaleAdjustmentInstant,
  formatSaleAdjustmentMethods,
  formatSaleAdjustmentStatus,
  formatSaleAdjustmentSyncState,
  SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE,
  SALE_ADJUSTMENT_REASON_LABELS,
  SALE_ADJUSTMENT_TRANSITION_LABELS,
} from './presentation';

export const SALE_FULLY_ADJUSTED_NOTE = 'Toute la vente a déjà été remboursée ou corrigée.';
export const SALE_ADJUSTMENT_ACTION_ERROR =
  'Action impossible : la vente ou le stock a changé entre-temps. Vérifiez puis recommencez.';

type PendingAction =
  | { readonly kind: 'SETTLE_TODAY'; readonly adjustment: SaleAdjustment }
  | { readonly kind: 'VOID'; readonly adjustment: SaleAdjustment };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function SaleAdjustmentsSection({ sale }: { readonly sale: Sale }) {
  const router = useRouter();
  const {
    saleAdjustments,
    isAppointmentSettled,
    settleSaleAdjustment,
    voidSaleAdjustment,
    getSaleAdjustmentSyncStates,
  } = useSaleSession();
  const [pending, setPending] = useState<PendingAction>();
  const [settlingOnDay, setSettlingOnDay] = useState<SaleAdjustment>();
  const [error, setError] = useState<string>();

  const adjustments = getSaleAdjustments(saleAdjustments, sale.id);
  const position = getSaleAdjustmentPosition(sale, saleAdjustments);
  const eligibility = getSaleAdjustmentEligibility(
    sale,
    sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId),
  );
  const syncStates = getSaleAdjustmentSyncStates();
  const unitsLeft = position.lines.some((line) => line.remainingQuantity > 0);
  const somethingLeft = position.remainingCents > 0 || unitsLeft;
  const now = new Date();

  const run = (action: () => void) => {
    setError(undefined);
    try {
      action();
      haptics.success();
    } catch {
      setError(SALE_ADJUSTMENT_ACTION_ERROR);
    }
  };

  const confirmPending = () => {
    if (!pending) return;
    const { adjustment } = pending;
    setPending(undefined);
    if (pending.kind === 'SETTLE_TODAY') run(() => settleSaleAdjustment(adjustment.id, new Date()));
    else run(() => voidSaleAdjustment(adjustment.id));
  };

  const dialog = pending ? describeDialog(pending, now) : undefined;

  // Nothing recorded and nothing to explain: the section stays out of the way.
  if (eligibility.ok && adjustments.length === 0 && !error) return null;

  return (
    <View style={styles.section} testID="sale-adjustments">
      <SectionHeader count={adjustments.length > 0 ? adjustments.length : undefined} title="Corrections et remboursements" />
      {!eligibility.ok ? (
        <AppText variant="metadata" style={styles.soft} testID="sale-adjustments-not-eligible">
          {SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE}
        </AppText>
      ) : (
        !somethingLeft && (
          <AppText variant="metadata" style={styles.soft} testID="sale-adjustments-done">
            {SALE_FULLY_ADJUSTED_NOTE}
          </AppText>
        )
      )}

      {error && (
        <AppText accessibilityLiveRegion="assertive" variant="metadata" style={styles.error} testID="sale-adjustments-error">
          {error}
        </AppText>
      )}

      {adjustments.length > 0 && (
        <View style={styles.list} testID="sale-adjustments-history">
          {[...adjustments].reverse().map((adjustment) => {
            const refused = syncStates.get(adjustment.id) === 'REFUSED';
            return (
              <AdjustmentCard
                adjustment={adjustment}
                key={adjustment.id}
                compensation={findSaleAdjustmentReversal(adjustments, adjustment.id)}
                onCorrect={
                  !refused && canReverseSaleAdjustment(adjustment, adjustments)
                    ? () =>
                        router.push({ pathname: '/sales/refund/[adjustmentId]', params: { adjustmentId: adjustment.id } })
                    : undefined
                }
                onSettleOtherDay={adjustment.status === 'PENDING' ? () => setSettlingOnDay(adjustment) : undefined}
                onSettleToday={
                  adjustment.status === 'PENDING' ? () => setPending({ kind: 'SETTLE_TODAY', adjustment }) : undefined
                }
                onVoid={
                  adjustment.status === 'PENDING' || (refused && adjustment.status === 'SETTLED')
                    ? () => setPending({ kind: 'VOID', adjustment })
                    : undefined
                }
                syncWarning={formatSaleAdjustmentSyncState(syncStates.get(adjustment.id))}
              />
            );
          })}
        </View>
      )}

      <ConfirmationDialog
        body={dialog?.body}
        cancelLabel="Retour"
        confirmLabel={dialog?.confirm}
        confirmTestID="sale-adjustments-dialog-confirm"
        onCancel={() => setPending(undefined)}
        onConfirm={confirmPending}
        testID="sale-adjustments-dialog"
        title={dialog?.title ?? ''}
        tone={pending?.kind === 'VOID' ? 'destructive' : 'neutral'}
        visible={pending !== undefined}
      />

      <MonthCalendarSheet
        day={startOfLocalDay(now)}
        onClose={() => setSettlingOnDay(undefined)}
        onSelect={(day) => {
          const adjustment = settlingOnDay;
          setSettlingOnDay(undefined);
          if (!adjustment) return;
          const earliest = startOfLocalDay(sale.completedAt).getTime();
          const chosen = new Date(Math.min(Math.max(startOfLocalDay(day).getTime(), earliest), startOfLocalDay(now).getTime()));
          run(() => settleSaleAdjustment(adjustment.id, getRefundInstant(chosen, sale.completedAt, new Date())));
        }}
        testID="sale-adjustments-calendar"
        today={startOfLocalDay(now)}
        visible={settlingOnDay !== undefined}
      />
    </View>
  );
}

function describeDialog(action: PendingAction, now: Date) {
  const amount = formatEuroCents(getSaleAdjustmentAmountCents(action.adjustment));
  switch (action.kind) {
    case 'SETTLE_TODAY':
      return {
        title: 'Marquer comme remboursé ?',
        body: `Le remboursement de ${amount} comptera dans la caisse d’aujourd’hui, le ${formatSaleAdjustmentDay(now)}. BeautIzzy n’effectue aucun remboursement lui-même.`,
        confirm: 'Remboursé aujourd’hui',
      };
    case 'VOID':
      return {
        title: 'Annuler cette saisie ?',
        body: 'Elle restera visible comme annulée et ne comptera nulle part. Les unités remises en stock par cette saisie en seront retirées.',
        confirm: 'Annuler la saisie',
      };
  }
}

interface AdjustmentCardProps {
  readonly adjustment: SaleAdjustment;
  readonly syncWarning: string | undefined;
  readonly onSettleToday?: () => void;
  readonly onSettleOtherDay?: () => void;
  readonly onVoid?: () => void;
  /** Opens « Corriger un remboursement » (a SETTLED refund). */
  readonly onCorrect?: () => void;
  /** The compensation recorded for this refund, if any. */
  readonly compensation?: SaleAdjustment;
}

function AdjustmentCard({
  adjustment,
  syncWarning,
  onSettleToday,
  onSettleOtherDay,
  onVoid,
  onCorrect,
  compensation,
}: AdjustmentCardProps) {
  const amountCents = getSaleAdjustmentAmountCents(adjustment);
  const signed =
    amountCents === 0 ? '' : `${adjustment.kind === 'REVERSAL' ? '+' : '−'}${formatEuroCents(amountCents)}`;
  const status = formatSaleAdjustmentStatus(adjustment);
  const voided = adjustment.status === 'VOIDED';
  return (
    <View style={[styles.card, voided && styles.cardVoided]} testID={`sale-adjustment-${adjustment.id}`}>
      <View
        accessible
        accessibilityLabel={[status, signed, SALE_ADJUSTMENT_REASON_LABELS[adjustment.reason]].filter(Boolean).join(', ')}
        style={styles.cardHeader}
      >
        <View style={styles.cardCopy}>
          <AppText variant="eyebrow" style={voided ? styles.soft : styles.accent} testID={`sale-adjustment-${adjustment.id}-status`}>
            {status.toUpperCase()}
          </AppText>
          <AppText variant="body">{SALE_ADJUSTMENT_REASON_LABELS[adjustment.reason]}</AppText>
        </View>
        {signed.length > 0 && (
          <AppText variant="control" style={[styles.amount, voided && styles.strike]} testID={`sale-adjustment-${adjustment.id}-amount`}>
            {signed}
          </AppText>
        )}
      </View>
      {adjustment.items.map((item) => (
        <AppText key={item.id} variant="metadata" style={styles.soft}>
          {`${item.productName} ${formatSaleQuantity(item.quantity)} · ${item.restock ? 'remis en stock' : 'pas de retour en stock'}`}
        </AppText>
      ))}
      {amountCents > 0 && (
        <AppText variant="metadata" style={styles.soft}>
          {formatSaleAdjustmentMethods(adjustment)}
        </AppText>
      )}
      {adjustment.refundedAt && amountCents > 0 && (
        <AppText variant="metadata" style={styles.soft} testID={`sale-adjustment-${adjustment.id}-refunded`}>
          {`${
            adjustment.kind === 'REVERSAL'
              ? adjustment.reason === 'REFUND_RETURNED'
                ? 'Rendu le'
                : 'Compte pour le'
              : 'Remboursé le'
          } ${formatSaleAdjustmentDay(adjustment.refundedAt)}`}
        </AppText>
      )}
      {adjustment.note && (
        <AppText variant="metadata" style={styles.soft}>
          {`Note : ${adjustment.note}`}
        </AppText>
      )}
      <View style={styles.history} testID={`sale-adjustment-${adjustment.id}-history`}>
        {getSaleAdjustmentHistory(adjustment).map((step) => (
          <AppText key={step.kind} variant="metadata" style={styles.soft}>
            {`${SALE_ADJUSTMENT_TRANSITION_LABELS[step.kind]} le ${formatSaleAdjustmentInstant(step.at)}`}
          </AppText>
        ))}
      </View>
      {compensation && (
        <AppText variant="metadata" style={styles.accent} testID={`sale-adjustment-${adjustment.id}-compensated`}>
          {compensation.reason === 'REFUND_RETURNED'
            ? `Argent rendu le ${formatSaleAdjustmentDay(compensation.refundedAt ?? compensation.recordedAt)} (${formatSaleAdjustmentMethods(compensation)})`
            : `Saisie erronée, corrigée le ${formatSaleAdjustmentInstant(compensation.recordedAt)}`}
        </AppText>
      )}
      {syncWarning && (
        <AppText variant="metadata" style={styles.error} testID={`sale-adjustment-${adjustment.id}-refused`}>
          {syncWarning}
        </AppText>
      )}
      {(onSettleToday || onVoid || onCorrect) && (
        <View style={styles.cardActions}>
          {onSettleToday && (
            <AppButton onPress={onSettleToday} testID={`sale-adjustment-${adjustment.id}-settle`} title="Marquer comme remboursé" variant="secondary" />
          )}
          {onSettleOtherDay && (
            <AppButton
              onPress={onSettleOtherDay}
              testID={`sale-adjustment-${adjustment.id}-settle-day`}
              title="Remboursé un autre jour…"
              variant="tertiary"
            />
          )}
          {onCorrect && (
            <AppButton
              accessibilityHint="Indiquer si ce remboursement a été saisi par erreur ou si l’argent a été rendu"
              onPress={onCorrect}
              testID={`sale-adjustment-${adjustment.id}-correct`}
              title="Corriger ce remboursement…"
              variant="tertiary"
            />
          )}
          {onVoid && (
            <AppButton onPress={onVoid} testID={`sale-adjustment-${adjustment.id}-void`} title="Annuler cette saisie" variant="tertiary" />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  soft: { color: foregroundSoft },
  accent: { color: semanticColors.accent },
  error: { color: rose.rose600 },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    padding: spacing.base,
  },
  cardVoided: { opacity: 0.75 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  cardCopy: { flex: 1, gap: 2, minWidth: 0 },
  amount: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  strike: { color: foregroundSoft, textDecorationLine: 'line-through' },
  history: { gap: 1, marginTop: spacing.xs },
  cardActions: { gap: spacing.xs, marginTop: spacing.sm },
});
