// BeautIzzy — the Accueil brand row preview: the real logo and the real mark
// in both states, in one scrollable sheet, reading no access state; nothing
// outside __DEV__.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { brandMarkInsets } from '@/shared/ui/BrandMark';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { semanticColors } from '@/shared/ui/theme';

import { HOME_PLUS_MARK_GAP } from '../../components/HomeBrandRow';
import { HOME_LOGO_SIZE } from '../../components/HomeHeader';
import { HomeBrandPreviewSheet, homeBrandPreviewStates } from '../HomeBrandPreviewSheet';

function Host() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="Ouvrir l’aperçu" onPress={() => setVisible(true)} />
      <HomeBrandPreviewSheet onClose={() => setVisible(false)} visible={visible} />
    </>
  );
}

async function openPreview() {
  const view = await render(<Host />);
  await act(async () => {});
  await act(async () => {
    fireEvent.press(view.getByLabelText('Ouvrir l’aperçu'));
  });
  await settleSheetTransition();
  expect(view.getByTestId('home-brand-preview-sheet')).toBeTruthy();
  return view;
}

describe('HomeBrandPreviewSheet', () => {
  it('draws the real logo in both states: alone, then with exactly one « Plus » mark', async () => {
    const view = await openPreview();
    expect(homeBrandPreviewStates.map((state) => state.key)).toEqual(['without-plus', 'with-plus']);
    expect(view.getByText('Sans abonnement')).toBeTruthy();
    expect(view.getByText('BeautIzzy Plus')).toBeTruthy();

    const without = within(view.getByTestId('home-brand-preview-without-plus-row'));
    expect(without.getByLabelText('BeautIzzy')).toHaveStyle({ width: HOME_LOGO_SIZE });
    expect(without.queryByTestId('home-brand-preview-without-plus-mark')).toBeNull();
    expect(without.queryByText('Plus')).toBeNull();

    const withPlus = within(view.getByTestId('home-brand-preview-with-plus-row'));
    expect(withPlus.getByLabelText('BeautIzzy')).toHaveStyle({ width: HOME_LOGO_SIZE });
    expect(withPlus.getAllByTestId('home-brand-preview-with-plus-mark')).toHaveLength(1);
    expect(withPlus.getByText('Plus')).toBeTruthy();
    // Never the product's own handle: Accueil's header is not on screen.
    expect(view.queryByTestId('home-header')).toBeNull();
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
  });

  it('sets the mark 6 pt from the visible edge of the logo: the artwork, not the PNG box', async () => {
    const view = await openPreview();
    const row = view.getByTestId('home-brand-preview-with-plus-row');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ alignItems: 'center', flexDirection: 'row', gap: HOME_PLUS_MARK_GAP });
    expect(HOME_PLUS_MARK_GAP).toBe(6);
    const insets = brandMarkInsets('editorial', HOME_LOGO_SIZE);
    expect(insets.right).toBe(6);
    const logo = within(row).getByLabelText('BeautIzzy');
    expect(StyleSheet.flatten(logo.props.style)).toMatchObject({ marginRight: -insets.right, marginLeft: -insets.left });
    // The logo-only row keeps the very same logo placement.
    const alone = within(view.getByTestId('home-brand-preview-without-plus-row')).getByLabelText('BeautIzzy');
    expect(StyleSheet.flatten(alone.props.style)).toMatchObject({ marginRight: -insets.right, marginLeft: -insets.left });
  });

  it('draws each row on the real page background with the page gutter', async () => {
    const view = await openPreview();
    const page = view.getByTestId('home-brand-preview-with-plus-row').parent;
    expect(StyleSheet.flatten(page!.props.style)).toMatchObject({ backgroundColor: semanticColors.screen });
    expect(view.getByText('Aperçu visuel. Aucun abonnement réel, aucun changement d’accès.')).toBeTruthy();
  });

  it('lists the states in a scrolling body and closes on Fermer', async () => {
    const view = await openPreview();
    const scrollViews = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(scrollViews).toHaveLength(1);
    expect(within(scrollViews[0]!).getByTestId('home-brand-preview-with-plus-row')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Fermer'));
    });
    await settleSheetTransition();
    expect(view.queryByTestId('home-brand-preview-sheet')).toBeNull();
  });

  it('renders nothing outside __DEV__', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const view = await render(<HomeBrandPreviewSheet onClose={jest.fn()} visible />);
      await act(async () => {});
      expect(view.queryByTestId('home-brand-preview-sheet')).toBeNull();
    } finally {
      flags.__DEV__ = true;
    }
  });
});
