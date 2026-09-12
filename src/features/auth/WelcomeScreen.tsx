// Souris — Welcome
//
// The first screen of a fresh install: the canonical brand composition, one
// promise, one primary action. No carousel, no illustration, no marketing.

import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BrandComposition } from '@/shared/ui/BrandMark';
import { colors, gutter, semanticColors, spacing } from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID="welcome-screen">
      <View style={styles.brand}>
        <BrandComposition size={220} />
      </View>
      <View style={styles.copy}>
        <AppText variant="display" accessibilityRole="header">
          {'Votre activité,\nsimplement organisée.'}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Agenda, clientes, prestations et ventes, sans logiciel compliqué.
        </AppText>
      </View>
      <View style={styles.actions}>
        <AppButton onPress={() => router.push('/sign-up')} title="Commencer" />
        <AppButton
          onPress={() => router.push('/sign-in')}
          title="J’ai déjà un compte"
          variant="tertiary"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  brand: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingTop: spacing['3xl'] },
  copy: { gap: spacing.md, paddingBottom: spacing['3xl'], paddingHorizontal: horizontalGutter },
  subtitle: { color: semanticColors.foregroundSoft, maxWidth: 320 },
  actions: { gap: spacing.sm, paddingBottom: spacing.base, paddingHorizontal: horizontalGutter },
});
