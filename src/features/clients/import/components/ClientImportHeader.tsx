// BeautIzzy — client import top bar
//
// The pushed-screen top bar of the Client histories (glass back button,
// centred title, mirrored spacer), with a back action owned by the import
// flow: from review it returns to the pasted text instead of leaving.

import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ClientImportHeaderProps {
  readonly title: string;
  readonly onBack: () => void;
  readonly backDisabled?: boolean;
}

export function ClientImportHeader({ title, onBack, backDisabled = false }: ClientImportHeaderProps) {
  return (
    <View style={styles.topBar}>
      <GlassIconButton
        accessibilityLabel="Retour"
        disabled={backDisabled}
        icon={glassIcons.back}
        onPress={onBack}
        testID="client-import-back"
      />
      <AppText accessibilityRole="header" numberOfLines={1} style={styles.title} variant="control">
        {title}
      </AppText>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  title: { color: semanticColors.foreground, flex: 1, textAlign: 'center' },
  spacer: { height: glassIconButtonSize, width: glassIconButtonSize },
});
