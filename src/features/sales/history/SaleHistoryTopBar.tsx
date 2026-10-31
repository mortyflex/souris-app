// BeautIzzy — top bar of the pushed sale screens
//
// The Caisse top bar, reused as is: the glass back button, the « GESTION »
// eyebrow centred, and — like the Client detail — an optional « ••• » glass
// button on the right (`onOpenActions`), otherwise a spacer mirroring the back
// button. The screen title follows in the scrolling content.

import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface SaleHistoryTopBarProps {
  /** Shows the « ••• » button; absent, a spacer keeps the eyebrow centred. */
  readonly onOpenActions?: () => void;
  readonly actionsLabel?: string;
  readonly actionsTestID?: string;
}

export function SaleHistoryTopBar({ onOpenActions, actionsLabel = 'Actions', actionsTestID }: SaleHistoryTopBarProps = {}) {
  const router = useRouter();
  return (
    <View style={styles.topBar}>
      <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={() => router.back()} />
      <AppText variant="eyebrow" style={styles.eyebrow}>
        GESTION
      </AppText>
      {onOpenActions ? (
        <GlassIconButton
          accessibilityLabel={actionsLabel}
          icon={glassIcons.more}
          onPress={onOpenActions}
          testID={actionsTestID}
        />
      ) : (
        <View style={styles.spacer} />
      )}
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
