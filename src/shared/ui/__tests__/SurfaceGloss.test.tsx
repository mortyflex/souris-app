import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ConfirmationDialog } from '../ConfirmationDialog';
import { SurfaceGloss } from '../SurfaceGloss';
import { gloss, overlayMaterial, radii, rose } from '../theme';

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

describe('SurfaceGloss', () => {
  it('is pure decoration clipped to the shape of its surface', async () => {
    const view = await render(<SurfaceGloss shape={{ borderRadius: radii.large }} />);

    const overlay = view.getByTestId('surface-gloss', { includeHiddenElements: true });
    const style = StyleSheet.flatten(overlay.props.style);

    expect(overlay.props.pointerEvents).toBe('none');
    expect(overlay.props.accessibilityElementsHidden).toBe(true);
    expect(overlay.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(style).toMatchObject({
      borderRadius: radii.large,
      bottom: 0,
      left: 0,
      overflow: 'hidden',
      right: 0,
      top: 0,
    });
    // Only a top light: no ring along the sides or the bottom, so a sheet and
    // its bottom safe area stay one continuous material.
    expect(style.boxShadow).toBe(gloss.surface.topLight);
    expect(gloss.surface.topLight).toBe('inset 0 1px 0 rgba(255, 255, 255, 0.96)');
    expect(style.borderWidth).toBeUndefined();
  });

  it('starts its highlight at the top edge, full width, with no lower edge of its own', async () => {
    const view = await render(<SurfaceGloss />);

    const overlay = view.getByTestId('surface-gloss', { includeHiddenElements: true });
    const sheen = StyleSheet.flatten(overlay.children[0] && (overlay.children[0] as typeof overlay).props.style);

    expect(sheen.height).toBe(gloss.surface.sheenHeight);
    expect(sheen.width).toBeUndefined();
    expect(sheen.marginTop).toBeUndefined();
    expect(gloss.surface.sheen.trim().endsWith('rgba(255, 255, 255, 0) 100%)')).toBe(true);
  });
});

describe('overlay material on the confirmation dialog', () => {
  async function renderDialog(tone: 'neutral' | 'destructive') {
    return render(
      <ConfirmationDialog
        cancelLabel="Retour"
        confirmLabel="Confirmer"
        confirmTestID="confirm"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        testID="dialog"
        title="Titre"
        tone={tone}
        visible
      />,
    );
  }

  function outlineOf(style: Record<string, unknown>) {
    return { borderColor: style.borderColor, borderWidth: style.borderWidth };
  }

  it('uses the opaque satin surface with no outline', async () => {
    const view = await renderDialog('neutral');

    const card = StyleSheet.flatten(view.getByTestId('dialog').props.style);

    expect(card.backgroundColor).toBe(overlayMaterial.surface);
    expect(outlineOf(card)).toEqual({ borderColor: undefined, borderWidth: undefined });
  });

  it('carries the destructive tone by tint and fill, never by an outline', async () => {
    const view = await renderDialog('destructive');

    const card = StyleSheet.flatten(view.getByTestId('dialog').props.style);
    const rim = StyleSheet.flatten(
      view.getByTestId('confirmation-dialog-gloss', { includeHiddenElements: true }).props.style,
    );
    const confirm = StyleSheet.flatten(view.getByTestId('confirm').props.style);

    expect(card.backgroundColor).toBe(overlayMaterial.surfaceDestructive);
    expect(outlineOf(card)).toEqual({ borderColor: undefined, borderWidth: undefined });
    expect(rim.boxShadow).toBe(gloss.surface.topLight);
    // Soft rose fill, no border, on the destructive confirm.
    expect(confirm.backgroundColor).toBe(rose.rose100);
    expect(outlineOf(confirm)).toEqual({ borderColor: undefined, borderWidth: undefined });
  });
});

describe('overlay material token', () => {
  it('is opaque, so the page never ghosts through text', () => {
    expect(overlayMaterial.surface).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
