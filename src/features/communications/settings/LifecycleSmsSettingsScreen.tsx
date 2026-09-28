// Souris — SMS fidélisation (Settings, SMS pivot Phase 2)
//
// Plus › SMS fidélisation: the two client lifecycle SMS automations — the
// birthday offer and the inactive-client win-back — each ONE switch plus its
// numeric knobs as compact steppers (discount, offer validity, and the
// win-back inactivity delay), within UI ranges narrower than the server
// CHECKs (lifecycle-setting-steps.ts). Deliberately SEPARATE from « Rappels
// clientes », which stays EMAIL-only.
//
// The server preference is authoritative: a switch is persisted through the
// owner RPC BEFORE the UI claims it; a stepper shows its new value at once
// and rolls back to the last confirmed value when the write fails or the
// server refuses it. ONE write at a time, so an older answer can never
// overwrite a newer value: while a write is in flight ONLY the control being
// saved looks pending; the others keep their normal look and are made
// untouchable at the container (`pointerEvents`), so a save never flickers
// unrelated controls. A step sends only its own knob (the others keep their
// stored values server-side). Disabling an automation cancels its pending
// offers server-side; enabling it or changing a knob schedules NOTHING — the
// DAILY server reconciliation is the only thing that ever enqueues an offer,
// and already queued offers keep their snapshotted discount and validity.
//
// No local defaults: values exist only once the server has answered. Until
// then (or when it cannot answer) the automations read as disabled, the
// steppers show a dash and every control waits for connectivity.
//
// Fail-safe exposure (§38 of the Phase 2 plan): the app cannot know whether
// the server SMS transport is actually configured, so the Plus entry to this
// screen exists in DEVELOPMENT builds only until the controlled deployment
// step. Nothing here claims an SMS will be sent.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { foregroundSoft, gutter, rose, semanticColors, spacing } from '@/shared/ui/theme';

import type { LifecycleSmsPreferences, LifecycleSmsPreferencesUpdate } from '../gateway';
import { useCommunicationsGateway } from '../session/CommunicationsGatewayProvider';
import {
  formatLifecycleDays,
  formatLifecyclePercent,
  LIFECYCLE_AFTER_LABEL,
  LIFECYCLE_BIRTHDAY_TOGGLE_LABEL,
  LIFECYCLE_DISCOUNT_LABEL,
  LIFECYCLE_INVALID_VALUE,
  LIFECYCLE_SMS_SETTINGS_TITLE,
  LIFECYCLE_STEPPER_LABELS,
  LIFECYCLE_UNAVAILABLE_NOTICE,
  LIFECYCLE_VALIDITY_LABEL,
  LIFECYCLE_WINBACK_TOGGLE_LABEL,
  REMINDER_OFFLINE_NOTICE,
  REMINDER_UPDATE_FAILURE,
} from '../presentation';

import {
  LIFECYCLE_DISCOUNT_PERCENT_RANGE,
  LIFECYCLE_VALIDITY_DAYS_RANGE,
  WINBACK_AFTER_DAYS_RANGE,
} from './lifecycle-setting-steps';
import { LifecycleSettingStepperRow } from './LifecycleSettingStepperRow';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

type NumericKnob = Exclude<
  keyof LifecycleSmsPreferencesUpdate,
  'birthdaySmsEnabled' | 'winbackSmsEnabled'
>;

type SwitchKey = 'birthdaySmsEnabled' | 'winbackSmsEnabled';

/** The one control whose write is in flight. */
type PendingControl = NumericKnob | SwitchKey;

type WriteFailure = 'UPDATE_FAILED' | 'INVALID_VALUE';

