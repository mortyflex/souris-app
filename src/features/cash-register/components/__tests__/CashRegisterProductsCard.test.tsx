import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  compareCashRegisterValues,
  type CashRegisterComparison,
  type CashRegisterProductSummary,
} from '@/domain/cash-register';
import { formatEuroCents } from '@/shared/lib/money';
import { statePillTones } from '@/shared/ui/StatePill';

import { CashRegisterProductsCard, DIRECT_SALES_LABEL, REVENTE_NOTE } from '../CashRegisterProductsCard';
import {
  CashRegisterComparisonNote,
  CashRegisterTrendBadge,
  CashRegisterTrendNote,
  trendTones,
} from '../CashRegisterTrendBadge';
import { foregroundSoft } from '@/shared/ui/theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const comparison: CashRegisterComparison = {
  reference: 'PREVIOUS_MONTH',
  elapsed: true,
  current: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 29, 14, 35) },
  previous: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 29, 14, 35) },
};

const summary: CashRegisterProductSummary = {
  unitCount: 12,
  standaloneUnitCount: 7,
  appointmentUnitCount: 5,
  standaloneCollectedCents: 12_600,
};

describe('CashRegisterProductsCard', () => {
  it('renders nothing when the period sold nothing and has no unit trend', async () => {
    const view = await render(
      <CashRegisterProductsCard
        summary={{ unitCount: 0, standaloneUnitCount: 0, appointmentUnitCount: 0, standaloneCollectedCents: 0 }}
        testID="products"
      />,
    );
    expect(view.toJSON()).toBeNull();
  });

  it('shows the units, where they were sold, the unit trend and the direct sales, each spoken', async () => {
    const view = await render(
      <CashRegisterProductsCard
        summary={summary}
        testID="products"
        unitTrend={compareCashRegisterValues(12, 9, comparison)}
      />,
    );

    expect(view.getByText('Produits vendus')).toBeTruthy();
    expect(view.getByTestId('products-units').props.children).toBe('12 unités');
    expect(view.getByTestId('products-split').props.children).toBe('7 en vente directe · 5 pendant des rendez-vous');
    expect(view.getByTestId('products-trend-badge-value').props.children).toBe('+3');
    expect(view.getByTestId('products-trend-reference').props.children).toBe('vs 1er–29 sept.');
    expect(view.getByTestId('products-direct-value').props.children).toBe(formatEuroCents(12_600));
    expect(view.getByText(DIRECT_SALES_LABEL)).toBeTruthy();
    expect(view.getByText(REVENTE_NOTE)).toBeTruthy();

    expect(view.getByTestId('products-summary').props.accessibilityLabel).toBe(
      'Produits vendus, 12 unités. 7 en vente directe · 5 pendant des rendez-vous. En hausse de 3 unités par rapport à la période du 1er au 29 septembre',
    );
    expect(view.getByTestId('products-direct').props.accessibilityLabel).toBe(
      `${DIRECT_SALES_LABEL} : ${formatEuroCents(12_600)}. ${REVENTE_NOTE}`,
    );
    // The badge is decoration for the spoken card: the summary groups it.
    expect(view.getByTestId('products-summary').props.accessible).toBe(true);
  });

  it('stays visible, trend only, when the period sold nothing but the reference did', async () => {
    const view = await render(
      <CashRegisterProductsCard
        summary={{ unitCount: 0, standaloneUnitCount: 0, appointmentUnitCount: 0, standaloneCollectedCents: 0 }}
        testID="products"
        unitTrend={compareCashRegisterValues(0, 4, comparison)}
      />,
    );
    expect(view.getByTestId('products-units').props.children).toBe('Aucune unité');
    expect(view.getByTestId('products-trend-badge-value').props.children).toBe('−4');
    expect(view.queryByTestId('products-split')).toBeNull();
    expect(view.queryByTestId('products-note')).toBeNull();
  });
});

describe('CashRegisterTrendBadge', () => {
  it('uses the existing state tones: mint for a rise, rose for a fall, neutral when stable', async () => {
    expect(trendTones).toEqual({
      UP: statePillTones.positive,
      DOWN: statePillTones.exception,
      FLAT: statePillTones.neutral,
    });
    const view = await render(
      <>
        <CashRegisterTrendBadge direction="UP" label="+12,4 %" testID="up" />
        <CashRegisterTrendBadge direction="DOWN" label="−8,0 %" testID="down" />
        <CashRegisterTrendBadge direction="FLAT" label="Stable" testID="flat" />
        <CashRegisterTrendNote testID="year" trend={compareCashRegisterValues(10_800, 10_000, comparison)!} unit="cents" />
      </>,
    );
    expect(StyleSheet.flatten(view.getByTestId('up').props.style).backgroundColor).toBe(statePillTones.positive.fill);
    expect(StyleSheet.flatten(view.getByTestId('down').props.style).backgroundColor).toBe(statePillTones.exception.fill);
    expect(StyleSheet.flatten(view.getByTestId('flat').props.style).backgroundColor).toBe(statePillTones.neutral.fill);
    expect(view.getByTestId('up-value').props.children).toBe('+12,4 %');
    expect(view.getByTestId('year-value').props.children).toMatch(/^\+8,0\s% vs 1er–29 sept\.$/);
  });
});

describe('CashRegisterComparisonNote', () => {
  it('is one soft metadata sentence next to a small glyph, with no tone and no banner', async () => {
    const view = await render(
      <CashRegisterComparisonNote testID="note">Historique insuffisant pour comparer avec septembre</CashRegisterComparisonNote>,
    );
    const note = view.getByTestId('note');
    expect(view.getByTestId('note-text').props.children).toBe('Historique insuffisant pour comparer avec septembre');
    expect(StyleSheet.flatten(view.getByTestId('note-text').props.style)).toMatchObject({ color: foregroundSoft, flex: 1 });
    // No fill of its own: it reads as part of the card, never as a warning.
    expect(StyleSheet.flatten(note.props.style).backgroundColor).toBeUndefined();
    expect(StyleSheet.flatten(note.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
  });
});
