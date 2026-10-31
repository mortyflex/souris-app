import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  compareCashRegisterValues,
  type CashRegisterComparison,
  type CashRegisterProductSummary,
} from '@/domain/cash-register';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents, formatSignedEuroCents } from '@/shared/lib/money';
import { statePillTones } from '@/shared/ui/StatePill';

import {
  CashRegisterProductsCard,
  describeAppointmentRefunds,
  DIRECT_SALES_LABEL,
  NET_LABEL,
  REFUNDS_LABEL,
  OPEN_SALES_HINT,
  OPEN_SALES_LABEL,
  REVENTE_NOTE,
} from '../CashRegisterProductsCard';
import {
  CashRegisterComparisonNote,
  CashRegisterTrendBadge,
  CashRegisterTrendRow,
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

describe('CashRegisterProductsCard unit trend display', () => {
  const summaryLabel = (view: Awaited<ReturnType<typeof render>>) =>
    view.getByTestId('products-summary').props.accessibilityLabel as string;

  it('opens on the unit change, and one tap switches to percent and back, with one light haptic each', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await render(
      <CashRegisterProductsCard summary={summary} testID="products" unitTrend={compareCashRegisterValues(12, 9, comparison)} />,
    );
    const card = view.getByTestId('products-summary');
    expect(card.props.accessibilityRole).toBe('button');
    expect(view.getByTestId('products-trend-badge-value').props.children).toBe('+3');
    expect(summaryLabel(view)).toMatch(/En hausse de 3 unités par rapport à la période du 1er au 29 septembre$/);
    expect(card.props.accessibilityHint).toBe('Touchez pour afficher la variation en pourcentage');
    // The quiet ⇄ cue inside the pill says a tap switches the figure.
    expect(view.getByTestId('products-trend-badge-toggle-cue')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('products-trend-toggle'));
    });
    // (12 − 9) / 9.
    expect(view.getByTestId('products-trend-badge-value').props.children).toMatch(/^\+33,3\s%$/);
    expect(summaryLabel(view)).toMatch(/En hausse de 33,3\s% par rapport à la période du 1er au 29 septembre$/);
    expect(view.getByTestId('products-summary').props.accessibilityHint).toBe('Touchez pour afficher la variation en unités');
    expect(selection).toHaveBeenCalledTimes(1);
    // The rest of the card is unchanged.
    expect(view.getByTestId('products-units').props.children).toBe('12 unités');
    expect(view.getByTestId('products-trend-reference').props.children).toBe('vs 1er–29 sept.');

    // VoiceOver / TalkBack activate the card itself.
    await act(async () => {
      fireEvent(view.getByTestId('products-summary'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(view.getByTestId('products-trend-badge-value').props.children).toBe('+3');
    expect(selection).toHaveBeenCalledTimes(2);
    selection.mockRestore();
  });

  it('offers no switch when both displays would read the same: a zero reference, or « Stable »', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await render(
      <>
        <CashRegisterProductsCard summary={summary} testID="products" unitTrend={compareCashRegisterValues(5, 0, comparison)} />
        <CashRegisterProductsCard summary={summary} testID="flat" unitTrend={compareCashRegisterValues(4, 4, comparison)} />
      </>,
    );
    for (const id of ['products', 'flat']) {
      expect(view.getByTestId(`${id}-summary`).props.accessibilityRole).toBeUndefined();
      expect(view.getByTestId(`${id}-summary`).props.accessibilityHint).toBeUndefined();
      expect(view.getByTestId(`${id}-trend-toggle`).props.onPress).toBeUndefined();
      // No cue promising a switch that would change nothing.
      expect(view.queryByTestId(`${id}-trend-badge-toggle-cue`)).toBeNull();
    }
    expect(view.getByTestId('products-trend-badge-value').props.children).toBe('+5');
    expect(view.getByTestId('flat-trend-badge-value').props.children).toBe('Stable');
    expect(selection).not.toHaveBeenCalled();
    selection.mockRestore();
  });

  it('a card without a unit trend (Jour) has no switch and no pill', async () => {
    const view = await render(<CashRegisterProductsCard summary={summary} testID="products" />);
    expect(view.queryByTestId('products-trend-toggle')).toBeNull();
    expect(view.getByTestId('products-summary').props.accessibilityRole).toBeUndefined();
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
        <CashRegisterTrendRow
          testID="year"
          trend={compareCashRegisterValues(10_800, 10_000, comparison)!}
          unit="cents"
          variant="secondary"
        />
      </>,
    );
    expect(StyleSheet.flatten(view.getByTestId('up').props.style).backgroundColor).toBe(statePillTones.positive.fill);
    expect(StyleSheet.flatten(view.getByTestId('down').props.style).backgroundColor).toBe(statePillTones.exception.fill);
    expect(StyleSheet.flatten(view.getByTestId('flat').props.style).backgroundColor).toBe(statePillTones.neutral.fill);
    expect(view.getByTestId('up-value').props.children).toBe('+12,4 %');
    // The year-over-year pill: the same glyph tone on the plain neutral surface, soft ink, a size smaller.
    const year = StyleSheet.flatten(view.getByTestId('year-badge').props.style);
    expect(year.backgroundColor).toBe(statePillTones.neutral.fill);
    expect(year.minHeight).toBeLessThan(StyleSheet.flatten(view.getByTestId('up').props.style).minHeight as number);
    expect(StyleSheet.flatten(view.getByTestId('year-badge-value').props.style).color).toBe(foregroundSoft);
    // A plain badge carries no switch cue.
    expect(view.queryByTestId('up-toggle-cue')).toBeNull();
    expect(view.queryByTestId('year-badge-toggle-cue')).toBeNull();
    expect(view.getByTestId('year-badge-value').props.children).toMatch(/^\+8,0\s%$/);
    expect(view.getByTestId('year-reference').props.children).toBe('vs 1er–29 sept.');
    // Narrow phone, large text: the caption wraps under its pill rather than overflowing.
    expect(StyleSheet.flatten(view.getByTestId('year').props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(StyleSheet.flatten(view.getByTestId('year-reference').props.style)).toMatchObject({ flexShrink: 1 });
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

describe('CashRegisterProductsCard « Voir les ventes »', () => {
  it('ends with the one row that opens the sale history, spoken as a button, only when the caller offers it', async () => {
    const onOpenSales = jest.fn();
    const view = await render(
      <>
        <CashRegisterProductsCard onOpenSales={onOpenSales} summary={summary} testID="products" />
        <CashRegisterProductsCard summary={summary} testID="summary-only" />
      </>,
    );

    const open = view.getByTestId('products-open');
    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityLabel).toBe(OPEN_SALES_LABEL);
    expect(open.props.accessibilityHint).toBe(OPEN_SALES_HINT);
    expect(view.getByText(OPEN_SALES_LABEL)).toBeTruthy();
    // The existing groups are untouched: the row is a third, separate stop.
    expect(view.getByTestId('products-summary').props.accessibilityLabel).toContain('Produits vendus, 12 unités');
    expect(view.getByTestId('products-direct').props.accessibilityLabel).toContain(DIRECT_SALES_LABEL);

    await act(async () => {
      fireEvent.press(open);
    });
    expect(onOpenSales).toHaveBeenCalledTimes(1);

    expect(view.queryByTestId('summary-only-open')).toBeNull();
  });
});

describe('CashRegisterProductsCard refunds', () => {
  it('says what was given back and the net, and names the Revente share apart', async () => {
    const view = await render(
      <CashRegisterProductsCard
        refunds={{ refundCents: 4300, refundCardCents: 1800, refundCashCents: 2500, appointmentRefundCents: 2500, grossCents: 0, count: 2 }}
        summary={summary}
        testID="products"
      />,
    );
    expect(view.getByText(REFUNDS_LABEL)).toBeTruthy();
    expect(view.getByTestId('products-refunds-value').props.children).toBe(formatSignedEuroCents(-4300));
    expect(view.getByTestId('products-net-value').props.children).toBe(formatEuroCents(12_600 - 4300));
    expect(view.getByTestId('products-refunds-note').props.children).toBe(describeAppointmentRefunds(2500));
    expect(view.getByTestId('products-refunds').props.accessibilityLabel).toContain(`${NET_LABEL} : ${formatEuroCents(8300)}`);
  });

  it('stays visible for a period that only refunded, and says nothing about refunds otherwise', async () => {
    const empty = { unitCount: 0, standaloneUnitCount: 0, appointmentUnitCount: 0, standaloneCollectedCents: 0 };
    const view = await render(
      <>
        <CashRegisterProductsCard
          refunds={{ refundCents: 1800, refundCardCents: 1800, refundCashCents: 0, appointmentRefundCents: 0, grossCents: 0, count: 1 }}
          summary={empty}
          testID="refund-only"
        />
        <CashRegisterProductsCard
          refunds={{ refundCents: 0, refundCardCents: 0, refundCashCents: 0, appointmentRefundCents: 0, grossCents: 0, count: 0 }}
          summary={summary}
          testID="no-refund"
        />
      </>,
    );
    expect(view.getByTestId('refund-only-refunds-value').props.children).toBe(formatSignedEuroCents(-1800));
    expect(view.queryByTestId('refund-only-refunds-note')).toBeNull();
    expect(view.queryByTestId('no-refund-refunds')).toBeNull();
  });
});
