// BeautIzzy — wording of Sale corrections and refunds
//
// Plain French for professionals who are not accountants. Two promises are
// kept everywhere: BeautIzzy RECORDS a refund, it never moves money; and a
// pending refund is not money given back yet.

import {
  getSaleAdjustmentAmountCents,
  isSaleRefundOutflow,
  type SaleAdjustment,
  type SaleAdjustmentIssue,
  type SaleAdjustmentReason,
  type SaleAdjustmentTransitionKind,
} from '@/domain/sales';
import type { SaleAdjustmentSyncState } from '@/persistence/sync/sale-adjustment-sync';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';

import type { SaleRefundSummaryLineKind } from './summary';

/** Which flow the professional opened from the Sale detail. */
export type SaleAdjustmentIntent = 'refund' | 'correct' | 'cancel';

export const SALE_ADJUSTMENT_INTENT_TITLES: Readonly<Record<SaleAdjustmentIntent, string>> = {
  refund: 'Rembourser',
  correct: 'Corriger une erreur',
  cancel: 'Rembourser intégralement',
};

export const SALE_ADJUSTMENT_REASON_LABELS: Readonly<Record<SaleAdjustmentReason, string>> = {
  NOT_DELIVERED: 'Produit facturé mais non remis',
  WRONG_PRODUCT: 'Mauvais produit enregistré',
  WRONG_QUANTITY: 'Mauvaise quantité',
  RETURN: 'Retour du produit',
  CUSTOMER_REFUND: 'Geste commercial / remboursement',
  SALE_CANCELLED: 'Remboursement intégral de la vente',
  RECORDED_IN_ERROR: 'Remboursement saisi par erreur, jamais versé',
  REFUND_RETURNED: 'Argent du remboursement rendu',
  OTHER: 'Autre raison',
};

/** The reasons offered by each flow, the most likely first. */
export const SALE_ADJUSTMENT_INTENT_REASONS: Readonly<Record<SaleAdjustmentIntent, readonly SaleAdjustmentReason[]>> = {
  refund: ['RETURN', 'CUSTOMER_REFUND', 'OTHER'],
  correct: ['WRONG_PRODUCT', 'NOT_DELIVERED', 'WRONG_QUANTITY', 'OTHER'],
  cancel: ['SALE_CANCELLED'],
};

/**
 * « Remis en stock » never starts on, whatever the reason: money given back
 * says nothing about where the product physically is (kept by the client,
 * returned damaged, never handed over). The professional turns it on, line by
 * line, only for units actually back on the shelf; the review states it.
 */
export const SALE_ADJUSTMENT_RESTOCK_NOTE =
  'Activez « Remis en stock » seulement pour les produits physiquement revenus en boutique et revendables.';

export const SALE_ADJUSTMENT_NO_TRANSFER_NOTE =
  'BeautIzzy enregistre le remboursement dans votre caisse. Il n’effectue aucun virement ni remboursement par carte : rendez l’argent comme d’habitude.';
export const SALE_ADJUSTMENT_ORIGINAL_KEPT_NOTE = 'La vente d’origine reste enregistrée telle quelle.';
export const SALE_ADJUSTMENT_PENDING_NOTE =
  'Un remboursement à effectuer n’apparaît dans la caisse qu’une fois marqué comme remboursé.';
export const SALE_ADJUSTMENT_NO_MONEY_NOTE =
  'Aucun encaissement n’a été enregistré pour cette vente : seule une correction des quantités ou du stock est possible.';
export const SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE =
  'Ce produit a été vendu pendant un rendez-vous qui n’est pas encore encaissé : retirez-le directement depuis le rendez-vous.';
export const SALE_ADJUSTMENT_REVENTE_NOTE =
  'Le paiement du rendez-vous reste inchangé : le remboursement apparaît à part dans la caisse, le jour où il a lieu.';

