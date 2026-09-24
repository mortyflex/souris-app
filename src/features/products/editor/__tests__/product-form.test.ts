import {
  buildProductFromForm,
  EMPTY_PRODUCT_FORM,
  isValidStockQuantity,
  STOCK_SELECTOR_MAX,
  stepStockQuantity,
  toProductFormValues,
  validateProductForm,
  type ProductFormValues,
  getDraftPhotoUri,
  toProductPhotoChange,
  toProductPhotoDraft,
} from '../product-form';

describe('Product form rules', () => {
  it('validates whole, non-negative stock units', () => {
    expect(isValidStockQuantity(0)).toBe(true);
    expect(isValidStockQuantity(1)).toBe(true);
    expect(isValidStockQuantity(12)).toBe(true);
    expect(isValidStockQuantity(-1)).toBe(false);
    expect(isValidStockQuantity(1.5)).toBe(false);
    expect(isValidStockQuantity(Number.NaN)).toBe(false);
  });

  it('steps stock inside the 0–30 selector range', () => {
    expect(STOCK_SELECTOR_MAX).toBe(30);
    expect(stepStockQuantity(0, 1)).toBe(1);
    expect(stepStockQuantity(0, -1)).toBe(0);
    expect(stepStockQuantity(29, 1)).toBe(30);
    expect(stepStockQuantity(30, 1)).toBe(30);
    expect(stepStockQuantity(30, -1)).toBe(29);
  });

  it('never clamps a legacy quantity above 30: it stays valid and can only be lowered', () => {
    expect(isValidStockQuantity(47)).toBe(true);
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, name: 'X', price: '1', stockQuantity: 47 }).valid).toBe(true);
    expect(stepStockQuantity(47, 1)).toBe(47);
    expect(stepStockQuantity(47, -1)).toBe(46);
  });

  it('accepts the supported euro price input and requires a name', () => {
    const values: ProductFormValues = {
      ...EMPTY_PRODUCT_FORM,
      name: 'Shampooing Test',
      price: '20,50',
      stockQuantity: 4,
    };

    expect(validateProductForm(values).valid).toBe(true);
    expect(validateProductForm({ ...values, name: '   ' }).valid).toBe(false);
    expect(validateProductForm({ ...values, price: '-2' }).valid).toBe(false);
    expect(validateProductForm({ ...values, stockQuantity: 2.5 }).valid).toBe(false);
  });

  it('keeps every photo out of the built Product: the catalog applies the photo change on Save', () => {
    const product = buildProductFromForm({
      id: 'product-1',
      businessId: 'business-1',
      active: true,
      values: {
        ...EMPTY_PRODUCT_FORM,
        name: 'Masque',
        price: '12',
        photo: { kind: 'new', uri: 'file:///app/Caches/Camera/x.jpg' },
      },
    });
    expect('photoPath' in product).toBe(false);
    expect('imageUri' in product).toBe(false);
  });

  it('maps the photo draft to what the form shows and to the change applied on Save', () => {
    const current = 'file:///app/Documents/product-photos/shared.jpg';
    expect(getDraftPhotoUri({ kind: 'current' }, current)).toBe(current);
    expect(getDraftPhotoUri({ kind: 'current' }, undefined)).toBeUndefined();
    expect(getDraftPhotoUri({ kind: 'new', uri: 'file:///tmp/new.jpg' }, current)).toBe('file:///tmp/new.jpg');
    expect(getDraftPhotoUri({ kind: 'removed' }, current)).toBeUndefined();

    expect(toProductPhotoDraft('file:///tmp/new.jpg')).toEqual({ kind: 'new', uri: 'file:///tmp/new.jpg' });
    expect(toProductPhotoDraft(undefined)).toEqual({ kind: 'removed' });

    expect(toProductPhotoChange({ kind: 'current' })).toBeUndefined();
    expect(toProductPhotoChange({ kind: 'new', uri: 'file:///tmp/new.jpg' })).toEqual({
      kind: 'replace',
      uri: 'file:///tmp/new.jpg',
    });
    expect(toProductPhotoChange({ kind: 'removed' })).toEqual({ kind: 'remove' });
  });

  it('builds the canonical Product with trimmed optionals and stable identity', () => {
    const values: ProductFormValues = {
      ...EMPTY_PRODUCT_FORM,
      name: '  Shampooing Test  ',
      brand: ' Brand Test ',
      category: ' Soin ',
      barcode: ' 0123456789 ',
      photo: { kind: 'new', uri: 'file:///app/Caches/Camera/shampooing.jpg' },
      price: '25',
      stockQuantity: 4,
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
        stockQuantity: 3,
      },
    });

    expect(original.brand).toBeUndefined();
    expect(original.category).toBeUndefined();
    expect(original.barcode).toBeUndefined();
    expect(original.imageUri).toBeUndefined();

    const hydrated = toProductFormValues(original);
    expect(hydrated.name).toBe('Shampooing');
    expect(hydrated.price).toBe('25,00');
    expect(hydrated.stockQuantity).toBe(3);
    expect(hydrated.photo).toEqual({ kind: 'current' });
  });

  it('hydrates and rebuilds a legacy quantity above 30 unchanged', () => {
    const hydrated = toProductFormValues({
      id: 'product-legacy',
      businessId: 'business-1',
      name: 'Laque',
      price: 12,
      stockQuantity: 47,
      active: true,
    });
    expect(hydrated.stockQuantity).toBe(47);

    const rebuilt = buildProductFromForm({
      id: 'product-legacy',
      businessId: 'business-1',
      active: true,
      values: { ...hydrated, price: '13' },
    });
    expect(rebuilt.stockQuantity).toBe(47);
    expect(rebuilt.price).toBe(13);
  });
});
