// Souris — SMS fidélisation (Settings, SMS pivot Phase 2)
//
// Plus › SMS fidélisation: the two client lifecycle SMS automations — the
// birthday offer and the inactive-client win-back — each ONE switch over the
// V1 server defaults (15 % / 7 jours; 60 jours / 10 % / 7 jours), displayed
// read-only. Deliberately SEPARATE from « Rappels clientes », which stays
// EMAIL-only.
//
// The server preference is authoritative: every change is persisted through
// the owner RPC BEFORE the UI claims it, disabling an automation cancels its
// pending offers server-side, and enabling schedules NOTHING by itself — the
// DAILY server reconciliation is the only thing that ever enqueues an offer.
// When the server cannot answer, the screen fails safe: automations read as
// disabled and the controls wait for connectivity.
//
// Fail-safe exposure (§38 of the Phase 2 plan): the app cannot know whether
// the server SMS transport is actually configured, so the Plus entry to this
// screen exists in DEVELOPMENT builds only until the controlled deployment
// step. Nothing here claims an SMS will be sent.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { GroupedReadRow } from '@/shared/ui/GroupedReadRow';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { foregroundSoft, gutter, rose, semanticColors, spacing } from '@/shared/ui/theme';

import type { LifecycleSmsPreferences } from '../gateway';
import { useCommunicationsGateway } from '../session/CommunicationsGatewayProvider';
import {
  formatLifecycleDays,
  formatLifecyclePercent,
  LIFECYCLE_AFTER_LABEL,
  LIFECYCLE_BIRTHDAY_TOGGLE_LABEL,
  LIFECYCLE_DISCOUNT_LABEL,
  LIFECYCLE_SMS_SETTINGS_TITLE,
  LIFECYCLE_VALIDITY_LABEL,
  LIFECYCLE_WINBACK_TOGGLE_LABEL,
  REMINDER_OFFLINE_NOTICE,
  REMINDER_UPDATE_FAILURE,
} from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function LifecycleSmsSettingsScreen() {
  const router = useRouter();
  const gateway = useCommunicationsGateway();
  const business = useCurrentBusiness();
  const [preferences, setPreferences] = useState<LifecycleSmsPreferences>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);

  // Fail safe: without a server answer (no gateway, or an unreachable one)
  // the automations read as disabled and the switches stay untouchable.
  const offline = gateway === undefined || loadFailed;

  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    gateway
      .readLifecycleSmsPreferences(business.id)
      .then((next) => {
        if (cancelled) return;
        setPreferences(next);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [business.id, gateway, reloadToken]);

  const retry = () => setReloadToken((token) => token + 1);

  const controlsDisabled = busy || gateway === undefined || preferences === undefined;

  const toggle = (change: Partial<Pick<LifecycleSmsPreferences, 'birthdaySmsEnabled' | 'winbackSmsEnabled'>>) => {
    if (controlsDisabled || gateway === undefined || preferences === undefined) return;
    const next = {
      birthdaySmsEnabled: preferences.birthdaySmsEnabled,
      winbackSmsEnabled: preferences.winbackSmsEnabled,
      ...change,
    };
    setBusy(true);
    setFailure(false);
    void (async () => {
      try {
        const result = await gateway.updateLifecycleSmsPreferences(business.id, next);
        if (result.status !== 'UPDATED') {
          setFailure(true);
          haptics.warning();
          return;
        }
        setPreferences(result.preferences);
        haptics.success();
      } catch {
        setFailure(true);
        haptics.warning();
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="lifecycle-sms-settings-screen">
      <View style={styles.topBar}>
        <GlassIconButton
          accessibilityLabel="Retour"
          icon={glassIcons.back}
          onPress={() => router.back()}
        />
        <AppText variant="eyebrow" style={styles.eyebrow}>
          GESTION
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="screenTitle" accessibilityRole="header">
          {LIFECYCLE_SMS_SETTINGS_TITLE}
        </AppText>

        <GroupedSurface testID="lifecycle-birthday-group">
          <SwitchRow
            disabled={controlsDisabled}
            label={LIFECYCLE_BIRTHDAY_TOGGLE_LABEL}
            onValueChange={(value) => toggle({ birthdaySmsEnabled: value })}
            testID="lifecycle-birthday-toggle"
            value={preferences?.birthdaySmsEnabled ?? false}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow
            label={LIFECYCLE_DISCOUNT_LABEL}
            value={formatLifecyclePercent(preferences?.birthdayDiscountPercent ?? 15)}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow
            label={LIFECYCLE_VALIDITY_LABEL}
            value={formatLifecycleDays(preferences?.birthdayValidityDays ?? 7)}
          />
        </GroupedSurface>

        <GroupedSurface testID="lifecycle-winback-group">
          <SwitchRow
            disabled={controlsDisabled}
            label={LIFECYCLE_WINBACK_TOGGLE_LABEL}
            onValueChange={(value) => toggle({ winbackSmsEnabled: value })}
            testID="lifecycle-winback-toggle"
            value={preferences?.winbackSmsEnabled ?? false}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow
            label={LIFECYCLE_AFTER_LABEL}
            value={formatLifecycleDays(preferences?.winbackAfterDays ?? 60)}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow
            label={LIFECYCLE_DISCOUNT_LABEL}
            value={formatLifecyclePercent(preferences?.winbackDiscountPercent ?? 10)}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow
            label={LIFECYCLE_VALIDITY_LABEL}
            value={formatLifecycleDays(preferences?.winbackValidityDays ?? 7)}
          />
        </GroupedSurface>

        {offline && (
          <View style={styles.offlineNotice}>
            <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.offlineText}>
              {REMINDER_OFFLINE_NOTICE}
            </AppText>
            <AppButton onPress={retry} title="Réessayer" variant="tertiary" />
          </View>
        )}
        {!offline && failure && (
          <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.failure}>
            {REMINDER_UPDATE_FAILURE}
          </AppText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  eyebrow: { color: foregroundSoft },
  topBarSpacer: { width: 44 },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  offlineText: { color: foregroundSoft },
  failure: { color: rose.rose600 },
});
