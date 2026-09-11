import {
  buildProductFromForm,
  EMPTY_PRODUCT_FORM,
  parseStockInput,
  toProductFormValues,
  validateProductForm,
  type ProductFormValues,
} from '../product-form';

describe('Product form rules', () => {
  it('parses whole-unit stock input', () => {
    expect(parseStockInput('0')).toBe(0);
    expect(parseStockInput('1')).toBe(1);
    expect(parseStockInput('12')).toBe(12);
    expect(parseStockInput('-1')).toBeUndefined();
    expect(parseStockInput('1.5')).toBeUndefined();
    expect(parseStockInput('NaN')).toBeUndefined();
    expect(parseStockInput('')).toBeUndefined();
  });

  it('accepts the supported euro price input and requires a name', () => {
    const values: ProductFormValues = {
      ...EMPTY_PRODUCT_FORM,
      name: 'Shampooing Test',
      price: '20,50',
      stockQuantity: '4',
    };

    expect(validateProductForm(values).valid).toBe(true);
    expect(validateProductForm({ ...values, name: '   ' }).valid).toBe(false);
    expect(validateProductForm({ ...values, price: '-2' }).valid).toBe(false);
    expect(validateProductForm({ ...values, stockQuantity: '2.5' }).valid).toBe(false);
  });

  it('builds the canonical Product with trimmed optionals and stable identity', () => {
    const values: ProductFormValues = {
      ...EMPTY_PRODUCT_FORM,
      name: '  Shampooing Test  ',
      brand: ' Brand Test ',
      category: ' Soin ',
      barcode: ' 0123456789 ',
      imageUri: ' file:///products/shampooing.jpg ',
      price: '25',
      stockQuantity: '4',
    };

    const product = buildProductFromForm({
      id: 'product-1',
      businessId: 'business-1',
      active: true,
      values,
    });

    expect(product).toEqual({
      id: 'product-1',
      businessId: 'business-1',
      name: 'Shampooing Test',
      brand: 'Brand Test',
      category: 'Soin',
      barcode: '0123456789',
      imageUri: 'file:///products/shampooing.jpg',
      price: 25,
      stockQuantity: 4,
      active: true,
    });
  });

  it('hydrates an edit exactly and preserves optional omissions', () => {
    const original = buildProductFromForm({
      id: 'product-1',
      businessId: 'business-1',
      active: true,
      values: {
        ...EMPTY_PRODUCT_FORM,
        name: 'Shampooing',
        price: '25',
        stockQuantity: '3',
      },
    });

    expect(original.brand).toBeUndefined();
    expect(original.category).toBeUndefined();
    expect(original.barcode).toBeUndefined();
    expect(original.imageUri).toBeUndefined();

    const hydrated = toProductFormValues(original);
    expect(hydrated.name).toBe('Shampooing');
    expect(hydrated.price).toBe('25,00');
    expect(hydrated.stockQuantity).toBe('3');
    expect(hydrated.imageUri).toBeUndefined();
  });
});
