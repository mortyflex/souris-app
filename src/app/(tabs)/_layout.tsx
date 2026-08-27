import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, StyleSheet, type ColorValue } from 'react-native';

import { semanticColors, typography } from '@/shared/ui/theme';

// Tab labels use the approved tab typography: 10.5 / 600 on iOS, 12 / 500
// on Android. The concrete Inter family carries the weight.
const tabLabelStyle = {
  fontFamily: Platform.OS === 'android' ? 'Inter_500Medium' : 'Inter_600SemiBold',
  fontSize: Platform.OS === 'android' ? typography.tabAndroid.fontSize : typography.tabIos.fontSize,
} as const;

interface TabBarIconProps {
  color: ColorValue;
  size: number;
}

function createTabIcon(name: SymbolViewProps['name']) {
  return function TabBarIcon({ color, size }: TabBarIconProps) {
    return <SymbolView name={name} tintColor={color} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: semanticColors.accent,
        tabBarInactiveTintColor: semanticColors.foregroundSoft,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: tabLabelStyle,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Agenda',
          tabBarIcon: createTabIcon({ ios: 'calendar', android: 'calendar_month' }),
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: createTabIcon({ ios: 'person.2', android: 'group' }),
        }}
      />
      <Tabs.Screen
        name="produits"
        options={{
          title: 'Produits',
          tabBarIcon: createTabIcon({ ios: 'cube', android: 'inventory_2' }),
        }}
      />
      <Tabs.Screen
        name="plus"
        options={{
          title: 'Plus',
          tabBarIcon: createTabIcon({ ios: 'ellipsis', android: 'more_horiz' }),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.surfaceLavenderStrong,
  },
});
