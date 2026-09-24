// Souris — « Résumé de la semaine » receipt model
//
// The week's big picture on the SAME paper as « Résumé du jour »: the header
// names the week, the outcome lines replace the Appointment list, and the
// total + breakdown are worded by the day builder (`buildSummaryMetrics`).
// Every figure comes from the domain (`getAppointmentPeriodSummary`,
// `getAppointmentPeriodActivity`); this file only words them.

import type { AppointmentDaySummary, AppointmentPeriodActivity } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';

import {
  buildSummaryMetrics,
  formatDaySummaryCount,
  type DaySummaryReceiptActivity,
  type DaySummaryReceiptModel,
} from './day-summary-receipt';

const dayMonthFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayMonthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * The seven days from `firstDay`, months never abbreviated on the receipt:
 *
 *   `21 – 27 septembre 2026` · `28 septembre – 4 octobre 2026` ·
 *   `28 décembre 2026 – 3 janvier 2027`
 */
export function formatWeekSummaryRange(firstDay: Date): string {
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + 6);
  if (firstDay.getFullYear() !== lastDay.getFullYear()) {
    return `${dayMonthYearFormatter.format(firstDay)} – ${dayMonthYearFormatter.format(lastDay)}`;
  }
  if (firstDay.getMonth() !== lastDay.getMonth()) {
    return `${dayMonthFormatter.format(firstDay)} – ${dayMonthYearFormatter.format(lastDay)}`;
  }
  return `${firstDay.getDate()} – ${dayMonthYearFormatter.format(lastDay)}`;
}

function activityLine(
  key: DaySummaryReceiptActivity['key'],
  label: string,
  count: number,
  spoken: (count: number) => string,
): DaySummaryReceiptActivity {
  return { key, label, value: String(count), accessibilityLabel: spoken(count) };
}

export function buildWeekSummaryReceipt(
  summary: AppointmentDaySummary,
  activity: AppointmentPeriodActivity,
  firstDay: Date,
): DaySummaryReceiptModel {
  return {
    title: 'Résumé de la semaine',
    dateLabel: formatWeekSummaryRange(firstDay),
    countLabel: formatDaySummaryCount(summary.appointmentCount),
    isEmpty: summary.appointmentCount === 0,
    rows: [],
    activity: [
      activityLine('completed', 'Réalisés', activity.completedCount, (count) =>
        `${count} ${count > 1 ? 'rendez-vous réalisés' : 'rendez-vous réalisé'}`,
      ),
      activityLine('planned', 'Prévus', activity.plannedCount, (count) =>
        `${count} ${count > 1 ? 'rendez-vous prévus' : 'rendez-vous prévu'}`,
      ),
      activityLine('cancelled', 'Annulés', activity.cancelledCount, (count) =>
        `${count} ${count > 1 ? 'rendez-vous annulés' : 'rendez-vous annulé'}`,
      ),
      activityLine('noShow', 'Absences', activity.noShowCount, (count) =>
        `${count} ${count > 1 ? 'absences' : 'absence'}`,
      ),
    ],
    potentialRevenue: formatEuroCents(summary.potentialRevenueCents),
    metrics: buildSummaryMetrics(summary),
  };
}
