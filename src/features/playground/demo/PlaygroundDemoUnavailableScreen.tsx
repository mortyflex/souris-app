// BeautIzzy — « Non disponible dans la démonstration » (development ONLY)
//
// The honest answer of the demo for a workflow the real screens lead to but
// Step B1 does not cover (a product sale from Appointment Details). The
// product route is reached exactly as in the app; this screen takes its place
// and says so instead of pretending, and goes back the same way.

import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

export const DEMO_UNAVAILABLE_TITLE = 'Non disponible dans la démonstration';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface PlaygroundDemoUnavailableScreenProps {
  /** What was asked for, as the product names it (« La vente de produits »). */
  readonly feature: string;
}

export function PlaygroundDemoUnavailableScreen({ feature }: PlaygroundDemoUnavailableScreenProps) {
  const router = useRouter();
  const back = () => router.back();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="playground-demo-unavailable">
      <View style={styles.topBar}>
        <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={back} />
      </View>
      <View style={styles.body}>
        <AppText accessibilityRole="header" style={styles.title} variant="stateTitle">
          {DEMO_UNAVAILABLE_TITLE}
        </AppText>
        <AppText style={styles.text} variant="metadata">
          {feature} ne fait pas partie de cette étape du Playground (étape B2 : caisse, ventes et
          statistiques). Rien n’a été enregistré.
        </AppText>
        <AppButton onPress={back} testID="playground-demo-unavailable-back" title="Retour" variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: { flexDirection: 'row', paddingHorizontal: horizontalGutter, paddingVertical: spacing.sm },
  body: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: { textAlign: 'center' },
  text: { color: semanticColors.foregroundSoft, textAlign: 'center' },
});
