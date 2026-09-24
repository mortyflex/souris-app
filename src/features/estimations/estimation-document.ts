// Souris — Estimation tarifaire (document model)
//
// A lightweight, recipient-agnostic, NON-PERSISTED price estimate built from
// the professional's configured Service prices: « combien coûterait cette
// combinaison de prestations ? ». Addressed to nobody in particular, so the
// same image can be shared with anyone. Not a client record, not an
// appointment, not a quote (devis), not an invoice, not a contract.
//
// Pure wording of what the Résumé and the generated paper show:
//
//   header    ESTIMATION TARIFAIRE · Business name · generation date (the
//             local day it was generated — document metadata only, never an
//             appointment, booking or validity date; no time)
//   lines     one line per selected Service, in selection order: its catalog
//             name and its CURRENT catalog price. A TECHNIQUE is its
//             commercial name — phases, durations and requiresStaff are
//             internal scheduling details and never appear.
//   total     « Total estimé »: Σ selected catalog prices, in exact cents
//   footer    the indicative disclaimer · « Créé avec » + the Souris wordmark
//
// No recipient: no Client name, no « Cliente » / « Pour » section, no blank
// placeholder. Only data Souris genuinely stores: no address, no legal identifier, no
// validity period, no HT / TVA / TTC split — the stored Service price is the
// one authoritative amount. Nothing here reads or writes a session.

import type { Service } from '@/domain/appointments';
import { eurosToCents, formatCompactEuroCents } from '@/shared/lib/money';

export const ESTIMATION_TITLE = 'ESTIMATION TARIFAIRE';
export const ESTIMATION_TOTAL_LABEL = 'Total estimé';
export const ESTIMATION_DISCLAIMER =
  'Estimation indicative basée sur les prestations sélectionnées.';
export const ESTIMATION_BRANDING = 'Créé avec';

export interface EstimationLine {
  readonly key: string;
  readonly label: string;
  readonly price: string;
  readonly accessibilityLabel: string;
}

export interface EstimationDocumentModel {
  readonly title: string;
  readonly businessName: string;
  readonly dateLabel: string;
  readonly lines: readonly EstimationLine[];
  readonly totalLabel: string;
  readonly total: string;
  readonly totalCents: number;
  readonly disclaimer: string;
  readonly branding: string;
}

export interface EstimationDocumentInput {
  readonly businessName: string;
  /** The selected catalog Services, in selection order. */
  readonly services: readonly Pick<Service, 'id' | 'name' | 'price'>[];
  /** The local day the estimation is generated (generation date only). */
  readonly date: Date;
}

/** Σ selected catalog prices, in exact integer cents. */
export function getEstimationTotalCents(
  services: readonly Pick<Service, 'price'>[],
): number {
  return services.reduce((total, service) => total + eurosToCents(service.price), 0);
}

/** `24 septembre 2026`: the local civil date, never a UTC conversion. */
export function formatEstimationDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** `115 €`, `42,50 €`: exact, cents only when there are some. */
export function formatEstimationPrice(euros: number): string {
  return formatCompactEuroCents(eurosToCents(euros));
}

export function buildEstimationDocument({
  businessName,
  services,
  date,
}: EstimationDocumentInput): EstimationDocumentModel {
  const totalCents = getEstimationTotalCents(services);
  const total = formatCompactEuroCents(totalCents);
  return {
    title: ESTIMATION_TITLE,
    businessName,
    dateLabel: formatEstimationDate(date),
    lines: services.map((service, index) => {
      const price = formatEstimationPrice(service.price);
      return {
        key: `${index}-${service.id}`,
        label: service.name,
        price,
        accessibilityLabel: `${service.name}, ${price}`,
      };
    }),
    totalLabel: ESTIMATION_TOTAL_LABEL,
    total,
    totalCents,
    disclaimer: ESTIMATION_DISCLAIMER,
    branding: ESTIMATION_BRANDING,
  };
}
