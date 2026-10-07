// Souris — EstimationDocument: the style contract of the generated estimate.
//
// Semantic checks, no pixel snapshot: the content, the highlighted total in
// the shared lavender panel, the shared « Créé avec BeautIzzy » footer, wrapped
// (never truncated) names, the warm share-card paper, and fixed typography
// on the export surface.

import { render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { brandAssets } from '@/shared/ui/BrandMark';
import { CREATED_WITH_SOURIS_LABEL } from '@/shared/ui/CreatedWithSouris';
import { lavender, radii, semanticColors } from '@/shared/ui/theme';

import { EstimationDocument } from '../EstimationDocument';
import { buildEstimationDocument } from '../estimation-document';

const LONG_NAME = 'Balayage lumière naturelle avec soin profond et patine sur mesure';

const model = buildEstimationDocument({
  businessName: 'Maison Léa',
  services: [
    { id: 's1', name: 'Coupe brushing', price: 45 },
    { id: 's2', name: LONG_NAME, price: 70 },
  ],
  date: new Date(2026, 8, 24, 16, 30),
});

function style(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
}

function texts(view: Awaited<ReturnType<typeof render>>) {
  return view.container.queryAll((node) => node.type === 'Text');
}

describe('EstimationDocument', () => {
  it('renders every piece of the estimate, and nothing else', async () => {
    const view = await render(<EstimationDocument model={model} />);

    expect(view.getByTestId('estimation-document-title').props.children).toBe('ESTIMATION TARIFAIRE');
    expect(view.getByTestId('estimation-document-business').props.children).toBe('Maison Léa');
    expect(view.getByTestId('estimation-document-date').props.children).toBe('24 septembre 2026');
    expect(view.getByRole('header', { name: 'Prestations' })).toBeTruthy();
    expect(view.getByLabelText(`Coupe brushing, ${model.lines[0]!.price}`)).toBeTruthy();
    expect(view.getByLabelText(`${LONG_NAME}, ${model.lines[1]!.price}`)).toBeTruthy();
    expect(view.getByTestId('estimation-document-total').props.accessibilityLabel).toBe(
      `Total estimé, ${model.total}`,
    );
    expect(view.getByText('Estimation indicative basée sur les prestations sélectionnées.')).toBeTruthy();

    const all = texts(view)
      .map((node) => String(node.props.children))
      .join(' | ');
    expect(all).not.toMatch(/devis|valable|validit|signature|bon pour accord|TVA|\bHT\b|TTC|SIRET/i);
    expect(all).not.toMatch(/client|destinataire|\bPour\b|rendez-vous|16:30/i);
    // No analytics: no podium, no medal, no KPI.
    expect(view.queryByTestId(/podium/)).toBeNull();
  });

  it('is the interior only — no surface of its own — with a restrained BeautIzzy symbol on top', async () => {
    const view = await render(<EstimationDocument model={model} />);

    // The printer ticket or the share canvas brings the paper and its margins.
    const root = style(view.getByTestId('estimation-document'));
    expect(root.backgroundColor).toBeUndefined();
    expect(root.borderRadius).toBeUndefined();
    expect(root.padding ?? root.paddingHorizontal ?? root.paddingTop).toBeUndefined();
    const images = view.container.queryAll((node) => node.type === 'Image');
    const mark = images.find((image) => image.props.source === brandAssets.symbol.source);
    expect(mark).toBeDefined();
    expect(style(mark!).width).toBe(25);
    expect(style(view.getByTestId('estimation-document-business')).color).toBe(semanticColors.brandForeground);
    // No fixed height anywhere: a long estimation is a taller card.
    expect(style(view.getByTestId('estimation-document')).height).toBeUndefined();
  });

  it('makes « Total estimé » the focal point, in the shared lavender panel', async () => {
    const view = await render(<EstimationDocument model={model} />);

    const panel = style(view.getByTestId('estimation-document-total'));
    expect(panel.backgroundColor).toBe(lavender.lav050);
    expect(panel.borderRadius).toBe(radii.large);
    expect(panel.height).toBeUndefined();
    const value = view.getByTestId('estimation-document-total-value');
    expect(value.props.children).toBe(model.total);
    expect(style(value).color).toBe(semanticColors.brandForeground);
    // As large as the Souris display value, never clipped to one line.
    expect(style(value).fontSize).toBeGreaterThanOrEqual(30);
    expect(value.props.numberOfLines).toBeUndefined();
    expect(value.props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('wraps long Service names — never truncated, never shrunk', async () => {
    const view = await render(<EstimationDocument model={model} />);

    const name = within(view.getByTestId('estimation-document-line-1')).getByText(LONG_NAME);
    expect(name.props.numberOfLines).toBeUndefined();
    expect(name.props.adjustsFontSizeToFit).toBeUndefined();
    expect(style(view.getByTestId('estimation-document-line-1')).height).toBeUndefined();
    for (const node of texts(view)) expect(node.props.numberOfLines).toBeUndefined();
  });

  it('signs with the shared « Créé avec » + BeautIzzy logo footer', async () => {
    const view = await render(<EstimationDocument model={model} />);

    const footer = view.getByTestId('estimation-document-branding');
    expect(footer.props.accessibilityLabel).toBe(CREATED_WITH_SOURIS_LABEL);
    expect(within(footer).getByText('Créé avec')).toBeTruthy();
    const wordmark = view.container.queryAll(
      (node) => node.type === 'Image' && node.props.source === brandAssets.editorial.source,
    );
    expect(wordmark).toHaveLength(1);
    // Inside the footer, decorative: the footer speaks « Créé avec BeautIzzy » once.
    let ancestor = wordmark[0]!.parent;
    while (ancestor && ancestor.props.testID !== 'estimation-document-branding') ancestor = ancestor.parent;
    expect(ancestor).toBeTruthy();
    expect(wordmark[0]!.props.accessible).toBe(false);
    expect(style(wordmark[0]!).width).toBe(58);
  });

  it('follows the device text size on screen', async () => {
    const onScreen = await render(<EstimationDocument model={model} />);
    expect(texts(onScreen).length).toBeGreaterThan(8);
    for (const node of texts(onScreen)) expect(node.props.allowFontScaling).not.toBe(false);
  });

  it('pins the text size on the export surface', async () => {
    const exported = await render(<EstimationDocument fixedTypography model={model} testID="export" />);
    const exportTexts = texts(exported);
    expect(exportTexts.length).toBeGreaterThan(8);
    for (const node of exportTexts) expect(node.props.allowFontScaling).toBe(false);
  });
});
