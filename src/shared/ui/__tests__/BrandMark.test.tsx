import { render } from '@testing-library/react-native';
import { BrandMark, brandAssets, type BrandMarkVariant } from '../BrandMark';

// Jest turns every PNG into the same placeholder module, so the canonical
// assets are named explicitly to verify which file each variant renders.
jest.mock('../../../../assets/brand/logo-mark.png', () => 'logo-mark.png');
jest.mock('../../../../assets/brand/logo-wordmark.png', () => 'logo-wordmark.png');
jest.mock('../../../../assets/brand/logo-lockup.png', () => 'logo-lockup.png');

describe('BrandMark', () => {
  it.each<[BrandMarkVariant, string]>([
    ['mark', 'logo-mark.png'],
    ['wordmark', 'logo-wordmark.png'],
    ['lockup', 'logo-lockup.png'],
  ])('renders the canonical %s asset', async (variant, file) => {
    const view = await render(<BrandMark variant={variant} size={120} />);
    expect(view.getByRole('image').props.source).toBe(file);
  });

  it.each<[BrandMarkVariant, number]>([
    ['mark', 200],
    ['wordmark', 100],
    ['lockup', 100],
  ])('keeps the intrinsic aspect ratio of %s', async (variant, expectedHeight) => {
    const view = await render(<BrandMark variant={variant} size={300} />);
    const style = view.getByRole('image').props.style;
    expect(style).toEqual([{ width: 300, height: expectedHeight }, undefined]);
    expect(view.getByRole('image').props.resizeMode).toBe('contain');
    expect(expectedHeight).toBe(
      Math.round((300 * brandAssets[variant].height) / brandAssets[variant].width),
    );
  });

  it('announces "Souris" once when it is the only brand identification', async () => {
    const view = await render(<BrandMark variant="lockup" size={200} />);
    expect(view.getByLabelText('Souris').props.accessibilityRole).toBe('image');
  });

  it('is hidden from assistive technology when decorative', async () => {
    const view = await render(<BrandMark variant="mark" size={40} decorative />);
    expect(view.queryByLabelText('Souris')).toBeNull();
    const image = view.toJSON();
    expect(image).not.toBeNull();
    if (image === null || Array.isArray(image)) throw new Error('expected a single host element');
    expect(image.type).toBe('Image');
    expect(image.props.accessible).toBe(false);
    expect(image.props.accessibilityElementsHidden).toBe(true);
    expect(image.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
