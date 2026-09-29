// Glass Sheet Pilot (DESIGN_OVERRIDES.md §40): the satin material stays the
// default, glass is an explicit opt-in drawn OVER the same surface, and it
// falls back to the opaque satin whenever transparency is reduced. The native
// glass rendering itself is not asserted.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheet } from '../BottomSheet';
import { SheetScreen } from '../SheetScreen';
import { gloss, overlayMaterial, semanticColors } from '../theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: () => undefined,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    initialWindowMetrics: { insets: { bottom: 0, left: 0, right: 0, top: 0 } },
  };
});

function flat(style: unknown): ViewStyle {
  return StyleSheet.flatten(style as StyleProp<ViewStyle>) ?? {};
}

async function renderDrawer(material?: 'satin' | 'glass') {
  const view = await render(
    <BottomSheet
      backdropLabel="Fermer"
      material={material}
      onClose={() => undefined}
      surfaceTestID="surface"
      visible
    >
      <Text>Contenu</Text>
    </BottomSheet>,
  );
  // Settles the reduce-transparency query.
  await act(async () => {});
  return view;
}

function sheenOf(view: Awaited<ReturnType<typeof render>>, glossTestID: string) {
  const glossLayer = view.getByTestId(glossTestID, { includeHiddenElements: true });
  return flat(glossLayer.children.find((child) => typeof child !== 'string')?.props.style);
}

// Transparency is NOT reduced unless a test says so.
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sheet material', () => {
  it('keeps the approved opaque satin sheet by default', async () => {
    const view = await renderDrawer();

    expect(flat(view.getByTestId('surface').props.style).backgroundColor).toBe(overlayMaterial.surface);
    expect(view.queryByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeNull();
    expect(sheenOf(view, 'bottom-sheet-gloss').height).toBe(gloss.surface.sheenHeight);
  });

  it('draws the glass only on explicit opt-in, under a milky veil of the same surface colour', async () => {
    const view = await renderDrawer('glass');

    expect(flat(view.getByTestId('surface').props.style).backgroundColor).toBe('transparent');
    expect(view.getByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeTruthy();
    expect(sheenOf(view, 'bottom-sheet-gloss')).toMatchObject({
      experimental_backgroundImage: gloss.glassSheet.sheen,
      height: gloss.glassSheet.sheenHeight,
    });
  });

  it('falls back to the opaque satin surface when transparency is reduced', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);

    const view = await renderDrawer('glass');

    expect(flat(view.getByTestId('surface').props.style).backgroundColor).toBe(overlayMaterial.surface);
    expect(view.queryByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeNull();
    // The softer sheen is kept: the fallback is still the pilot's look, only opaque.
    expect(sheenOf(view, 'bottom-sheet-gloss').height).toBe(gloss.glassSheet.sheenHeight);
  });

  it('lets a transparent-modal content sheet route opt in the same way', async () => {
    const view = await render(
      <SheetScreen fit="content" material="glass">
        <Text>Contenu</Text>
      </SheetScreen>,
    );
    await act(async () => {});

    expect(flat(view.getByTestId('sheet-screen-surface').props.style).backgroundColor).toBe('transparent');
    expect(view.getByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps a native workflow form sheet satin even if glass is requested', async () => {
    const view = await render(
      <SheetScreen material="glass" testID="shell">
        <Text>Contenu</Text>
      </SheetScreen>,
    );
    await act(async () => {});

    expect(flat(view.getByTestId('shell').props.style).backgroundColor).toBe(overlayMaterial.surface);
    expect(view.queryByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeNull();
    expect(sheenOf(view, 'sheet-screen-gloss').height).toBe(gloss.surface.sheenHeight);
  });

  it('keeps a native workflow shell satin by default', async () => {
    const view = await render(
      <SheetScreen testID="shell">
        <Text>Contenu</Text>
      </SheetScreen>,
    );

    expect(flat(view.getByTestId('shell').props.style).backgroundColor).toBe(overlayMaterial.surface);
    expect(view.queryByTestId('sheet-glass-backdrop', { includeHiddenElements: true })).toBeNull();
  });

  it('veils the glass with the sheet surface colour itself and leaves cards and inputs opaque', () => {
    // #FBF9FE = rgb(251, 249, 254): the veil is lav025, moderately see-through —
    // never so thin that the page reads, never so dense that the glass vanishes.
    expect(overlayMaterial.surface).toBe('#FBF9FE');
    const veil = /^rgba\(251, 249, 254, (0\.\d+)\)$/.exec(overlayMaterial.glassTint);
    expect(veil).not.toBeNull();
    expect(Number(veil?.[1])).toBeGreaterThanOrEqual(0.5);
    expect(Number(veil?.[1])).toBeLessThanOrEqual(0.7);
    expect(semanticColors.surfaceElevated).toBe('#FFFFFF');
    expect(semanticColors.surfaceInput).toBe('#F1EEF5');
  });
});

describe('Glass Sheet Pilot scope', () => {
  const SOURCE_ROOT = join(__dirname, '..', '..', '..');

  function sources(directory: string): readonly string[] {
    return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (!statSync(path).isFile()) return entry === '__tests__' ? [] : sources(path);
      return /\.tsx?$/.test(entry) ? [path] : [];
    });
  }

  function filesContaining(pattern: RegExp): readonly string[] {
    return ['app', 'features', 'providers']
      .flatMap((directory) => sources(join(SOURCE_ROOT, directory)))
      .filter((path) => pattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SOURCE_ROOT.length + 1))
      .sort();
  }

  it('opts in exactly the two compatible pilot sheets', () => {
    expect(filesContaining(/material="glass"/)).toEqual([
      'features/clients/creation/ClientFormSheet.tsx',
      'features/services/editor/ServiceEditorScreen.tsx',
    ]);
  });

  it('keeps « Modifier le rendez-vous » on the native satin workflow sheet', () => {
    const layout = readFileSync(join(SOURCE_ROOT, 'app', '(app)', '_layout.tsx'), 'utf8');

    expect(layout).toMatch(/name="appointments\/edit\/\[appointmentId\]" options=\{workflowSheet\}/);
    expect(filesContaining(/workflowGlassSheet/)).toEqual([]);
  });
});
