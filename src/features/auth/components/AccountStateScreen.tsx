// Souris — dedicated account state (conflict, unavailable, waiting for data)
//
// One restrained explanatory surface: brand, title, short text, at most one
// primary action and one secondary — or, for a waiting state, an activity
// indicator and no action at all. Never a blank screen, never raw errors.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

interface AccountStateScreenProps {
  readonly title: string;
  readonly message: string;
  /** Absent for a waiting state: nothing to press while Souris is working. */
  readonly actions?: ReactNode;
  /** Shown under the message (an activity indicator). */
  readonly accessory?: ReactNode;
  readonly testID?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function AccountStateScreen({ title, message, actions, accessory, testID }: AccountStateScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID={testID}>
      <View style={styles.content}>
        <BrandMark variant="mark" size={126} decorative />
        <AppText variant="stateTitle" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="body" style={styles.message}>
          {message}
        </AppText>
        {accessory}
      </View>
      {actions !== undefined && <View style={styles.actions}>{actions}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: horizontalGutter,
  },
  title: { textAlign: 'center' },
  message: { color: semanticColors.foregroundSoft, maxWidth: 340, textAlign: 'center' },
  actions: { gap: spacing.sm, paddingBottom: spacing.base, paddingHorizontal: horizontalGutter },
});
