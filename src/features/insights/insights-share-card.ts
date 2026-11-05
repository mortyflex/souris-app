// BeautIzzy — « Tops & tendances » share card model
//
// What the social card shows for the period and the category the
// professional is looking at. It is built from the already-computed
// `BusinessInsights` — never from a capture of the receipt — and computes
// nothing: amounts and rankings are only worded.
//
// For every category the card shows the SAME podium as the ticket — same
// places, people, metrics and order, worded once by
// `buildInsightsRankingSections(…, 'public')`: clients as `Amel B.` (first
// name, last-name initial, never a full last name), `195 €`, `12 rdv`.
//
// Client spending follows the professional's choice in the ticket
// (`clientSpending`): visible, the podium writes `195 €`; hidden, the SAME
// mask as the ticket (`•••• €`) — masked in the model, so the exported image
// can never hold the number. The model records which choice it was built
// with, so the ticket can refuse to capture a card that does not match the
// choice on screen.
//
// Business turnover stays private: the model carries NO « Encaissé » and NO
// « Panier moyen » amount — the card draws a frosted placeholder where they
// would be, so no exported pixel can reveal them. The completed count stays. Financial conflicts are an in-app diagnostic: the card never
// mentions them (their value is already outside the activity figures).

import type { Client } from '@/domain/clients';
import type { BusinessInsights } from '@/domain/insights';

import {
  buildInsightsRankingSections,
  plural,
  type ClientSpendingVisibility,
  type InsightsRankingKey,
  type InsightsRankingSection,
} from './insights-receipt';

/**
 * What the card shows under the summary:
 *
 *   ranking  the podium of the category on screen, exactly as the ticket
 *            shows it; an empty category keeps its quiet message
 *   calm     an empty period: no ranking at all, one gentle line
 */
export type InsightsShareHighlight =
  | { readonly kind: 'ranking'; readonly section: InsightsRankingSection }
  | { readonly kind: 'calm'; readonly message: string };

export interface InsightsShareCardModel {
  /** `Septembre 2026` — the period being browsed, exactly as the receipt labels it. */
  readonly periodLabel: string;
  /** `28 rendez-vous` — the completed count, worded short for the card. */
  readonly completedAppointments: string;
  readonly highlight: InsightsShareHighlight;
  /** The client-spending choice this card was worded with. */
  readonly clientSpending: ClientSpendingVisibility;
}

export const INSIGHTS_SHARE_CALM_MESSAGE = 'Une période toute calme ✨';

function highlightFor(
  insights: BusinessInsights,
  category: InsightsRankingKey,
  getClient: (clientId: string) => Client | undefined,
  clientSpending: ClientSpendingVisibility,
): InsightsShareHighlight {
  if (insights.isEmpty) return { kind: 'calm', message: INSIGHTS_SHARE_CALM_MESSAGE };
  const section = buildInsightsRankingSections(insights, getClient, 'public', clientSpending).find(
    (candidate) => candidate.key === category,
  );
  if (!section) throw new Error(`Unknown insights category: ${category}`);
  return { kind: 'ranking', section };
}

export function buildInsightsShareCard(
  insights: BusinessInsights,
  periodLabel: string,
  category: InsightsRankingKey,
  getClient: (clientId: string) => Client | undefined,
  clientSpending: ClientSpendingVisibility = 'visible',
): InsightsShareCardModel {
  return {
    periodLabel,
    completedAppointments: plural(insights.completedAppointmentCount, 'rendez-vous', 'rendez-vous'),
    highlight: highlightFor(insights, category, getClient, clientSpending),
    clientSpending,
  };
}
