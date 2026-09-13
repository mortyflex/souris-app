import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MainScreenHeader } from '../MainScreenHeader';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('MainScreenHeader', () => {
  it('renders one screen title as the header, without any eyebrow by default', async () => {
    const view = await render(<MainScreenHeader title="Produits" watermark="products" />);

    expect(view.getByRole('header', { name: 'Produits' })).toBeTruthy();
    expect(view.queryByText('PRODUITS')).toBeNull();
  });

  it('anchors the watermark inside the title block so the safe area never moves it', async () => {
    const view = await render(
      <MainScreenHeader eyebrow="13 septembre" title="Aujourd'hui" watermark="agenda">
        <Text>Switcher</Text>
      </MainScreenHeader>,
    );

    const watermark = view.getByTestId('screen-watermark-agenda', { includeHiddenElements: true });
    const title = view.getByRole('header', { name: "Aujourd'hui" });
    // The watermark and the title share the same (full-width, unpadded) anchor block.
    expect(watermark.parent).toBe(title.parent);
    expect(view.getByText('13 septembre')).toBeTruthy();
    expect(view.getByText('Switcher')).toBeTruthy();
  });
});
