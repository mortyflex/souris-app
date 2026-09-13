import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';
import type { SaleCompletionResult, SaleDraft } from '@/domain/sales';
import {
  ProductCatalogProvider,
  useProductCatalog,
} from '@/features/products/session/ProductCatalogProvider';

import { SaleSessionProvider, useSaleSession } from '../SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

const shampoo: Product = {
  id: 'product-a',
  businessId: 'business-test',
  name: 'Shampooing',
  price: 20,
  stockQuantity: 5,
  active: true,
};

const care: Product = {
  id: 'product-b',
  businessId: 'business-test',
  name: 'Soin',
  price: 18,
  stockQuantity: 1,
  active: true,
};

function draft(
  id: string,
  lines: SaleDraft['lines'],
  clientId?: string,
  appointmentId?: string,
  payment?: SaleDraft['payment'],
): SaleDraft {
  return {
    id,
    businessId: 'business-test',
    clientId,
    appointmentId,
    ...(payment ? { payment } : {}),
    completedAt: new Date(2026, 8, 11, 10),
    lines,
  };
}

function describePayment(sale: { readonly payment?: SaleDraft['payment'] } | undefined): string {
  return sale?.payment ? `${sale.payment.cardAmountCents}/${sale.payment.cashAmountCents}` : 'none';
}

function Probe() {
  const { addProduct, deleteProduct, getProductById, updateProduct } = useProductCatalog();
  const { sales, getSaleById, completeSale } = useSaleSession();
  const [lastResult, setLastResult] = useState<SaleCompletionResult | null>(null);
  const a = getProductById('product-a');
  const b = getProductById('product-b');
  const firstSale = getSaleById('sale-1');

  const run = (input: SaleDraft) => setLastResult(completeSale(input));

  return (
    <>
      <Text testID="sales-count">{sales.length}</Text>
      <Text testID="stock-a">{a?.stockQuantity ?? 'gone'}</Text>
      <Text testID="stock-b">{b?.stockQuantity ?? 'gone'}</Text>
      <Text testID="result">
        {lastResult === null
          ? 'none'
          : lastResult.ok
            ? 'ok'
            : lastResult.issues.map((issue) => issue.kind).join(',')}
      </Text>
      <Text testID="sale-1">
        {firstSale
          ? firstSale.items
              .map((item) => `${item.productName}:${item.unitPrice}:${item.quantity}`)
              .join('|')
          : 'missing'}
      </Text>
      <Text testID="sale-1-client">{firstSale?.clientId ?? 'walk-in'}</Text>
      <Text testID="sale-1-appointment">{firstSale?.appointmentId ?? 'standalone'}</Text>
      <Text testID="sale-linked-appointment">
        {getSaleById('sale-linked')?.appointmentId ?? 'standalone'}
      </Text>
      <Text testID="sale-linked-payment">{describePayment(getSaleById('sale-linked'))}</Text>
      <Text testID="sale-paid-payment">{describePayment(getSaleById('sale-paid'))}</Text>
      <Pressable
        testID="sell-paid-mixed"
        onPress={() =>
          run(
            draft(
              'sale-paid',
              [{ id: 'sale-paid-item-1', productId: 'product-a', quantity: 1 }],
              undefined,
              undefined,
              { cardAmountCents: 1500, cashAmountCents: 500 },
            ),
          )
        }
      />
      <Pressable
        testID="seed"
        onPress={() => {
          addProduct(shampoo);
          addProduct(care);
        }}
      />
      <Pressable
        testID="sell-a-2"
        onPress={() => run(draft('sale-1', [{ id: 'sale-1-item-1', productId: 'product-a', quantity: 2 }], 'client-1'))}
      />
      <Pressable
        testID="sell-b-2"
        onPress={() => run(draft('sale-2', [{ id: 'sale-2-item-1', productId: 'product-b', quantity: 2 }]))}
      />
      <Pressable
        testID="sell-a-and-b-2"
        onPress={() =>
          run(
            draft('sale-3', [
              { id: 'sale-3-item-1', productId: 'product-a', quantity: 1 },
              { id: 'sale-3-item-2', productId: 'product-b', quantity: 2 },
            ]),
          )
        }
      />
      <Pressable
        testID="sell-missing"
        onPress={() =>
          run(
            draft('sale-4', [
              { id: 'sale-4-item-1', productId: 'product-a', quantity: 1 },
              { id: 'sale-4-item-2', productId: 'product-deleted', quantity: 1 },
            ]),
          )
        }
      />
      <Pressable
        testID="sell-linked"
        onPress={() =>
          run(
            draft(
              'sale-linked',
              [{ id: 'sale-linked-item-1', productId: 'product-a', quantity: 1 }],
              'client-1',
              'appointment-1',
            ),
          )
        }
      />
      <Pressable
        testID="sell-walk-in"
        onPress={() => run(draft('sale-5', [{ id: 'sale-5-item-1', productId: 'product-a', quantity: 1 }]))}
      />
      <Pressable
        testID="rename-a"
        onPress={() => a && updateProduct({ ...a, name: 'Nouveau nom', price: 30, active: false })}
      />
      <Pressable testID="delete-a" onPress={() => deleteProduct('product-a')} />
    </>
  );
}

