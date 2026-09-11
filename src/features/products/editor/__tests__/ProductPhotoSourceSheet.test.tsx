import { act, fireEvent, render } from '@testing-library/react-native';

import { ProductPhotoSourceSheet } from '../components/ProductPhotoSourceSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

async function renderSheet(hasImage: boolean) {
  const props = {
    hasImage,
    onChooseCamera: jest.fn(),
    onChooseLibrary: jest.fn(),
    onClose: jest.fn(),
    onRemove: jest.fn(),
    visible: true,
  };
  return { props, view: await render(<ProductPhotoSourceSheet {...props} />) };
}

describe('ProductPhotoSourceSheet', () => {
  it('lists camera and library without removal when there is no image', async () => {
    const { view, props } = await renderSheet(false);

    expect(view.getByText('Photo du produit')).toBeTruthy();
    expect(view.getAllByTestId('bottom-sheet-scrim')).toHaveLength(1);
    expect(view.queryByLabelText('Supprimer la photo')).toBeNull();

    await act(async () => fireEvent.press(view.getByLabelText('Prendre une photo')));
    expect(props.onChooseCamera).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(view.getByLabelText('Choisir dans la photothèque')));
    expect(props.onChooseLibrary).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(view.getByText('Annuler')));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('offers replace and remove when an image exists', async () => {
    const { view, props } = await renderSheet(true);

    expect(view.getByLabelText('Prendre une nouvelle photo')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByLabelText('Supprimer la photo')));
    expect(props.onRemove).toHaveBeenCalledTimes(1);
  });
});
