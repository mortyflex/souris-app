// « Encaissements » on the paper: ONE compact line for the product sales —
// « Ventes de produits (6 articles)  75,00 € » — whatever the number of
// different products sold, on the narrowest paper (iPhone SE) as on any other;
// enlarged text wraps instead of being cut.

import { act, render, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { getAppointmentDaySummary } from '@/domain/appointments';
import { getCashRegisterDayInterval, getCashRegisterPeriodBreakdown } from '@/domain/cash-register';
import type { Sale, SaleItem } from '@/domain/sales';
import { formatEuroCents } from '@/shared/lib/money';
import { getAppTextStyle } from '@/shared/ui/AppText';
import { foregroundSoft } from '@/shared/ui/theme';

import { DaySummaryReceipt, ENCASHMENT_LABEL_MIN_SCALE } from '../DaySummaryReceipt';
import { buildDaySummaryReceipt } from '../day-summary-receipt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const day = new Date(2026, 10, 9, 12);
/** The paper of an iPhone SE: the 375 pt window minus 26 pt on each side. */
const SE_PAPER_WIDTH = 375 - 2 * 26;

const line = (id: string, name: string, unitPrice: number, quantity: number): SaleItem => ({
  id,
  productId: id,
  productName: name,
  unitPrice,
  quantity,
});

/** Shampooing ×3 + Masque ×2 + Huile ×1 — and nine more products, one each. */
const sales: readonly Sale[] = [
  {
    id: 's1',
    businessId: 'b',
    completedAt: new Date(2026, 10, 9, 11),
    items: [line('shampoo', 'Shampooing', 10, 3), line('mask', 'Masque', 15, 2), line('oil', 'Huile', 15, 1)],
    payment: { paidAt: new Date(2026, 10, 9, 11), cardAmountCents: 7500, cashAmountCents: 0 },
  },
  {
    id: 's2',
    businessId: 'b',
    completedAt: new Date(2026, 10, 9, 15),
    items: Array.from({ length: 9 }, (_, index) => line(`p${index}`, `Vernis teinte ${index}`, 10, 1)),
    payment: { paidAt: new Date(2026, 10, 9, 15), cardAmountCents: 9000, cashAmountCents: 0 },
  },
];

/** The window under test; the React Native jest preset reports an enlarged `fontScale: 2` by default. */
async function withWindow<T>(window: { readonly width: number; readonly fontScale: number }, run: () => Promise<T>): Promise<T> {
  const device = Dimensions.get('window');
  Dimensions.set({ window: { ...device, ...window } });
  try {
    return await run();
  } finally {
    await act(async () => {
      Dimensions.set({ window: device });
    });
  }
}

function renderPaper(withSales: readonly Sale[]) {
  const sources = { appointments: [], sales: withSales };
  const model = buildDaySummaryReceipt(
    getAppointmentDaySummary(sources, day),
    day,
    () => 'Client',
    getCashRegisterPeriodBreakdown(sources, getCashRegisterDayInterval(day)),
  );
  return render(<DaySummaryReceipt model={model} width={SE_PAPER_WIDTH} />);
}

describe('DaySummaryReceipt — « Ventes de produits (N articles) »', () => {
  it('counts the articles inline, in the quieter metadata style, with the amount right-aligned', async () => {
    const view = await renderPaper(sales.slice(0, 1));
    const row = view.getByTestId('day-summary-encashment-productSales');
    expect(row.props.accessibilityLabel).toBe(`Ventes de produits, 6 articles, ${formatEuroCents(7500)}`);
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    });

    const label = view.getByTestId('day-summary-encashment-productSales-label');
    const count = within(label).getByTestId('day-summary-encashment-productSales-count');
    expect(count.props.children).toBe(' (6 articles)');
    // Smaller and secondary: the label leads, the counter follows.
    const countStyle = StyleSheet.flatten(count.props.style);
    expect(countStyle.fontSize).toBe(getAppTextStyle('metadata', 'ios').fontSize);
    expect(countStyle.fontSize).toBeLessThan(getAppTextStyle('body', 'ios').fontSize as number);
    expect(countStyle.color).toBe(foregroundSoft);
    expect(view.getByTestId('day-summary-encashment-productSales-value').props.children).toBe(formatEuroCents(7500));
  });

  it('keeps ONE line however many different products were sold: no product name on the paper', async () => {
    const view = await renderPaper(sales);
    const block = within(view.getByTestId('day-summary-encashment'));
    expect(view.getByTestId('day-summary-encashment-productSales-count').props.children).toBe(' (15 articles)');
    expect(block.queryByText(/Shampooing|Masque|Huile|Vernis/)).toBeNull();
    expect(view.queryByTestId('day-summary-encashment-productSales-detail')).toBeNull();
    // Rendez-vous, Ventes de produits, Total encaissé: three rows, never one per product.
    expect(block.getAllByTestId(/^day-summary-encashment-[a-zA-Z]+$/)).toHaveLength(3);
  });

  it('shows no counter without any article', async () => {
    const view = await renderPaper([]);
    expect(view.queryByTestId('day-summary-encashment-productSales-count')).toBeNull();
    expect(view.getByTestId('day-summary-encashment-productSales-label').props.children).toEqual([
      'Ventes de produits',
      false,
    ]);
  });

  it('on a narrow iPhone at the default text size: one line, the label shrinks a little, the amount never gives way', async () => {
    await withWindow({ width: 375, fontScale: 1 }, async () => {
      const view = await renderPaper(sales);
      const label = view.getByTestId('day-summary-encashment-productSales-label');
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
      expect(label.props.minimumFontScale).toBe(ENCASHMENT_LABEL_MIN_SCALE);
      expect(ENCASHMENT_LABEL_MIN_SCALE).toBeGreaterThanOrEqual(0.8);
      expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
      const value = view.getByTestId('day-summary-encashment-productSales-value');
      expect(value.props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(value.props.style).flexShrink).toBe(0);
    });
  });

  it('with enlarged text the label wraps instead: nothing is ever cut', async () => {
    await withWindow({ width: 375, fontScale: 1.6 }, async () => {
      const view = await renderPaper(sales);
      const label = view.getByTestId('day-summary-encashment-productSales-label');
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      expect(view.getByTestId('day-summary-encashment-productSales').props.accessibilityLabel).toBe(
        `Ventes de produits, 15 articles, ${formatEuroCents(16500)}`,
      );
    });
  });
});
