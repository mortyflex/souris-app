import { formatCompactEuroCents } from '@/shared/lib/money';

import {
  ESTIMATION_DISCLAIMER,
  buildEstimationDocument,
  formatEstimationDate,
  getEstimationTotalCents,
} from '../estimation-document';

const services = [
  { id: 'service-coupe', name: 'Coupe brushing', price: 45 },
  { id: 'technique-balayage', name: 'Balayage 1', price: 70 },
  { id: 'service-soin', name: 'Soin profond', price: 12.5 },
];

function build(date = new Date(2026, 8, 24, 16, 30)) {
  return buildEstimationDocument({
    businessName: 'Maison Léa',
    services,
    date,
  });
}

function allText(model: ReturnType<typeof build>): string {
  return JSON.stringify(model);
}

describe('buildEstimationDocument', () => {
  it('titles the document « ESTIMATION TARIFAIRE » for the Business, on the local generation date', () => {
    const model = build();
    expect(model.title).toBe('ESTIMATION TARIFAIRE');
    expect(model.businessName).toBe('Maison Léa');
    expect(model.dateLabel).toBe('24 septembre 2026');
  });

  it('reads the civil local date, even just before midnight', () => {
    expect(formatEstimationDate(new Date(2026, 11, 31, 23, 59))).toBe('31 décembre 2026');
    expect(formatEstimationDate(new Date(2027, 0, 1, 0, 1))).toBe('1 janvier 2027');
  });

  it('addresses nobody: no Client name, no recipient section', () => {
    const model = build();
    expect(Object.keys(model).sort()).toEqual(
      ['branding', 'businessName', 'dateLabel', 'disclaimer', 'lines', 'title', 'total', 'totalCents', 'totalLabel'].sort(),
    );
    expect(allText(model)).not.toMatch(/client|\bpour\b|destinataire/i);
  });

  it('dates the generation day only: no time, no appointment or validity wording', () => {
    const model = build(new Date(2026, 8, 24, 16, 30));
    expect(model.dateLabel).toBe('24 septembre 2026');
    expect(allText(model)).not.toMatch(/16:30|16 h|rendez-vous|jusqu/i);
  });

  it('lists every selected Service in order, with its own catalog price', () => {
    const model = build();
    expect(model.lines.map((line) => [line.label, line.price])).toEqual([
      ['Coupe brushing', formatCompactEuroCents(4500)],
      ['Balayage 1', formatCompactEuroCents(7000)],
      ['Soin profond', formatCompactEuroCents(1250)],
    ]);
    expect(model.lines[1]?.accessibilityLabel).toBe(`Balayage 1, ${formatCompactEuroCents(7000)}`);
  });

  it('names a Service selected several times ONCE, at its first position, with its quantity and line price', () => {
    const [coupe, balayage, soin] = services as [typeof services[0], typeof services[0], typeof services[0]];
    const model = buildEstimationDocument({
      businessName: 'Maison Léa',
      // Coupe ×3, interleaved with the others: grouped at the first position.
      services: [coupe, balayage, coupe, soin, coupe],
      date: new Date(2026, 8, 24),
    });
    expect(model.lines.map((line) => [line.label, line.quantity, line.price])).toEqual([
      ['Coupe brushing ×3', 3, formatCompactEuroCents(13500)],
      ['Balayage 1', 1, formatCompactEuroCents(7000)],
      ['Soin profond', 1, formatCompactEuroCents(1250)],
    ]);
    expect(new Set(model.lines.map((line) => line.key)).size).toBe(3);
    // Spoken as the catalogue card says it: « quantité 3 ».
    expect(model.lines[0]?.accessibilityLabel).toBe(`Coupe brushing, quantité 3, ${formatCompactEuroCents(13500)}`);
    expect(model.lines[1]?.accessibilityLabel).toBe(`Balayage 1, ${formatCompactEuroCents(7000)}`);
    // Every occurrence counts in the total; the lines add up to it exactly.
    expect(model.totalCents).toBe(3 * 4500 + 7000 + 1250);
    expect(model.total).toBe(formatCompactEuroCents(21750));
  });

  it('prices repeated occurrences in exact cents, never by multiplying euros', () => {
    const model = buildEstimationDocument({
      businessName: 'Maison Léa',
      services: [
        { id: 'pose', name: 'Pose capsules', price: 0.1 },
        { id: 'pose', name: 'Pose capsules', price: 0.1 },
        { id: 'pose', name: 'Pose capsules', price: 0.1 },
      ],
      date: new Date(2026, 8, 24),
    });
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0]?.price).toBe(formatCompactEuroCents(30));
    expect(model.totalCents).toBe(30);
  });

  it('removing occurrences down to one reads the plain name again', () => {
    const model = buildEstimationDocument({
      businessName: 'Maison Léa',
      services: [services[0]!],
      date: new Date(2026, 8, 24),
    });
    expect(model.lines[0]).toMatchObject({ label: 'Coupe brushing', quantity: 1 });
  });

  it('totals the exact catalog prices as « Total estimé »', () => {
    const model = build();
    expect(model.totalLabel).toBe('Total estimé');
    expect(model.totalCents).toBe(12750);
    expect(model.total).toBe(formatCompactEuroCents(12750));
    // Floating-point euros never leak into the total.
    expect(getEstimationTotalCents([{ price: 0.1 }, { price: 0.2 }])).toBe(30);
  });

  it('shows whole euros without cents', () => {
    const model = buildEstimationDocument({
      businessName: 'Maison Léa',
      services: [services[0]!, services[1]!],
      date: new Date(2026, 8, 24),
    });
    expect(model.total).toBe(formatCompactEuroCents(11500));
    expect(model.total).not.toMatch(/,00/);
  });

  it('carries the indicative disclaimer and the BeautIzzy branding', () => {
    const model = build();
    expect(model.disclaimer).toBe(ESTIMATION_DISCLAIMER);
    expect(model.disclaimer).toBe('Estimation indicative basée sur les prestations sélectionnées.');
    expect(model.branding).toBe('Créé avec');
  });

  it('never words a formal quote, a validity, an acceptance or any tax', () => {
    const text = allText(build());
    expect(text).not.toMatch(/devis/i);
    expect(text).not.toMatch(/valable|validit/i);
    expect(text).not.toMatch(/signature|sign[ée]|bon pour accord|accept/i);
    expect(text).not.toMatch(/\bHT\b|\bTTC\b|\bTVA\b|taxe|293 B|SIRET/i);
  });
});
