// BeautIzzy — Client history header
//
// The top bar of the pushed client history screens: the glass back button,
// the centred history title with the client's name as quiet context, and a
// spacer mirroring the back button so the title stays centred.

import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { foregroundSoft, gutter, semanticColors, spacing } from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ClientHistoryHeaderProps {
  readonly title: string;
  readonly clientName?: string;
}

export function ClientHistoryHeader({ title, clientName }: ClientHistoryHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.topBar}>
      <GlassIconButton
        accessibilityLabel="Retour"
        icon={glassIcons.back}
        onPress={() => router.back()}
      />
      <View style={styles.titleBlock}>
        <AppText accessibilityRole="header" numberOfLines={1} variant="control" style={styles.title}>
          {title}
        </AppText>
        {clientName !== undefined && (
          <AppText numberOfLines={1} variant="metadata" style={styles.subtitle}>
            {clientName}
          </AppText>
        )}
      </View>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  titleBlock: { alignItems: 'center', flex: 1, minWidth: 0 },
  title: { color: semanticColors.foreground },
  subtitle: { color: foregroundSoft },
  spacer: { height: glassIconButtonSize, width: glassIconButtonSize },
});
