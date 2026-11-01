// BeautIzzy — the mock factories the two-device screen tests share
//
// `jest.mock` calls are hoisted per test file and must name their factory
// inline, so each file still writes its own `jest.mock(...)` lines; what they
// share is the factory bodies below, required through `jest.requireActual`.
// Never imported by application code.

import { createElement, Fragment, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

export const safeAreaMock = () => ({
  SafeAreaView: ({ children, ...props }: { readonly children?: ReactNode }) => createElement(View, props, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});

export const expoRouterMock = () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
});

export const expoSymbolsMock = () => ({ SymbolView: () => createElement(Fragment, null) });

export const expoImageMock = () => ({ Image: (props: object) => createElement(View, props) });
