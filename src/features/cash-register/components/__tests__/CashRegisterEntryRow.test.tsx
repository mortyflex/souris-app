import { render } from '@testing-library/react-native';

import type { CashRegisterEntry } from '@/domain/cash-register';

import { CashRegisterEntryRow, WALK_IN_SALE_LABEL } from '../CashRegisterEntryRow';

const walkInSale: CashRegisterEntry = {
  kind: 'SALE',
  payment: { paidAt: new Date(2030, 0, 14, 10, 30), cardAmountCents: 0, cashAmountCents: 2500 },
  sale: {
    id: 'sale-walk-in',
    businessId: 'business-test',
    completedAt: new Date(2030, 0, 14, 10, 30),
    items: [],
  },
};

describe('CashRegisterEntryRow', () => {
  it('names a walk-in Sale « Vente sans client », shown and spoken', async () => {
    const view = await render(
      <CashRegisterEntryRow clientName={undefined} entry={walkInSale} period="day" />,
    );

    expect(WALK_IN_SALE_LABEL).toBe('Vente sans client');
    expect(view.getByText('Vente sans client')).toBeTruthy();
    expect(view.getByTestId('cash-register-entry-sale-walk-in').props.accessibilityLabel).toContain(
      '10:30, Vente sans client, ',
    );
  });
});
