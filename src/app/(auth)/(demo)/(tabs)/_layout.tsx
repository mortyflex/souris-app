// BeautIzzy — Playground demo tabs (development ONLY)
//
// The product's own NativeTabs declaration (`(app)/(tabs)/_layout`), reduced
// to what Step B1 demonstrates: Agenda and Clientèle — the real tabs — and
// Démo, which stands where Plus stands and holds the demo controls. Same
// bar, same tint, same scroll-edge decision, same theme.

import { ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { sourisNavigationTheme } from '@/providers/navigation-theme';
import { semanticColors } from '@/shared/ui/theme';

export default function PlaygroundDemoTabsLayout() {
  return (
    <ThemeProvider value={sourisNavigationTheme}>
      <NativeTabs
        blurEffect="systemThinMaterial"
        disableTransparentOnScrollEdge
        tintColor={semanticColors.accent}
      >
        <NativeTabs.Trigger name="agenda">
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
          <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="clientes">
          <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
          <NativeTabs.Trigger.Label>Clientèle</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="demo">
          <NativeTabs.Trigger.Icon sf={{ default: 'flask', selected: 'flask.fill' }} md="science" />
          <NativeTabs.Trigger.Label>Démo</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
