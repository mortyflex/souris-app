// Souris — main navigation (NativeTabs) contract
//
// Checks the declaration handed to Expo Router's native tabs: exactly the
// four canonical triggers in order, their labels and system icons, the Souris
// tint, the scroll-edge decision, the navigation theme and what must stay
// absent (a creation tab, minimize-on-scroll). Apple's glass rendering is a
// real-device matter, not a Jest one.

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import { sourisNavigationTheme } from '@/providers/navigation-theme';
import { colors } from '@/shared/ui/theme';

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text, View } = jest.requireActual('react-native') as typeof import('react-native');
  const { useTheme } = jest.requireActual('expo-router') as typeof import('expo-router');
  // Host view that keeps every navigator prop for inspection.
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;

  const NativeTabs = ({ children, ...props }: { readonly children?: ReactNode }) => {
    const theme = useTheme();
    return React.createElement(
      Host,
      { testID: 'native-tabs', ...props, themeBackground: theme.colors.background },
      children,
    );
  };
  const Trigger = ({ name, children, ...props }: { readonly name: string; readonly children?: ReactNode }) =>
    React.createElement(Host, { testID: `trigger-${name}`, name, ...props }, children);
  function Icon(props: object) {
    return React.createElement(Host, { testID: 'trigger-icon', ...props });
  }
  function Label({ children }: { readonly children?: ReactNode }) {
    return React.createElement(Text, { testID: 'trigger-label' }, children);
  }
  Trigger.Icon = Icon;
  Trigger.Label = Label;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

describe('main navigation (NativeTabs)', () => {
  it('declares exactly the four canonical tabs, in order, with native labels', async () => {
    const view = await render(<TabsLayout />);

    const triggers = view.getByTestId('native-tabs').children;
    expect(triggers.map((trigger) => (typeof trigger === 'string' ? trigger : trigger.props.name))).toEqual([
      'index',
      'clientes',
      'produits',
      'plus',
    ]);
    expect(view.getAllByTestId('trigger-label').map((label) => label.props.children)).toEqual([
      'Agenda',
      'Clientes',
      'Produits',
      'Plus',
    ]);
    // No creation tab, no search tab, no hidden or disabled tab.
    expect(view.getAllByTestId(/^trigger-/).filter((node) => node.props.name !== undefined)).toHaveLength(4);
    for (const trigger of view.getAllByTestId(/^trigger-(index|clientes|produits|plus)$/)) {
      expect(trigger.props.hidden).toBeUndefined();
      expect(trigger.props.disabled).toBeUndefined();
      expect(trigger.props.role).toBeUndefined();
    }
  });

  it('uses system symbols on both platforms with the current Souris semantics', async () => {
    const view = await render(<TabsLayout />);

    const icons = view.getAllByTestId('trigger-icon').map(({ props }) => ({ sf: props.sf, md: props.md }));
    expect(icons).toEqual([
      { sf: 'calendar', md: 'calendar_month' },
      { sf: { default: 'person.2', selected: 'person.2.fill' }, md: 'group' },
      { sf: { default: 'shippingbox', selected: 'shippingbox.fill' }, md: 'inventory_2' },
      { sf: 'ellipsis', md: 'more_horiz' },
    ]);
    // No image, vector or asset-catalog icons: nothing to bundle, nothing to install.
    for (const icon of view.getAllByTestId('trigger-icon')) {
      expect(icon.props.src).toBeUndefined();
      expect(icon.props.xcasset).toBeUndefined();
      expect(icon.props.drawable).toBeUndefined();
    }
  });

  it('lends only the Souris accent to the native bar and keeps the bar stable', async () => {
    const view = await render(<TabsLayout />);
    const tabs = view.getByTestId('native-tabs');

    expect(tabs.props.tintColor).toBe(colors.accent);
    expect(tabs.props.disableTransparentOnScrollEdge).toBe(true);
    // Native material only: no forced background, blur, label restyling or minimize behaviour.
    expect(tabs.props.backgroundColor).toBeUndefined();
    expect(tabs.props.blurEffect).toBeUndefined();
    expect(tabs.props.labelStyle).toBeUndefined();
    expect(tabs.props.iconColor).toBeUndefined();
    expect(tabs.props.minimizeBehavior).toBeUndefined();
    expect(tabs.props.hidden).toBeUndefined();
  });

  it('wraps the tabs in the light Souris navigation theme so no foreign background shows', async () => {
    const view = await render(<TabsLayout />);

    expect(view.getByTestId('native-tabs').props.themeBackground).toBe(colors.background);
    expect(sourisNavigationTheme.dark).toBe(false);
    expect(sourisNavigationTheme.colors).toMatchObject({
      background: colors.background,
      card: colors.background,
      primary: colors.accent,
    });
  });
});
