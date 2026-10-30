// BeautIzzy — top bar of the pushed sale screens
//
// The Caisse top bar, reused as is: the glass back button, the « GESTION »
// eyebrow centred, and a spacer mirroring the back button. The screen title
// follows in the scrolling content, like every pushed Gestion screen.

import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function SaleHistoryTopBar() {
  const router = useRouter();
  return (
    <View style={styles.topBar}>
      <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={() => router.back()} />
      <AppText variant="eyebrow" style={styles.eyebrow}>
        GESTION
      </AppText>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  eyebrow: { color: semanticColors.accent },
  spacer: { height: glassIconButtonSize, width: glassIconButtonSize },
});
