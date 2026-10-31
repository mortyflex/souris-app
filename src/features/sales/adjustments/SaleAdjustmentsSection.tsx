// BeautIzzy — « Remboursements »: what ONE Sale gave back, as a professional reads it
//
// Under the Sale detail. The flows themselves are opened from the « ••• »
// drawer « Actions de la vente » (SaleActionsSheet). This section shows the
// REAL money movements first — one record that moved money = one line — and
// keeps the technical records apart (`getSaleRefundSummary`):
//
//   needs a decision     a refund the server REFUSED (two devices refunding the
//                        same Sale offline) asks « L’argent a-t-il réellement été
//                        rendu au client ? » in its own highlighted card:
//                          « Non » → the refused record is voided (kept, audited)
//                          « Oui » → the refused record is voided AND ONE additional
//                          refund records the money that really left
//   the summary          « Vente initiale », every effective refund (a refund, an
//                        additional refund, a refund still to pay, a correction),
//                        « Total remboursé », « Solde de la vente », and the state:
//                        « Entièrement remboursé » or « X remboursés en trop »
//   Historique des       the whole journal: EVERY record with its status, dates
//   corrections          and links, collapsed by default. Voided entries,
//                        compensated refunds and their compensations appear only
//                        there — kept, never counted
//
// Actions stay next to the line they act on, each behind an explicit
// confirmation or a dedicated screen:
//   À rembourser            « Marquer comme remboursé », « Remboursé un autre jour… »,
//                           « Annuler cette saisie » (only « Annuler » once refused)
//   Remboursement           « Corriger ce remboursement… » (what really happened)
//   Remboursement           « Le client a rendu cet argent… » — it can never be
//   supplémentaire          cancelled as an error: the money really left
// Synchronization is said only when it waits or needs a decision; a
// synchronized record says nothing in the summary (the history still says it).

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  canReverseSaleAdjustment,
  findSaleAdjustmentReversal,
  findSaleRefundOutflow,
  getSaleAdjustmentAmountCents,
  getSaleAdjustmentEligibility,
  getSaleAdjustmentHistory,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  isSaleRefundOutflow,
  type Sale,
  type SaleAdjustment,
} from '@/domain/sales';
import type { SaleAdjustmentSyncState } from '@/persistence/sync/sale-adjustment-sync';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatSaleQuantity } from '../presentation';
import { useSaleSession } from '../session/SaleSessionProvider';
import { getRefundInstant } from './form';
import {
  describeSaleAdjustmentCashRegisterSync,
  describeSaleAdjustmentSync,
  describeSaleRefundRefusalOutcome,
  formatSaleAdjustmentDay,
  formatSaleAdjustmentInstant,
  formatSaleAdjustmentMethods,
  formatSaleAdjustmentStatus,
  formatSaleNetAmount,
  formatSaleOverRefund,
  formatSaleRefundAmount,
  SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE,
  SALE_ADJUSTMENT_REASON_LABELS,
  SALE_ADJUSTMENT_REFUSED_COPY,
  SALE_ADJUSTMENT_TRANSITION_LABELS,
  SALE_REFUND_HISTORY_TITLE,
  SALE_REFUND_LINE_LABELS,
  SALE_REFUND_MONEY_NOT_RETURNED_ACTION,
  SALE_REFUND_MONEY_RETURNED_ACTION,
  SALE_REFUND_REFUSAL_QUESTION,
  SALE_REFUND_SUMMARY_FULL,
  SALE_REFUND_SUMMARY_NET_LABEL,
  SALE_REFUND_SUMMARY_ORIGINAL_LABEL,
  SALE_REFUND_SUMMARY_OVER_NOTE,
  SALE_REFUND_SUMMARY_TITLE,
  SALE_REFUND_SUMMARY_TO_REFUND_NOTE,
  SALE_REFUND_SUMMARY_TOTAL_LABEL,
  type SaleAdjustmentSyncLine,
} from './presentation';
import { getSaleRefundSummary, type SaleRefundSummary, type SaleRefundSummaryLine } from './summary';

