import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { TabBarGlassScrollEdge } from '../TabBarGlassScrollEdge';

jest.mock('react-native-screens/experimental', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    ScrollViewMarker: ({ children, ...props }: { readonly children?: ReactNode }) =>
      React.createElement(Host, { testID: 'scroll-view-marker', ...props }, children),
  };
});

describe('TabBarGlassScrollEdge', () => {
  it('hides only the bottom scroll-edge effect and keeps the ScrollView as its direct child', async () => {
    const view = await render(
      <TabBarGlassScrollEdge>
        <ScrollView testID="list" />
      </TabBarGlassScrollEdge>,
    );

    const marker = view.getByTestId('scroll-view-marker');
    expect(marker.props.scrollEdgeEffects).toEqual({ bottom: 'hidden' });
    expect(marker.props.style).toMatchObject({ flex: 1 });
    expect(view.getByTestId('list')).toBeTruthy();
  });
});