export function formatSaleAdjustmentStatus(adjustment: SaleAdjustment): string {
  if (isSaleRefundOutflow(adjustment)) return 'Remboursement supplémentaire';
  if (adjustment.kind === 'REVERSAL') {
    return adjustment.reason === 'REFUND_RETURNED' ? 'Remboursement rendu' : 'Correction de saisie';
  }
  if (getSaleAdjustmentAmountCents(adjustment) === 0) {
    return adjustment.status === 'VOIDED' ? 'Correction annulée' : 'Correction';
  }
  switch (adjustment.status) {
    case 'PENDING':
      return 'À rembourser';
    case 'SETTLED':
      return 'Remboursé';
    case 'VOIDED':
      return 'Saisie annulée';
  }
}

export const SALE_ADJUSTMENT_TRANSITION_LABELS: Readonly<Record<SaleAdjustmentTransitionKind, string>> = {
  RECORDED_PENDING: 'Enregistré, à rembourser',
  RECORDED_SETTLED: 'Enregistré',
  SETTLED: 'Marqué comme remboursé',
  VOIDED: 'Saisie annulée',
};

// --- Synchronization status, always said APART from the financial status ----
//
// « Remboursé » says the money left; whether the server has the record is a
// second, separate line. A refusal is never worded as synchronized, and a
// record this device has not sent yet says so.

export interface SaleAdjustmentSyncLine {
  readonly tone: 'neutral' | 'warning';
  readonly text: string;
}

export const SALE_ADJUSTMENT_SYNC_PENDING_COPY = 'Pas encore synchronisé : enregistré sur cet appareil, en attente d’envoi.';
export const SALE_ADJUSTMENT_SYNCED_COPY = 'Synchronisé';
export const SALE_ADJUSTMENT_REFUSED_COPY =
  'Refusé par le serveur : un autre appareil a déjà remboursé cette vente et le total dépasserait ce qu’elle a encaissé. Ce remboursement n’est pas synchronisé.';
export const SALE_REFUND_OUTFLOW_REFUSED_COPY =
  'Pas encore accepté par le serveur (il doit être mis à jour) : ce remboursement reste enregistré sur cet appareil et compte déjà dans la caisse.';

export function describeSaleAdjustmentSync(
  adjustment: Pick<SaleAdjustment, 'id' | 'kind'>,
  state: SaleAdjustmentSyncState | undefined,
): SaleAdjustmentSyncLine | undefined {
  switch (state) {
    case 'PENDING':
      return { tone: 'neutral', text: SALE_ADJUSTMENT_SYNC_PENDING_COPY };
    case 'SYNCED':
      return { tone: 'neutral', text: SALE_ADJUSTMENT_SYNCED_COPY };
    case 'REFUSED':
      return {
        tone: 'warning',
        text: isSaleRefundOutflow(adjustment) ? SALE_REFUND_OUTFLOW_REFUSED_COPY : SALE_ADJUSTMENT_REFUSED_COPY,
      };
    default:
      return undefined;
  }
}

/**
 * The short note of a line whose refund is not settled with the server — a Caisse
 * line, or a line of the Sale refund summary. A synchronized record says nothing:
 * success never takes room; only what waits or needs a decision is said.
 */
export function describeSaleAdjustmentCashRegisterSync(
  adjustment: Pick<SaleAdjustment, 'id' | 'kind'>,
  state: SaleAdjustmentSyncState | undefined,
): SaleAdjustmentSyncLine | undefined {
  if (state === 'PENDING') return { tone: 'neutral', text: 'Pas encore synchronisé' };
  if (state !== 'REFUSED') return undefined;
  return isSaleRefundOutflow(adjustment)
    ? { tone: 'warning', text: 'En attente du serveur' }
    : { tone: 'warning', text: 'Refusé par le serveur : à vérifier' };
}

// --- Resolving a server refusal --------------------------------------------

export const SALE_REFUND_REFUSAL_QUESTION = 'L’argent a-t-il réellement été rendu au client ?';
export const SALE_REFUND_MONEY_RETURNED_ACTION = 'Oui, l’argent a été rendu';
export const SALE_REFUND_MONEY_NOT_RETURNED_ACTION = 'Non, l’argent n’a pas été rendu';

