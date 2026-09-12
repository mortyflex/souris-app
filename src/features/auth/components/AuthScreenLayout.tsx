// Souris — shared frame of the account screens
//
// Warm screen background, top/bottom safe areas, native keyboard avoidance,
// a scrollable body (so the primary action stays reachable on small phones
// with the keyboard up), and a fixed footer holding the ONE primary action
// plus its restrained secondary. No card, no hero illustration.

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { gutter, semanticColors, spacing } from '@/shared/ui/theme';

interface AuthScreenLayoutProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Optional leading action (e.g. "Retour"). */
  readonly onBack?: () => void;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly testID?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function AuthScreenLayout({
  eyebrow,
  title,
  subtitle,
  onBack,
  children,
  footer,
  testID,
}: AuthScreenLayoutProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {onBack && (
            <View style={styles.backRow}>
              <AppButton
                accessibilityLabel="Retour"
                onPress={onBack}
                style={styles.backButton}
                title="Retour"
                variant="tertiary"
              />
            </View>
          )}
          <View style={styles.header}>
            <AppText variant="eyebrow" style={styles.eyebrow}>
              {eyebrow}
            </AppText>
            <AppText variant="screenTitle" accessibilityRole="header">
              {title}
            </AppText>
            {subtitle && (
              <AppText variant="body" style={styles.subtitle}>
                {subtitle}
              </AppText>
            )}
          </View>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  keyboardContainer: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl, paddingHorizontal: horizontalGutter },
  backRow: { alignItems: 'flex-start', marginLeft: -spacing.md, paddingTop: spacing.xs },
  backButton: { paddingHorizontal: spacing.md },
  header: { gap: spacing.sm, paddingTop: spacing.lg },
  eyebrow: { color: semanticColors.accent },
  subtitle: { color: semanticColors.foregroundSoft, maxWidth: 340 },
  body: { gap: spacing.base, paddingTop: spacing['2xl'] },
  footer: {
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
});
