// BeautIzzy — « Résumé du jour » receipt model
//
// Turns the domain day summary (`getAppointmentDaySummary`) into the French
// text the receipt renders. « Résumé de la semaine » (`week-summary-receipt.ts`)
// words the same summary for a week with the same figures (`buildSummaryMetrics`). Every amount, duration and count comes from the
// domain; this file only words them. No React: the receipt component renders
// the model as is and computes nothing.

import type { AppointmentDaySummary } from '@/domain/appointments';
import {
  formatAppointmentServiceSummary,
  formatAppointmentTime,
  formatDurationMinutes,
} from '@/features/appointments/presentation';
import { formatEuroCents } from '@/shared/lib/money';

export interface DaySummaryReceiptRow {
  readonly key: string;
  readonly time: string;
  readonly serviceLabel: string;
  readonly clientLabel: string;
  readonly amount: string;
  readonly collected: boolean;
  readonly accessibilityLabel: string;
}

export interface DaySummaryReceiptMetric {
  readonly key: 'collected' | 'remaining' | 'duration' | 'averageBasket';
  readonly label: string;
  readonly value: string;
}

/** One outcome line of « Résumé de la semaine »: `Réalisés  14`. */
export interface DaySummaryReceiptActivity {
  readonly key: 'completed' | 'planned' | 'cancelled' | 'noShow';
  readonly label: string;
  readonly value: string;
  readonly accessibilityLabel: string;
}

export interface DaySummaryReceiptModel {
  /** `Résumé du jour` / `Résumé de la semaine` — the header of the paper. */
  readonly title: string;
  /** `Lundi 21 septembre` / `21 – 27 septembre 2026` */
  readonly dateLabel: string;
  /** `Aucun rendez-vous` / `1 rendez-vous` / `7 rendez-vous` */
  readonly countLabel: string;
  readonly isEmpty: boolean;
  readonly rows: readonly DaySummaryReceiptRow[];
  /** Weekly only: the outcome lines, printed in place of the Appointment list. */
  readonly activity?: readonly DaySummaryReceiptActivity[];
  readonly potentialRevenue: string;
  readonly metrics: readonly DaySummaryReceiptMetric[];
}

/** `Lundi 21 septembre` — the full civil date, never abbreviated on the receipt. */
export function formatDaySummaryDate(day: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(day);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDaySummaryCount(count: number): string {
  return count === 0 ? 'Aucun rendez-vous' : `${count} rendez-vous`;
}

/** The breakdown under « CA potentiel »: the same four lines for a day and for a week. */
export function buildSummaryMetrics(summary: AppointmentDaySummary): readonly DaySummaryReceiptMetric[] {
  return [
    { key: 'collected', label: 'Déjà encaissé', value: formatEuroCents(summary.collectedCents) },
    {
      key: 'remaining',
      label: 'Reste à encaisser',
      value: formatEuroCents(summary.remainingToCollectCents),
    },
    { key: 'duration', label: 'Temps total', value: formatDurationMinutes(summary.totalDurationMinutes) },
    { key: 'averageBasket', label: 'Panier moyen', value: formatEuroCents(summary.averageBasketCents) },
  ];
}

export function buildDaySummaryReceipt(
  summary: AppointmentDaySummary,
  day: Date,
  getClientLabel: (clientId: string) => string,
): DaySummaryReceiptModel {
  const rows = summary.rows.map(({ appointment, expectedTotalCents, collected }) => {
    const time = formatAppointmentTime(appointment.startAt);
    const serviceLabel = formatAppointmentServiceSummary(appointment);
    const clientLabel = getClientLabel(appointment.clientId);
    const amount = formatEuroCents(expectedTotalCents);
    return {
      key: appointment.id,
      time,
      serviceLabel,
      clientLabel,
      amount,
      collected,
      accessibilityLabel: [time, serviceLabel, clientLabel, amount, collected ? 'encaissé' : undefined]
        .filter(Boolean)
        .join(', '),
    };
  });

  return {
    title: 'Résumé du jour',
    dateLabel: formatDaySummaryDate(day),
    countLabel: formatDaySummaryCount(summary.appointmentCount),
    isEmpty: summary.appointmentCount === 0,
    rows,
    potentialRevenue: formatEuroCents(summary.potentialRevenueCents),
    metrics: buildSummaryMetrics(summary),
  };
}
