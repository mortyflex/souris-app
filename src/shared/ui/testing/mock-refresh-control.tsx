// BeautIzzy — test double for the React Native RefreshControl
//
// The preset's own mock renders a bare native host and DROPS every prop, so a
// test can neither find the control nor pull it. Used through
// `jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl',
// () => jest.requireActual('@/shared/ui/testing/mock-refresh-control'))`: the
// control becomes a View carrying its props (testID, accessibilityLabel,
// refreshing, onRefresh, colors…), so `getByTestId(...).props.onRefresh()` is
// a pull and `.props.refreshing` the indicator. Never imported by application
// code.

import { createElement, type ReactNode } from 'react';
import { View, type RefreshControlProps } from 'react-native';

export default function MockRefreshControl({ children, ...props }: RefreshControlProps & { readonly children?: ReactNode }) {
  return createElement(View, props as object, children);
}