function renderSession() {
  return render(
    <TestPersistenceProvider>
      <ProductCatalogProvider>
      <SaleSessionProvider>
        <Probe />
      </SaleSessionProvider>
      </ProductCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe('SaleSessionProvider', () => {
  it('starts with no Sales — there is no legacy Sale source', async () => {
    const view = await renderSession();
    expect(view.getByTestId('sales-count').props.children).toBe(0);
  });

  it('completes a Sale and decrements stock as one operation', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-a-2')));

    expect(view.getByTestId('result').props.children).toBe('ok');
    expect(view.getByTestId('sales-count').props.children).toBe(1);
    expect(view.getByTestId('stock-a').props.children).toBe(3);
    expect(view.getByTestId('sale-1').props.children).toBe('Shampooing:20:2');
    expect(view.getByTestId('sale-1-client').props.children).toBe('client-1');
  });

  it('refuses insufficient stock: no Sale, stock unchanged', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-b-2')));

    expect(view.getByTestId('result').props.children).toBe('INSUFFICIENT_STOCK');
    expect(view.getByTestId('sales-count').props.children).toBe(0);
    expect(view.getByTestId('stock-b').props.children).toBe(1);
  });

  it('decrements nothing when ONE of several Products is insufficient', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-a-and-b-2')));

    expect(view.getByTestId('result').props.children).toBe('INSUFFICIENT_STOCK');
    expect(view.getByTestId('sales-count').props.children).toBe(0);
    expect(view.getByTestId('stock-a').props.children).toBe(5);
    expect(view.getByTestId('stock-b').props.children).toBe(1);
  });

  it('fails atomically when a referenced Product is missing', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-missing')));

    expect(view.getByTestId('result').props.children).toBe('PRODUCT_MISSING');
    expect(view.getByTestId('sales-count').props.children).toBe(0);
    expect(view.getByTestId('stock-a').props.children).toBe(5);
  });

  it('keeps the Appointment link of a Revente Sale and leaves other Sales standalone', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-a-2')));
    await act(async () => fireEvent.press(view.getByTestId('sell-linked')));

    expect(view.getByTestId('sales-count').props.children).toBe(2);
    expect(view.getByTestId('sale-1-appointment').props.children).toBe('standalone');
    expect(view.getByTestId('sale-linked-appointment').props.children).toBe('appointment-1');
    expect(view.getByTestId('stock-a').props.children).toBe(2);
  });

  it('persists a standalone Sale payment through the session and keeps linked Sales without one', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-paid-mixed')));
    await act(async () => fireEvent.press(view.getByTestId('sell-linked')));

    expect(view.getByTestId('result').props.children).toBe('ok');
    expect(view.getByTestId('sale-paid-payment').props.children).toBe('1500/500');
    expect(view.getByTestId('sale-linked-payment').props.children).toBe('none');
    expect(view.getByTestId('stock-a').props.children).toBe(3);
  });

  it('keeps walk-in Sales valid and stock-affecting', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));

    await act(async () => fireEvent.press(view.getByTestId('sell-walk-in')));

    expect(view.getByTestId('result').props.children).toBe('ok');
    expect(view.getByTestId('sales-count').props.children).toBe(1);
    expect(view.getByTestId('stock-a').props.children).toBe(4);
  });

  it('preserves historical snapshots through Product edits, deactivation and deletion', async () => {
    const view = await renderSession();
    await act(async () => fireEvent.press(view.getByTestId('seed')));
    await act(async () => fireEvent.press(view.getByTestId('sell-a-2')));

    await act(async () => fireEvent.press(view.getByTestId('rename-a')));
    expect(view.getByTestId('sale-1').props.children).toBe('Shampooing:20:2');

    await act(async () => fireEvent.press(view.getByTestId('delete-a')));
    expect(view.getByTestId('stock-a').props.children).toBe('gone');
    expect(view.getByTestId('sales-count').props.children).toBe(1);
    expect(view.getByTestId('sale-1').props.children).toBe('Shampooing:20:2');
  });
});
