// Surface roles of the shared primitives (DESIGN_OVERRIDES.md §39): the page
// shell paints the app background, and fields take their idle fill from their
// placement — white on the page, `surfaceInput` on a sheet or inside a card.

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Screen } from '../Screen';
import { SearchField } from '../SearchField';
import { TextField } from '../TextField';
import { rose, semanticColors } from '../theme';

type HostElement = ReturnType<Awaited<ReturnType<typeof render>>['getByLabelText']>;

function backgroundOf(style: unknown): unknown {
  return StyleSheet.flatten(style as StyleProp<ViewStyle>)?.backgroundColor;
}

/** The host view directly wrapping a field's TextInput: its idle shell. */
function inputShellOf(input: HostElement): HostElement {
  let node = input.parent;
  while (node && typeof node.type !== 'string') node = node.parent;
  if (!node) throw new Error('The field has no host shell.');
  return node as HostElement;
}

describe('Screen', () => {
  it('paints the app background, never white', async () => {
    const view = await render(
      <Screen>
        <Text>Contenu</Text>
      </Screen>,
    );

    const painted = view.container.queryAll(
      (node) => typeof node.type === 'string' && backgroundOf(node.props.style) !== undefined,
    );
    expect(painted.length).toBeGreaterThan(0);
    expect(backgroundOf(painted[0].props.style)).toBe(semanticColors.screen);
  });
});

describe('SearchField placement', () => {
  it('is white directly on the app background', async () => {
    const view = await render(
      <SearchField
        accessibilityLabel="Rechercher"
        onChangeText={() => undefined}
        placeholder="Rechercher"
        placement="page"
        testID="search"
        value=""
      />,
    );

    expect(backgroundOf(view.getByTestId('search').props.style)).toBe(semanticColors.surfaceElevated);
  });

  it('uses the input surface on a sheet or inside a card (default)', async () => {
    const view = await render(
      <SearchField
        accessibilityLabel="Rechercher"
        onChangeText={() => undefined}
        placeholder="Rechercher"
        testID="search"
        value=""
      />,
    );

    expect(backgroundOf(view.getByTestId('search').props.style)).toBe(semanticColors.surfaceInput);
  });

  it('keeps the white focused state with its accent outline wherever it sits', async () => {
    const view = await render(
      <SearchField
        accessibilityLabel="Rechercher"
        onChangeText={() => undefined}
        placeholder="Rechercher"
        testID="search"
        value=""
      />,
    );

    await act(async () => {
      fireEvent(view.getByLabelText('Rechercher'), 'focus');
    });

    expect(StyleSheet.flatten(view.getByTestId('search').props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderColor: semanticColors.accent,
    });
  });
});

describe('TextField placement', () => {
  it('uses the input surface on a sheet or inside a card (default)', async () => {
    const view = await render(
      <TextField
        accessibilityLabel="Nom"
        label="Nom"
        onChangeText={() => undefined}
        placeholder="Nom"
        value=""
      />,
    );

    const shell = inputShellOf(view.getByLabelText('Nom'));
    expect(backgroundOf(shell.props.style)).toBe(semanticColors.surfaceInput);
  });

  it('is white on the app background and writes its error in the darker rose there', async () => {
    const view = await render(
      <TextField
        accessibilityLabel="Email"
        error="Adresse invalide"
        label="Email"
        onChangeText={() => undefined}
        placeholder="Email"
        placement="page"
        value=""
      />,
    );

    // The error state still wins over the placement fill.
    const shell = inputShellOf(view.getByLabelText('Email'));
    expect(backgroundOf(shell.props.style)).toBe(semanticColors.surfaceRose);
    expect(StyleSheet.flatten(view.getByText('Adresse invalide').props.style).color).toBe(rose.rose700);
  });

  it('is white on the app background when idle', async () => {
    const view = await render(
      <TextField
        accessibilityLabel="Email"
        label="Email"
        onChangeText={() => undefined}
        placeholder="Email"
        placement="page"
        value=""
      />,
    );

    expect(backgroundOf(inputShellOf(view.getByLabelText('Email')).props.style)).toBe(
      semanticColors.surfaceElevated,
    );
  });
});
