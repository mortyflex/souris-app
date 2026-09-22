// Souris — « Tops & tendances » receipt model
//
// Turns the domain insights (`getBusinessInsights`) into the French text the
// receipt renders. Every amount, count and ranking comes from the domain;
// this file only words them. No React: the receipt component renders the
// model as is and computes nothing.
//
// This model is the PRIVATE, internal ticket: it names clients. A future
// shareable card must build its own sanitized model from `BusinessInsights`,
// never from this one or from a capture of the receipt.

import type { Client } from '@/domain/clients';
import type { BusinessInsights, InsightsPeriod, InsightsPeriodKind } from '@/domain/insights';
import { UNKNOWN_CLIENT_LABEL } from '@/features/clients/presentation';
import { formatEuroCents } from '@/shared/lib/money';

export interface InsightsRankingRow {
  readonly key: string;
  /** 1, 2 or 3 — the podium place. */
  readonly rank: 1 | 2 | 3;
  readonly label: string;
  readonly value: string;
  /** `Première place, Balayage, 18 prestations` */
  readonly accessibilityLabel: string;
}

export type InsightsRankingKey = 'services' | 'products' | 'spendingClients' | 'loyalClients';

/** ONE ranking category, self-contained: everything a podium needs to render it. */
export interface InsightsRankingSection {
  readonly key: InsightsRankingKey;
  /** `Top prestations` — rendered as an eyebrow. */
  readonly title: string;
  /** At most three, first place first. Never padded. */
  readonly rows: readonly InsightsRankingRow[];
  /** Shown in place of the podium when `rows` is empty. */
  readonly emptyMessage: string;
}

export interface InsightsReceiptModel {
  readonly isEmpty: boolean;
  /** `8 420,00 €` */
  readonly cashCollected: string;
  /** `32 rendez-vous réalisés` / `1 rendez-vous réalisé` */
  readonly completedAppointments: string;
  readonly averageAppointmentValue: string;
  /** Present only when the period holds at least one unresolved financial conflict. */
  readonly conflictNote?: string;
  /** Present only on a period with no activity at all: `Aucune activité sur cette période`. */
  readonly activityNote?: string;
  /** The four ranking categories, always, in carousel order. */
  readonly sections: readonly InsightsRankingSection[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dayMonthFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/**
 *   DAY    `22 sept. 2026`
 *   WEEK   `21 – 27 sept. 2026` · `28 sept. – 4 oct. 2026` · `28 déc. 2026 – 3 janv. 2027`
 *   MONTH  `Septembre 2026`
 *   YEAR   `2026`
 */
export function formatInsightsPeriod(period: InsightsPeriod): string {
  const { start } = period;
  switch (period.kind) {
    case 'DAY':
      return dayFormatter.format(start);
    case 'WEEK': {
      const sunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      if (start.getFullYear() !== sunday.getFullYear()) {
        return `${dayFormatter.format(start)} – ${dayFormatter.format(sunday)}`;
      }
      if (start.getMonth() !== sunday.getMonth()) {
        return `${dayMonthFormatter.format(start)} – ${dayFormatter.format(sunday)}`;
      }
      return `${start.getDate()} – ${dayFormatter.format(sunday)}`;
    }
    case 'MONTH':
      return capitalize(monthFormatter.format(start));
    case 'YEAR':
      return String(start.getFullYear());
  }
}

const NAVIGATION_LABELS: Readonly<Record<InsightsPeriodKind, { previous: string; next: string }>> = {
  DAY: { previous: 'Jour précédent', next: 'Jour suivant' },
  WEEK: { previous: 'Semaine précédente', next: 'Semaine suivante' },
  MONTH: { previous: 'Mois précédent', next: 'Mois suivant' },
  YEAR: { previous: 'Année précédente', next: 'Année suivante' },
};

export function getInsightsNavigationLabels(kind: InsightsPeriodKind) {
  return NAVIGATION_LABELS[kind];
}

/** `Amel B.` — first name and the initial of the last name, nothing more. */
export function formatInsightsClientName(client: Pick<Client, 'firstName' | 'lastName'> | undefined): string {
  if (!client) return UNKNOWN_CLIENT_LABEL;
  const firstName = client.firstName.trim();
  const initial = client.lastName?.trim().charAt(0).toUpperCase();
  return initial ? `${firstName} ${initial}.` : firstName;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** `0 rendez-vous réalisés`, `1 rendez-vous réalisé`, `32 rendez-vous réalisés`. */
export function formatCompletedAppointments(count: number): string {
  return plural(count, 'rendez-vous réalisé', 'rendez-vous réalisés');
}

const PLACES = ['Première place', 'Deuxième place', 'Troisième place'] as const;

function row(key: string, index: number, label: string, value: string): InsightsRankingRow {
  return {
    key,
    rank: (index + 1) as 1 | 2 | 3,
    label,
    value,
    accessibilityLabel: `${PLACES[index] ?? `${index + 1}e place`}, ${label}, ${value}`,
  };
}

export function buildInsightsReceipt(
  insights: BusinessInsights,
  getClient: (clientId: string) => Client | undefined,
): InsightsReceiptModel {
  const clientName = (clientId: string) => formatInsightsClientName(getClient(clientId));

  const sections: readonly InsightsRankingSection[] = [
    {
      key: 'services',
      title: 'Top prestations',
      rows: insights.topServices.map((service, index) =>
        row(service.serviceId, index, service.serviceName, plural(service.count, 'prestation', 'prestations')),
      ),
      emptyMessage: 'Aucune prestation sur cette période',
    },
    {
      key: 'products',
      title: 'Top produits',
      rows: insights.topProducts.map((product, index) =>
        row(product.productId, index, product.productName, plural(product.unitCount, 'unité', 'unités')),
      ),
      emptyMessage: 'Aucun produit vendu sur cette période',
    },
    {
      key: 'spendingClients',
      title: 'Clientes qui dépensent le plus',
      rows: insights.topSpendingClients.map((client, index) =>
        row(client.clientId, index, clientName(client.clientId), formatEuroCents(client.spendingCents)),
      ),
      emptyMessage: 'Aucune dépense sur cette période',
    },
    {
      key: 'loyalClients',
      title: 'Clientes les plus fidèles',
      rows: insights.topLoyalClients.map((client, index) =>
        row(
          client.clientId,
          index,
          clientName(client.clientId),
          plural(client.completedAppointmentCount, 'rendez-vous', 'rendez-vous'),
        ),
      ),
      emptyMessage: 'Aucun rendez-vous réalisé sur cette période',
    },
  ];

  const conflicts = insights.financialConflictCount;
  return {
    isEmpty: insights.isEmpty,
    cashCollected: formatEuroCents(insights.cash.totalCents),
    completedAppointments: formatCompletedAppointments(insights.completedAppointmentCount),
    averageAppointmentValue: formatEuroCents(insights.averageAppointmentValueCents),
    ...(conflicts > 0
      ? {
          conflictNote:
            conflicts === 1
              ? '1 rendez-vous avec un conflit financier à résoudre n’est pas compté dans l’activité.'
              : `${conflicts} rendez-vous avec un conflit financier à résoudre ne sont pas comptés dans l’activité.`,
        }
      : {}),
    ...(insights.isEmpty ? { activityNote: 'Aucune activité sur cette période' } : {}),
    sections,
  };
}