export function LifecycleSmsSettingsScreen() {
  const router = useRouter();
  const gateway = useCommunicationsGateway();
  const business = useCurrentBusiness();
  /** The last server-confirmed preferences; undefined until a read succeeds. */
  const [preferences, setPreferences] = useState<LifecycleSmsPreferences>();
  /** The optimistic knob of the write in flight, shown over `preferences`. */
  const [pendingKnob, setPendingKnob] = useState<{ readonly knob: NumericKnob; readonly value: number }>();
  const [pendingControl, setPendingControl] = useState<PendingControl>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [failure, setFailure] = useState<WriteFailure>();
  // Synchronous guard: a second tap in the same frame never starts a second write.
  const writing = useRef(false);

  // Fail safe: without a server answer (no gateway, or an unreachable one)
  // the automations read as disabled and every control stays untouchable.
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

  // Every control looks disabled only while nothing is loaded; during a
  // write, only the control being saved does.
  const unavailable = offline || preferences === undefined;
  const busy = pendingControl !== undefined;
  const isDisabled = (control: PendingControl) => unavailable || pendingControl === control;

  const persist = (
    control: PendingControl,
    change: Partial<Pick<LifecycleSmsPreferences, SwitchKey>>,
    knob?: { readonly knob: NumericKnob; readonly value: number },
  ) => {
    if (unavailable || busy || writing.current || gateway === undefined || preferences === undefined) {
      return;
    }
    const next: LifecycleSmsPreferencesUpdate = {
      birthdaySmsEnabled: change.birthdaySmsEnabled ?? preferences.birthdaySmsEnabled,
      winbackSmsEnabled: change.winbackSmsEnabled ?? preferences.winbackSmsEnabled,
      ...(knob !== undefined ? { [knob.knob]: knob.value } : {}),
    };
    writing.current = true;
    setPendingControl(control);
    setFailure(undefined);
    setPendingKnob(knob);
    void (async () => {
      try {
        const result = await gateway.updateLifecycleSmsPreferences(business.id, next);
        if (result.status !== 'UPDATED') {
          setFailure('INVALID_VALUE');
          haptics.warning();
          return;
        }
        setPreferences(result.preferences);
        // A step already ticked on press; a switch confirms its persistence.
        if (knob === undefined) haptics.success();
      } catch {
        setFailure('UPDATE_FAILED');
        haptics.warning();
      } finally {
        // Success shows the confirmed value; failure rolls back to it.
        setPendingKnob(undefined);
        setPendingControl(undefined);
        writing.current = false;
      }
    })();
  };

  const toggle = (key: SwitchKey, value: boolean) => persist(key, { [key]: value });
  const stepKnob = (knob: NumericKnob, value: number) => persist(knob, {}, { knob, value });

  const knobValue = (knob: NumericKnob): number | undefined =>
    pendingKnob?.knob === knob ? pendingKnob.value : preferences?.[knob];

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

        {/* The interaction lock of a write in flight: touches only, no visual change. */}
        <View
          pointerEvents={busy ? 'none' : 'auto'}
          style={styles.controls}
          testID="lifecycle-controls"
        >
          <GroupedSurface testID="lifecycle-birthday-group">
            <SwitchRow
              disabled={isDisabled('birthdaySmsEnabled')}
              label={LIFECYCLE_BIRTHDAY_TOGGLE_LABEL}
              onValueChange={(value) => toggle('birthdaySmsEnabled', value)}
              testID="lifecycle-birthday-toggle"
              value={preferences?.birthdaySmsEnabled ?? false}
            />
            <GroupedSeparator inset={spacing.base} />
            <LifecycleSettingStepperRow
              decrementLabel={LIFECYCLE_STEPPER_LABELS.birthdayDiscount.decrement}
              disabled={isDisabled('birthdayDiscountPercent')}
              format={formatLifecyclePercent}
              incrementLabel={LIFECYCLE_STEPPER_LABELS.birthdayDiscount.increment}
              label={LIFECYCLE_DISCOUNT_LABEL}
              onChange={(value) => stepKnob('birthdayDiscountPercent', value)}
              range={LIFECYCLE_DISCOUNT_PERCENT_RANGE}
              testID="lifecycle-birthday-discount"
              value={knobValue('birthdayDiscountPercent')}
            />
            <GroupedSeparator inset={spacing.base} />
            <LifecycleSettingStepperRow
              decrementLabel={LIFECYCLE_STEPPER_LABELS.birthdayValidity.decrement}
              disabled={isDisabled('birthdayValidityDays')}
              format={formatLifecycleDays}
              incrementLabel={LIFECYCLE_STEPPER_LABELS.birthdayValidity.increment}
              label={LIFECYCLE_VALIDITY_LABEL}
              onChange={(value) => stepKnob('birthdayValidityDays', value)}
              range={LIFECYCLE_VALIDITY_DAYS_RANGE}
              testID="lifecycle-birthday-validity"
              value={knobValue('birthdayValidityDays')}
            />
          </GroupedSurface>

          <GroupedSurface testID="lifecycle-winback-group">
            <SwitchRow
              disabled={isDisabled('winbackSmsEnabled')}
              label={LIFECYCLE_WINBACK_TOGGLE_LABEL}
              onValueChange={(value) => toggle('winbackSmsEnabled', value)}
              testID="lifecycle-winback-toggle"
              value={preferences?.winbackSmsEnabled ?? false}
            />
            <GroupedSeparator inset={spacing.base} />
            <LifecycleSettingStepperRow
              decrementLabel={LIFECYCLE_STEPPER_LABELS.winbackAfter.decrement}
              disabled={isDisabled('winbackAfterDays')}
              format={formatLifecycleDays}
              incrementLabel={LIFECYCLE_STEPPER_LABELS.winbackAfter.increment}
              label={LIFECYCLE_AFTER_LABEL}
              onChange={(value) => stepKnob('winbackAfterDays', value)}
              range={WINBACK_AFTER_DAYS_RANGE}
              testID="lifecycle-winback-after"
              value={knobValue('winbackAfterDays')}
            />
            <GroupedSeparator inset={spacing.base} />
            <LifecycleSettingStepperRow
              decrementLabel={LIFECYCLE_STEPPER_LABELS.winbackDiscount.decrement}
              disabled={isDisabled('winbackDiscountPercent')}
              format={formatLifecyclePercent}
              incrementLabel={LIFECYCLE_STEPPER_LABELS.winbackDiscount.increment}
              label={LIFECYCLE_DISCOUNT_LABEL}
              onChange={(value) => stepKnob('winbackDiscountPercent', value)}
              range={LIFECYCLE_DISCOUNT_PERCENT_RANGE}
              testID="lifecycle-winback-discount"
              value={knobValue('winbackDiscountPercent')}
            />
            <GroupedSeparator inset={spacing.base} />
            <LifecycleSettingStepperRow
              decrementLabel={LIFECYCLE_STEPPER_LABELS.winbackValidity.decrement}
              disabled={isDisabled('winbackValidityDays')}
              format={formatLifecycleDays}
              incrementLabel={LIFECYCLE_STEPPER_LABELS.winbackValidity.increment}
              label={LIFECYCLE_VALIDITY_LABEL}
              onChange={(value) => stepKnob('winbackValidityDays', value)}
              range={LIFECYCLE_VALIDITY_DAYS_RANGE}
              testID="lifecycle-winback-validity"
              value={knobValue('winbackValidityDays')}
            />
          </GroupedSurface>
        </View>

        {offline && (
          <View style={styles.offlineNotice}>
            <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.offlineText}>
              {preferences === undefined ? LIFECYCLE_UNAVAILABLE_NOTICE : REMINDER_OFFLINE_NOTICE}
            </AppText>
            <AppButton onPress={retry} title="Réessayer" variant="tertiary" />
          </View>
        )}
        {!offline && failure !== undefined && (
          <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.failure}>
            {failure === 'INVALID_VALUE' ? LIFECYCLE_INVALID_VALUE : REMINDER_UPDATE_FAILURE}
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
  controls: { gap: spacing.lg },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  offlineText: { color: foregroundSoft },
  failure: { color: rose.rose600 },
});
