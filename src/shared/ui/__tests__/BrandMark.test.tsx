import { render } from '@testing-library/react-native';
import { BrandMark, brandAssets, brandMarkInsets, type BrandMarkVariant } from '../BrandMark';

// Jest turns every PNG into the same placeholder module, so the canonical
// assets are named explicitly to verify which file each variant renders.
jest.mock('../../../../assets/brand/logo-primary.png', () => 'logo-primary.png');
jest.mock('../../../../assets/brand/logo-editorial.png', () => 'logo-editorial.png');
jest.mock('../../../../assets/brand/symbol.png', () => 'symbol.png');

describe('BrandMark', () => {
  it.each<[BrandMarkVariant, string]>([
    ['primary', 'logo-primary.png'],
    ['editorial', 'logo-editorial.png'],
    ['symbol', 'symbol.png'],
  ])('renders the canonical %s asset', async (variant, file) => {
    const view = await render(<BrandMark variant={variant} size={120} />);
    expect(view.getByRole('image').props.source).toBe(file);
  });

  it.each<[BrandMarkVariant, number]>([
    ['primary', 109],
    ['editorial', 115],
    ['symbol', 406],
  ])('keeps the intrinsic aspect ratio of %s', async (variant, expectedHeight) => {
    const view = await render(<BrandMark variant={variant} size={300} />);
    const style = view.getByRole('image').props.style;
    expect(style).toEqual([{ width: 300, height: expectedHeight }, undefined]);
    expect(view.getByRole('image').props.resizeMode).toBe('contain');
    expect(expectedHeight).toBe(
      Math.round((300 * brandAssets[variant].height) / brandAssets[variant].width),
    );
  });

  it('records the measured pixel size of each canonical PNG', () => {
    expect(brandAssets.primary).toMatchObject({ width: 1489, height: 541 });
    expect(brandAssets.editorial).toMatchObject({ width: 1514, height: 580 });
    expect(brandAssets.symbol).toMatchObject({ width: 811, height: 1097 });
  });

  it('gives the transparent padding around the artwork in dp, scaled with the rendered width', () => {
    expect(brandMarkInsets('editorial', 1514)).toEqual(brandAssets.editorial.inset);
    // A thin, even safe padding: a few dp at the sizes the app uses.
    expect(brandMarkInsets('editorial', 125)).toEqual({ left: 5, top: 5, right: 5, bottom: 5 });
    expect(brandMarkInsets('primary', 314)).toEqual({ left: 12, top: 12, right: 12, bottom: 12 });
    expect(brandMarkInsets('symbol', 54)).toEqual({ left: 3, top: 3, right: 3, bottom: 3 });
  });

  it('announces "BeautIzzy" once when it is the only brand identification', async () => {
    const view = await render(<BrandMark variant="primary" size={200} />);
    expect(view.getByLabelText('BeautIzzy').props.accessibilityRole).toBe('image');
  });

  it('is hidden from assistive technology when decorative', async () => {
    const view = await render(<BrandMark variant="symbol" size={40} decorative />);
    expect(view.queryByLabelText('BeautIzzy')).toBeNull();
    const image = view.toJSON();
    expect(image).not.toBeNull();
    if (image === null || Array.isArray(image)) throw new Error('expected a single host element');
    expect(image.type).toBe('Image');
    expect(image.props.accessible).toBe(false);
    expect(image.props.accessibilityElementsHidden).toBe(true);
    expect(image.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