/** What became of a refused record, once resolved (VOIDED after being settled). */
export function describeSaleRefundRefusalOutcome(
  adjustment: SaleAdjustment,
  outflow: SaleAdjustment | undefined,
): string | undefined {
  if (adjustment.kind !== 'REFUND' || adjustment.status !== 'VOIDED' || !adjustment.settledAt) return undefined;
  // A settled refund is voided only after a server refusal (domain `voidSaleAdjustment`).
  return outflow
    ? `Refusé par le serveur · argent rendu : enregistré comme remboursement supplémentaire le ${formatSaleAdjustmentInstant(outflow.recordedAt)}.`
    : 'Refusé par le serveur · argent non rendu : saisie annulée, rien n’est compté.';
}

// --- The refund summary of the Sale detail ---------------------------------

export const SALE_REFUND_SUMMARY_TITLE = 'Remboursements';
export const SALE_REFUND_SUMMARY_ORIGINAL_LABEL = 'Vente initiale';
export const SALE_REFUND_SUMMARY_TOTAL_LABEL = 'Total remboursé';
export const SALE_REFUND_SUMMARY_NET_LABEL = 'Solde de la vente';
export const SALE_REFUND_SUMMARY_FULL = 'Entièrement remboursé';
export const SALE_REFUND_SUMMARY_OVER_NOTE = 'Le montant rendu dépasse le prix initial de la vente.';
export const SALE_REFUND_SUMMARY_TO_REFUND_NOTE = 'Pas encore rendu · non compté';
export const SALE_REFUND_HISTORY_TITLE = 'Historique des corrections';

export const SALE_REFUND_LINE_LABELS: Readonly<Record<SaleRefundSummaryLineKind, string>> = {
  REFUND: 'Remboursement',
  ADDITIONAL_REFUND: 'Remboursement supplémentaire',
  TO_REFUND: 'À rembourser',
  CORRECTION: 'Correction',
};

/** `4,00 € remboursés en trop` */
export function formatSaleOverRefund(overRefundCents: number): string {
  return `${formatEuroCents(overRefundCents)} remboursés en trop`;
}

/** `−12,00 €`, `0,00 €` — a refund always reads as money going out. */
export function formatSaleRefundAmount(cents: number): string {
  return cents === 0 ? formatEuroCents(0) : `−${formatEuroCents(cents)}`;
}

/** The signed balance: `6,00 €`, or `−4,00 €` when more was given back. */
export function formatSaleNetAmount(netCents: number): string {
  return netCents < 0 ? `−${formatEuroCents(-netCents)}` : formatEuroCents(netCents);
}

/** Shown on the review step of any refund that gives money back. */
export const SALE_ADJUSTMENT_OTHER_DEVICE_NOTE =
  'Si cette vente est aussi remboursée sur un autre appareil pas encore synchronisé, ce remboursement pourra être refusé par le serveur. BeautIzzy vous demandera alors si l’argent a réellement été rendu : rien ne sera effacé sans votre confirmation.';