export const SALE_FULLY_ADJUSTED_NOTE = 'Toute la vente a déjà été remboursée ou corrigée.';
export const SALE_ADJUSTMENT_ACTION_ERROR =
  'Action impossible : la vente ou le stock a changé entre-temps. Vérifiez puis recommencez.';

/** The action of each settled line, named by what it does. */
export const SALE_REFUND_CORRECT_ACTION = 'Corriger ce remboursement…';
export const SALE_ADDITIONAL_REFUND_RETURNED_ACTION = 'Le client a rendu cet argent…';
export const SALE_CORRECTION_UNDO_ACTION = 'Revenir sur cette correction…';

type PendingAction =
  | { readonly kind: 'SETTLE_TODAY'; readonly adjustment: SaleAdjustment }
  | { readonly kind: 'VOID'; readonly adjustment: SaleAdjustment }
  /** A refused SETTLED record whose money was NOT returned: voided. */
  | { readonly kind: 'MONEY_NOT_RETURNED'; readonly adjustment: SaleAdjustment }
  /** A refused SETTLED record whose money WAS returned: voided + additional refund. */
  | { readonly kind: 'MONEY_RETURNED'; readonly adjustment: SaleAdjustment };

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
    recordSaleRefundOutflow,
    getSaleAdjustmentSyncStates,
  } = useSaleSession();
  const [pending, setPending] = useState<PendingAction>();
  const [settlingOnDay, setSettlingOnDay] = useState<SaleAdjustment>();
  const [error, setError] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);

  const adjustments = getSaleAdjustments(saleAdjustments, sale.id);
  const summary = getSaleRefundSummary(sale, saleAdjustments);
  const position = getSaleAdjustmentPosition(sale, saleAdjustments);
  const eligibility = getSaleAdjustmentEligibility(
    sale,
    sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId),
  );
  const syncStates = getSaleAdjustmentSyncStates();
  const unitsLeft = position.lines.some((line) => line.remainingQuantity > 0);
  const somethingLeft = position.remainingCents > 0 || unitsLeft;
  const now = new Date();

  // A refused SETTLED refund asks what really happened; never an additional refund (money that left).
  const toResolve = summary.lines
    .map((line) => line.adjustment)
    .filter(
      (adjustment) =>
        syncStates.get(adjustment.id) === 'REFUSED' &&
        !isSaleRefundOutflow(adjustment) &&
        adjustment.kind === 'REFUND' &&
        adjustment.status === 'SETTLED',
    );

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
    switch (pending.kind) {
      case 'SETTLE_TODAY':
        run(() => settleSaleAdjustment(adjustment.id, new Date()));
        break;
      case 'MONEY_RETURNED':
        run(() => recordSaleRefundOutflow(adjustment.id));
        break;
      case 'VOID':
      case 'MONEY_NOT_RETURNED':
        run(() => voidSaleAdjustment(adjustment.id));
        break;
    }
  };

  const dialog = pending ? describeDialog(pending, now) : undefined;

  // Nothing recorded and nothing to explain: the section stays out of the way.
  if (eligibility.ok && adjustments.length === 0 && !error) return null;

  const fullyGivenBack = summary.state === 'FULL' || summary.state === 'OVER';

  return (
    <View style={styles.section} testID="sale-adjustments">
      <SectionHeader title={SALE_REFUND_SUMMARY_TITLE} />
      {!eligibility.ok ? (
        <AppText variant="metadata" style={styles.soft} testID="sale-adjustments-not-eligible">
          {SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE}
        </AppText>
      ) : (
        !somethingLeft &&
        !fullyGivenBack && (
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

      {toResolve.map((adjustment) => (
        <RefusalCard
          adjustment={adjustment}
          key={adjustment.id}
          onMoneyNotReturned={() => setPending({ kind: 'MONEY_NOT_RETURNED', adjustment })}
          onMoneyReturned={() => setPending({ kind: 'MONEY_RETURNED', adjustment })}
        />
      ))}

      {summary.lines.length > 0 && (
        <SummaryCard
          // An unanswered refusal still counts on this device: the « en trop » verdict waits for the answer.
          awaitingAnswer={toResolve.length > 0}
          renderActions={(line) => {
            const { adjustment } = line;
            const state = syncStates.get(adjustment.id);
            const refused = state === 'REFUSED';
            if (adjustment.status === 'PENDING') {
              return (
                <PendingActions
                  adjustment={adjustment}
                  // A refused PENDING refund is never paid out: the server will not take it.
                  onSettleOtherDay={refused ? undefined : () => setSettlingOnDay(adjustment)}
                  onSettleToday={refused ? undefined : () => setPending({ kind: 'SETTLE_TODAY', adjustment })}
                  onVoid={() => setPending({ kind: 'VOID', adjustment })}
                />
              );
            }
            if (refused || !canReverseSaleAdjustment(adjustment, adjustments)) return null;
            return (
              <LineLink
                accessibilityHint={correctHint(line)}
                label={correctLabel(line)}
                onPress={() =>
                  router.push({ pathname: '/sales/refund/[adjustmentId]', params: { adjustmentId: adjustment.id } })
                }
                testID={`sale-adjustment-${adjustment.id}-correct`}
              />
            );
          }}
          summary={summary}
          syncStates={syncStates}
        />
      )}

      {summary.history.length > 0 && (
        <View style={styles.history} testID="sale-adjustments-history">
          <Pressable
            accessibilityHint={historyOpen ? 'Masque le détail de chaque écriture' : 'Affiche chaque écriture, ses dates et son statut'}
            accessibilityLabel={`${SALE_REFUND_HISTORY_TITLE}, ${summary.history.length} écriture${summary.history.length > 1 ? 's' : ''}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: historyOpen }}
            hitSlop={4}
            onPress={() => setHistoryOpen((open) => !open)}
            style={({ pressed }) => [styles.historyToggle, pressed && styles.pressed]}
            testID="sale-adjustments-history-toggle"
          >
            <AppText variant="control" style={styles.historyTitle}>
              {SALE_REFUND_HISTORY_TITLE}
            </AppText>
            <AppText variant="metadata" style={styles.soft}>
              {String(summary.history.length)}
            </AppText>
            <SymbolView
              name={historyOpen ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
              size={13}
              tintColor={foregroundSoft}
            />
          </Pressable>
          {historyOpen && (
            <View style={styles.historyList} testID="sale-adjustments-history-list">
              {summary.history.map((adjustment) => (
                <HistoryCard
                  adjustment={adjustment}
                  compensation={findSaleAdjustmentReversal(adjustments, adjustment.id)}
                  key={adjustment.id}
                  refusalOutcome={describeSaleRefundRefusalOutcome(adjustment, findSaleRefundOutflow(adjustments, adjustment.id))}
                  syncLine={describeSaleAdjustmentSync(adjustment, syncStates.get(adjustment.id))}
                />
              ))}
            </View>
          )}
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
        tone={pending?.kind === 'VOID' || pending?.kind === 'MONEY_NOT_RETURNED' ? 'destructive' : 'neutral'}
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

function correctLabel(line: SaleRefundSummaryLine): string {
  if (line.kind === 'ADDITIONAL_REFUND') return SALE_ADDITIONAL_REFUND_RETURNED_ACTION;
  if (line.kind === 'CORRECTION') return SALE_CORRECTION_UNDO_ACTION;
  return SALE_REFUND_CORRECT_ACTION;
}

function correctHint(line: SaleRefundSummaryLine): string {
  if (line.kind === 'ADDITIONAL_REFUND') return 'Enregistrer que le client a rendu cet argent';
  if (line.kind === 'CORRECTION') return 'Indiquer que cette correction a été saisie par erreur';
  return 'Indiquer si ce remboursement a été saisi par erreur ou si l’argent a été rendu';
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
        body: `Elle ne comptera nulle part et restera dans l’historique des corrections.${restockSentence(action.adjustment)}`,
        confirm: 'Annuler la saisie',
      };
    case 'MONEY_NOT_RETURNED':
      return {
        title: 'Aucun argent rendu ?',
        body: `Confirmez seulement si les ${amount} n’ont jamais été rendus au client. La saisie refusée sera annulée : elle ne comptera nulle part et restera dans l’historique des corrections.${restockSentence(action.adjustment)}`,
        confirm: 'Rien n’a été rendu',
      };
    case 'MONEY_RETURNED': {
      const day = action.adjustment.refundedAt ? formatSaleAdjustmentDay(action.adjustment.refundedAt) : '';
      return {
        title: 'Enregistrer l’argent rendu ?',
        body: `BeautIzzy enregistre un remboursement supplémentaire de ${amount} (${formatSaleAdjustmentMethods(action.adjustment)}), le ${day}. Il compte dans la caisse, même s’il dépasse le prix de la vente. La saisie refusée reste dans l’historique des corrections, annulée.${restockSentence(action.adjustment)}`,
        confirm: 'Enregistrer le remboursement',
      };
    }
  }
}

/** The refused record's restocked units leave the stock again on either answer; the additional refund moves none. */
function restockSentence(adjustment: SaleAdjustment): string {
  return adjustment.items.some((item) => item.restock)
    ? ' Les unités remises en stock par cette saisie en seront retirées.'
    : '';
}

/** `1 novembre 2026 · Carte 12,00 €` — when the money left, and how. */
function describeLineMeta(line: SaleRefundSummaryLine): string | undefined {
  const { adjustment } = line;
  if (line.kind === 'TO_REFUND') return SALE_REFUND_SUMMARY_TO_REFUND_NOTE;
  if (line.kind === 'CORRECTION') return undefined;
  return [adjustment.refundedAt ? formatSaleAdjustmentDay(adjustment.refundedAt) : undefined, formatSaleAdjustmentMethods(adjustment)]
    .filter(Boolean)
    .join(' · ');
}

function describeLineItems(adjustment: SaleAdjustment): string | undefined {
  if (adjustment.items.length === 0) return undefined;
  return adjustment.items
    .map((item) => `${item.productName} ${formatSaleQuantity(item.quantity)} · ${item.restock ? 'remis en stock' : 'pas de retour en stock'}`)
    .join('\n');
}

interface SummaryCardProps {
  readonly summary: SaleRefundSummary;
  readonly syncStates: ReadonlyMap<string, SaleAdjustmentSyncState>;
  readonly awaitingAnswer: boolean;
  readonly renderActions: (line: SaleRefundSummaryLine) => ReactNode;
}

function SummaryCard({ summary, syncStates, awaitingAnswer, renderActions }: SummaryCardProps) {
  const hasMoney = summary.lines.some((line) => line.amountCents > 0);
  const overRefund = summary.state === 'OVER' && !awaitingAnswer;
  return (
    <GroupedSurface testID="sale-refund-summary">
      <View style={styles.summaryBody}>
        {hasMoney && (
          <AmountRow
            label={SALE_REFUND_SUMMARY_ORIGINAL_LABEL}
            testID="sale-refund-summary-original"
            value={formatEuroCents(summary.originalCents)}
          />
        )}
        {summary.lines.map((line) => (
          <SummaryLine
            actions={renderActions(line)}
            key={line.adjustment.id}
            line={line}
            syncLine={describeSaleAdjustmentCashRegisterSync(line.adjustment, syncStates.get(line.adjustment.id))}
          />
        ))}
        {hasMoney && summary.refundedCents > 0 && (
          <>
            <GroupedSeparator inset={0} />
            <AmountRow
              emphasized
              label={SALE_REFUND_SUMMARY_TOTAL_LABEL}
              testID="sale-refund-summary-total"
              value={formatEuroCents(summary.refundedCents)}
            />
            <AmountRow
              label={SALE_REFUND_SUMMARY_NET_LABEL}
              testID="sale-refund-summary-net"
              value={formatSaleNetAmount(summary.netCents)}
            />
          </>
        )}
        {summary.state === 'FULL' && (
          <View accessible style={styles.stateBadge} testID="sale-refund-summary-full">
            <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={14} tintColor={semanticColors.accent} />
            <AppText variant="chip" style={styles.accent}>
              {SALE_REFUND_SUMMARY_FULL}
            </AppText>
          </View>
        )}
        {overRefund && (
          <View
            accessible
            accessibilityLabel={`Attention, ${formatSaleOverRefund(summary.overRefundCents)}. ${SALE_REFUND_SUMMARY_OVER_NOTE}`}
            style={styles.warning}
            testID="sale-refund-summary-over"
          >
            <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={14} tintColor={rose.rose600} />
            <View style={styles.warningCopy}>
              <AppText variant="control" style={styles.warningTitle}>
                {formatSaleOverRefund(summary.overRefundCents)}
              </AppText>
              <AppText variant="metadata" style={styles.warningText}>
                {SALE_REFUND_SUMMARY_OVER_NOTE}
              </AppText>
            </View>
          </View>
        )}
      </View>
    </GroupedSurface>
  );
}

function AmountRow({
  label,
  value,
  testID,
  emphasized = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
  readonly emphasized?: boolean;
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.amountRow} testID={testID}>
      <AppText variant={emphasized ? 'control' : 'body'} style={emphasized ? styles.strong : styles.soft}>
        {label}
      </AppText>
      <AppText selectable variant="control" style={styles.amount}>
        {value}
      </AppText>
    </View>
  );
}

function SummaryLine({
  line,
  syncLine,
  actions,
}: {
  readonly line: SaleRefundSummaryLine;
  readonly syncLine: SaleAdjustmentSyncLine | undefined;
  readonly actions: ReactNode;
}) {
  const { adjustment } = line;
  const label = SALE_REFUND_LINE_LABELS[line.kind];
  const amount = line.kind === 'CORRECTION' ? undefined : formatSaleRefundAmount(line.amountCents);
  const meta = describeLineMeta(line);
  const items = describeLineItems(adjustment);
  const muted = line.kind === 'TO_REFUND';
  return (
    <View style={styles.line} testID={`sale-adjustment-${adjustment.id}`}>
      <View
        accessible
        accessibilityLabel={[label, amount, meta, items, adjustment.note ? `Note : ${adjustment.note}` : undefined, syncLine?.text]
          .filter(Boolean)
          .join(', ')}
        style={styles.lineHeader}
      >
        <View style={styles.lineCopy}>
          <AppText variant="body" style={styles.strong} testID={`sale-adjustment-${adjustment.id}-status`}>
            {label}
          </AppText>
          {meta && (
            <AppText variant="metadata" style={styles.soft} testID={`sale-adjustment-${adjustment.id}-refunded`}>
              {meta}
            </AppText>
          )}
          {items && (
            <AppText variant="metadata" style={styles.soft}>
              {items}
            </AppText>
          )}
          {adjustment.note && (
            <AppText variant="metadata" style={styles.soft}>
              {`Note : ${adjustment.note}`}
            </AppText>
          )}
          {syncLine && (
            <AppText
              accessibilityLiveRegion={syncLine.tone === 'warning' ? 'polite' : undefined}
              variant="metadata"
              style={syncLine.tone === 'warning' ? styles.error : styles.soft}
              testID={`sale-adjustment-${adjustment.id}-${syncLine.tone === 'warning' ? 'refused' : 'sync'}`}
            >
              {syncLine.text}
            </AppText>
          )}
        </View>
        {amount && (
          <AppText selectable variant="control" style={[styles.amount, muted && styles.soft]} testID={`sale-adjustment-${adjustment.id}-amount`}>
            {amount}
          </AppText>
        )}
      </View>
      {actions}
    </View>
  );
}

function LineLink({
  label,
  onPress,
  testID,
  accessibilityHint,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly accessibilityHint: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.lineLink, pressed && styles.pressed]}
      testID={testID}
    >
      <AppText variant="metadata" style={styles.accent}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PendingActions({
  adjustment,
  onSettleToday,
  onSettleOtherDay,
  onVoid,
}: {
  readonly adjustment: SaleAdjustment;
  readonly onSettleToday: (() => void) | undefined;
  readonly onSettleOtherDay: (() => void) | undefined;
  readonly onVoid: () => void;
}) {
  return (
    <View style={styles.lineActions}>
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
      <AppButton onPress={onVoid} testID={`sale-adjustment-${adjustment.id}-void`} title="Annuler cette saisie" variant="tertiary" />
    </View>
  );
}

/** A refund the server refused: highlighted, with the one question that resolves it. */
function RefusalCard({
  adjustment,
  onMoneyReturned,
  onMoneyNotReturned,
}: {
  readonly adjustment: SaleAdjustment;
  readonly onMoneyReturned: () => void;
  readonly onMoneyNotReturned: () => void;
}) {
  const amount = formatEuroCents(getSaleAdjustmentAmountCents(adjustment));
  const day = adjustment.refundedAt ? formatSaleAdjustmentDay(adjustment.refundedAt) : undefined;
  const context = [`Remboursement de ${amount}`, day ? `du ${day}` : undefined].filter(Boolean).join(' ');
  return (
    <View style={styles.refusal} testID={`sale-adjustment-${adjustment.id}-resolution`}>
      <View accessible style={styles.refusalCopy}>
        <AppText variant="control" style={styles.warningTitle}>
          {`${context} · ${formatSaleAdjustmentMethods(adjustment)}`}
        </AppText>
        <AppText variant="metadata" style={styles.warningText} testID={`sale-adjustment-${adjustment.id}-refusal`}>
          {SALE_ADJUSTMENT_REFUSED_COPY}
        </AppText>
      </View>
      <AppText accessibilityRole="header" variant="body" style={styles.strong}>
        {SALE_REFUND_REFUSAL_QUESTION}
      </AppText>
      <AppButton
        onPress={onMoneyReturned}
        testID={`sale-adjustment-${adjustment.id}-money-returned`}
        title={SALE_REFUND_MONEY_RETURNED_ACTION}
        variant="secondary"
      />
      <AppButton
        onPress={onMoneyNotReturned}
        testID={`sale-adjustment-${adjustment.id}-money-not-returned`}
        title={SALE_REFUND_MONEY_NOT_RETURNED_ACTION}
        variant="tertiary"
      />
    </View>
  );
}

interface HistoryCardProps {
  readonly adjustment: SaleAdjustment;
  readonly syncLine: SaleAdjustmentSyncLine | undefined;
  readonly compensation?: SaleAdjustment;
  readonly refusalOutcome?: string;
}

/** One audit record: what it said, its status, its dates and links — never counted. */
function HistoryCard({ adjustment, syncLine, compensation, refusalOutcome }: HistoryCardProps) {
  const amountCents = getSaleAdjustmentAmountCents(adjustment);
  const signed =
    amountCents === 0 ? '' : `${adjustment.kind === 'REVERSAL' ? '+' : '−'}${formatEuroCents(amountCents)}`;
  const status = formatSaleAdjustmentStatus(adjustment);
  const voided = adjustment.status === 'VOIDED';
  // A compensated refund (and a voided one) no longer counts: its amount reads struck through.
  const struck = voided || compensation !== undefined;
  return (
    <View style={styles.historyCard} testID={`sale-adjustment-history-${adjustment.id}`}>
      <View
        accessible
        accessibilityLabel={[status, signed, SALE_ADJUSTMENT_REASON_LABELS[adjustment.reason], struck ? 'non compté' : undefined]
          .filter(Boolean)
          .join(', ')}
        style={styles.lineHeader}
      >
        <View style={styles.lineCopy}>
          <AppText variant="eyebrow" style={styles.soft} testID={`sale-adjustment-history-${adjustment.id}-status`}>
            {status.toUpperCase()}
          </AppText>
          <AppText variant="metadata" style={styles.strong}>
            {SALE_ADJUSTMENT_REASON_LABELS[adjustment.reason]}
          </AppText>
        </View>
        {signed.length > 0 && (
          <AppText variant="metadata" style={[styles.amount, struck && styles.strike]} testID={`sale-adjustment-history-${adjustment.id}-amount`}>
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
        <AppText variant="metadata" style={styles.soft} testID={`sale-adjustment-history-${adjustment.id}-refunded`}>
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
      <View style={styles.transitions} testID={`sale-adjustment-history-${adjustment.id}-history`}>
        {getSaleAdjustmentHistory(adjustment).map((step) => (
          <AppText key={step.kind} variant="metadata" style={styles.soft}>
            {`${SALE_ADJUSTMENT_TRANSITION_LABELS[step.kind]} le ${formatSaleAdjustmentInstant(step.at)}`}
          </AppText>
        ))}
      </View>
      {compensation && (
        <AppText variant="metadata" style={styles.accent} testID={`sale-adjustment-history-${adjustment.id}-compensated`}>
          {compensation.reason === 'REFUND_RETURNED'
            ? `Argent rendu le ${formatSaleAdjustmentDay(compensation.refundedAt ?? compensation.recordedAt)} (${formatSaleAdjustmentMethods(compensation)})`
            : `Saisie erronée, corrigée le ${formatSaleAdjustmentInstant(compensation.recordedAt)}`}
        </AppText>
      )}
      {refusalOutcome && (
        <AppText variant="metadata" style={styles.soft} testID={`sale-adjustment-history-${adjustment.id}-refusal-outcome`}>
          {refusalOutcome}
        </AppText>
      )}
      {syncLine && (
        <AppText
          variant="metadata"
          style={syncLine.tone === 'warning' ? styles.error : styles.soft}
          testID={`sale-adjustment-history-${adjustment.id}-${syncLine.tone === 'warning' ? 'refused' : 'sync'}`}
        >
          {syncLine.text}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  soft: { color: foregroundSoft },
  strong: { color: semanticColors.foreground },
  accent: { color: semanticColors.accent },
  error: { color: rose.rose600 },
  pressed: { opacity: 0.6 },
  summaryBody: { gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  amountRow: { alignItems: 'baseline', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  amount: { color: semanticColors.foreground, flexShrink: 0, fontVariant: ['tabular-nums'] },
  line: { gap: spacing.xs },
  lineHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  lineCopy: { flex: 1, gap: 2, minWidth: 0 },
  lineLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  lineActions: { gap: spacing.xs, marginTop: spacing.xs },
  stateBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  warning: {
    alignItems: 'flex-start',
    backgroundColor: semanticColors.surfaceRose,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  warningCopy: { flex: 1, gap: 2 },
  warningTitle: { color: rose.rose700 },
  warningText: { color: rose.rose700 },
  refusal: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose200,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.base,
  },
  refusalCopy: { gap: spacing.xs },
  history: { gap: spacing.sm },
  historyToggle: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  historyTitle: { color: semanticColors.foreground, flex: 1 },
  historyList: { gap: spacing.sm },
  historyCard: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    opacity: 0.85,
    padding: spacing.base,
  },
  strike: { color: foregroundSoft, textDecorationLine: 'line-through' },
  transitions: { gap: 1, marginTop: spacing.xs },
});
