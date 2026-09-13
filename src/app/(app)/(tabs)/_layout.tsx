// Souris — main navigation
//
// The four canonical tabs (Agenda · Clientes · Produits · Plus) on the
// platform's own tab bar through Expo Router's NativeTabs: UIKit's tab bar on
// iOS (Apple's Liquid Glass on iOS 26 when the binary is built with Xcode 26),
// Material bottom navigation on Android. The system owns the bar's material,
// layout, labels and selected state; Souris only lends it its violet for the
// selected tab. No imitation glass, no custom bar, static tabs, and no
// minimize-on-scroll yet (deliberately left to a later evaluation).
//
// The bar overlays the page on iOS. Each main screen's scroll view opts into
// the system content inset (`contentInsetAdjustmentBehavior`) so its last row
// scrolls above the bar, and the floating + stays above it through its own
// bottom safe-area edge, which Expo Router scopes to the tab screen (see
// FloatingCreateButton). Creation stays a FloatingCreateButton action —
// the bar is navigation, never a fifth « + » tab.

import { ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { sourisNavigationTheme } from '@/providers/navigation-theme';
import { semanticColors } from '@/shared/ui/theme';

export default function TabsLayout() {
  return (
    <ThemeProvider value={sourisNavigationTheme}>
      <NativeTabs
        // Souris's main screens keep a fixed header above their list, so the
        // list is never the first view UIKit inspects for scroll-edge
        // detection: without this, iOS 18 and earlier would treat every tab
        // as permanently "at the edge" and draw a transparent bar. Liquid
        // Glass ignores bar backgrounds, so iOS 26 is unaffected.
        disableTransparentOnScrollEdge
        tintColor={semanticColors.accent}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
          <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="clientes">
          <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
          <NativeTabs.Trigger.Label>Clientes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="produits">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }}
            md="inventory_2"
          />
          <NativeTabs.Trigger.Label>Produits</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="plus">
          <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
          <NativeTabs.Trigger.Label>Plus</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
