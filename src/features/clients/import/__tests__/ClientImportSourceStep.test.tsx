// BeautIzzy — client import source choice

import { act, fireEvent, render } from '@testing-library/react-native';

import { ClientImportSourceStep, ENABLED_CLIENT_IMPORT_SOURCES } from '../components/ClientImportSourceStep';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

describe('ClientImportSourceStep', () => {
  it('enables paste and CSV, so the import opens on the choice', () => {
    expect(ENABLED_CLIENT_IMPORT_SOURCES).toEqual(['PASTE', 'CSV']);
  });

  it('lists both sources, in order, and reports the chosen one', async () => {
    const onSelect = jest.fn();
    const view = await render(<ClientImportSourceStep onSelect={onSelect} />);

    expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
      'Coller une liste',
      'Importer un fichier CSV',
    ]);

    await act(async () => fireEvent.press(view.getByTestId('client-import-source-paste')));
    expect(onSelect).toHaveBeenLastCalledWith('PASTE');
    await act(async () => fireEvent.press(view.getByTestId('client-import-source-csv')));
    expect(onSelect).toHaveBeenLastCalledWith('CSV');
  });

  it('lists only the sources it is given', async () => {
    const view = await render(<ClientImportSourceStep onSelect={jest.fn()} sources={['PASTE']} />);

    expect(view.getByTestId('client-import-source-paste')).toBeTruthy();
    expect(view.queryByTestId('client-import-source-csv')).toBeNull();
  });
});
