// BeautIzzy — Estimation tarifaire (document model)
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
//             name and its CURRENT catalog price. A Service selected several
//             times (« Coupe femme ×3 ») is ONE line at its first position,
//             named with its quantity and priced quantity × catalog price, in
//             exact cents — the wording of the appointment selection footer
//             (`formatSelectedServiceNames`). A TECHNIQUE is its commercial
//             name — phases, durations and requiresStaff are internal
//             scheduling details and never appear.
//   total     « Total estimé »: Σ selected catalog prices, every occurrence
//             counted, in exact cents
//   footer    the indicative disclaimer · « Créé avec » + the BeautIzzy wordmark
//
// No recipient: no Client name, no « Cliente » / « Pour » section, no blank
// placeholder. Only data BeautIzzy genuinely stores: no address, no legal identifier, no
// validity period, no HT / TVA / TTC split — the stored Service price is the
// one authoritative amount. Nothing here reads or writes a session.

import type { Service } from '@/domain/appointments';
import { formatServiceQuantity } from '@/features/appointments/editor/presentation';
import { eurosToCents, formatCompactEuroCents } from '@/shared/lib/money';

export const ESTIMATION_TITLE = 'ESTIMATION TARIFAIRE';
export const ESTIMATION_TOTAL_LABEL = 'Total estimé';
export const ESTIMATION_DISCLAIMER =
  'Estimation indicative basée sur les prestations sélectionnées.';
export const ESTIMATION_BRANDING = 'Créé avec';

export interface EstimationLine {
  readonly key: string;
  /** `Coupe femme`, or `Coupe femme ×3` when the Service is selected several times. */
  readonly label: string;
  /** How many times the Service is selected (1 at least). */
  readonly quantity: number;
  /** quantity × current catalog price. */
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
  /** The selected catalog Services, in selection order: one entry per occurrence. */
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

/**
 * The selected occurrences grouped by Service, at the first position of each:
 * `[Coupe, Soin, Coupe]` → `[Coupe ×2, Soin]`. The line amount is computed in
 * integer cents (quantity × catalog price), never by multiplying euros.
 */
function groupOccurrences(
  services: EstimationDocumentInput['services'],
): readonly { readonly service: EstimationDocumentInput['services'][number]; readonly quantity: number }[] {
  const groups = new Map<string, { service: EstimationDocumentInput['services'][number]; quantity: number }>();
  for (const service of services) {
    const group = groups.get(service.id);
    if (group) group.quantity += 1;
    else groups.set(service.id, { service, quantity: 1 });
  }
  return [...groups.values()];
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
    lines: groupOccurrences(services).map(({ service, quantity }) => {
      const price = formatCompactEuroCents(eurosToCents(service.price) * quantity);
      return {
        key: service.id,
        label: quantity > 1 ? `${service.name} ${formatServiceQuantity(quantity)}` : service.name,
        quantity,
        price,
        // « quantité 3 », as the catalogue card says it.
        accessibilityLabel:
          quantity > 1 ? `${service.name}, quantité ${quantity}, ${price}` : `${service.name}, ${price}`,
      };
    }),
    totalLabel: ESTIMATION_TOTAL_LABEL,
    total,
    totalCents,
    disclaimer: ESTIMATION_DISCLAIMER,
    branding: ESTIMATION_BRANDING,
  };
}
