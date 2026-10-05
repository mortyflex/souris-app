// Souris — client import source choice, kept for the day a second source exists

import { act, fireEvent, render } from '@testing-library/react-native';

import { ClientImportSourceStep, ENABLED_CLIENT_IMPORT_SOURCES } from '../components/ClientImportSourceStep';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

describe('ClientImportSourceStep', () => {
  it('enables paste as the only source today, so the import skips the choice', () => {
    expect(ENABLED_CLIENT_IMPORT_SOURCES).toEqual(['PASTE']);
  });

  it('still lists its sources and reports the chosen one', async () => {
    const onSelect = jest.fn();
    const view = await render(<ClientImportSourceStep onSelect={onSelect} />);

    await act(async () => fireEvent.press(view.getByTestId('client-import-source-paste')));

    expect(view.getByText('Coller une liste')).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith('PASTE');
  });
});