/** `Carte 10,00 € · Espèces 22,00 €`, only the methods used. */
export function formatSaleAdjustmentMethods(adjustment: Pick<SaleAdjustment, 'refundCardCents' | 'refundCashCents'>): string {
  const parts: string[] = [];
  if (adjustment.refundCardCents > 0) parts.push(`${paymentMethodLabels.CARD} ${formatEuroCents(adjustment.refundCardCents)}`);
  if (adjustment.refundCashCents > 0) parts.push(`${paymentMethodLabels.CASH} ${formatEuroCents(adjustment.refundCashCents)}`);
  return parts.join(' · ');
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** `12 octobre 2026 à 14:05` */
export function formatSaleAdjustmentInstant(date: Date): string {
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${dayFormatter.format(date)} à ${time}`;
}

export function formatSaleAdjustmentDay(date: Date): string {
  return dayFormatter.format(date);
}

/** One concise sentence per issue; `nameOf` names a Sale line. */
export function describeSaleAdjustmentIssue(
  issue: SaleAdjustmentIssue,
  nameOf: (saleItemId: string) => string | undefined = () => undefined,
): string {
  switch (issue.kind) {
    case 'NOT_ELIGIBLE':
      return SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE;
    case 'EMPTY':
      return 'Choisissez au moins une unité ou un montant à rembourser.';
    case 'UNKNOWN_LINE':
    case 'DUPLICATE_LINE':
      return 'Une ligne de la vente n’est plus reconnue.';
    case 'INVALID_QUANTITY':
      return `${nameOf(issue.saleItemId) ?? 'Un produit'} : quantité invalide.`;
    case 'QUANTITY_EXCEEDS_REMAINING':
      return `${nameOf(issue.saleItemId) ?? 'Un produit'} : ${issue.remaining} unité${issue.remaining > 1 ? 's' : ''} au plus.`;
    case 'RESTOCK_PRODUCT_MISSING':
      return `${issue.productName} n’est plus au catalogue : impossible de le remettre en stock.`;
    case 'INVALID_AMOUNT':
      return 'Montant invalide.';
    case 'AMOUNT_EXCEEDS_REMAINING':
      return `Le remboursement ne peut pas dépasser ${formatEuroCents(issue.remaining)}.`;
    case 'INVALID_REFUND_DATE':
      return 'La date du remboursement doit être entre la vente et aujourd’hui.';
  }
}

// ---------------------------------------------------------------------------
// Refund method — never assumed (docs/domain/SALES.md §15)
// ---------------------------------------------------------------------------

/** The methods the professional may say the money ACTUALLY left (or came back) with. */
export type RefundMethodChoice = 'CARD' | 'CASH' | 'MIXED';

export const REFUND_METHOD_LABELS: Readonly<Record<RefundMethodChoice, string>> = {
  CARD: 'Carte',
  CASH: 'Espèces',
  MIXED: 'Carte et espèces',
};

/**
 * What is reliably known of how the original money came in: one method, both,
 * or nothing (`undefined`). Only information, never the refund method itself.
 */
export function describeOriginalPayment(methods: readonly ('CARD' | 'CASH')[] | undefined): string {
  if (methods === undefined || methods.length === 0) {
    return 'Mode du paiement d’origine inconnu : indiquez le mode réellement utilisé.';
  }
  if (methods.length > 1) return 'Payé à l’origine par carte et en espèces : indiquez le mode réellement utilisé.';
  return `Payé à l’origine ${methods[0] === 'CARD' ? 'par carte' : 'en espèces'}. Préselectionné : vérifiez qu’il correspond au remboursement réel.`;
}

export const REFUND_METHOD_REQUIRED = 'Indiquez le mode de remboursement réellement utilisé.';
export const REFUND_SPLIT_MISMATCH = 'La carte et les espèces doivent faire le montant à rembourser.';

// ---------------------------------------------------------------------------
// Correcting a SETTLED refund
// ---------------------------------------------------------------------------

/** What really happened to a refund marked as paid. */
export type RefundCorrectionMeaning = 'RECORDED_IN_ERROR' | 'REFUND_RETURNED' | 'REALLY_PAID';

export const REFUND_CORRECTION_MEANING_LABELS: Readonly<Record<RefundCorrectionMeaning, string>> = {
  RECORDED_IN_ERROR: 'Je l’ai saisi par erreur : l’argent n’a jamais été rendu',
  REFUND_RETURNED: 'L’argent du remboursement m’a été rendu depuis',
  REALLY_PAID: 'Le remboursement a bien eu lieu et reste acquis',
};

export const REFUND_REALLY_PAID_NOTE =
  'Un remboursement réellement effectué reste enregistré tel quel : il n’y a rien à annuler.';

