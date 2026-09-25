// Souris — Rappels clientes (Settings)
//
// Plus › Rappels clientes: the ONE reminder setting of V1. A single switch
// (« Rappels par e-mail »), the fixed timing (« 24 h avant le rendez-vous »,
// no customization in V1), and the Reply-To address the clients answer to.
//
// The server preference is authoritative: the switch reflects the latest
// known server state (the Business-scoped cache while offline) and every
// change is persisted through the owner RPC BEFORE the UI claims it. When
// neither the server nor a cached copy can answer, the screen fails safe —
// automation reads as disabled and the controls wait for connectivity.
//
// Enabling requires a valid Reply-To (prefilled from the signed-in account
// email the first time); the server validates it again. Nothing here talks
// to the queue: turning the switch reconciles server-side.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isUsableCommunicationEmail } from '@/domain/communications';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { GroupedReadRow } from '@/shared/ui/GroupedReadRow';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { TextField } from '@/shared/ui/TextField';
import { foregroundSoft, gutter, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { useCommunicationPreferences } from '../preferences/CommunicationPreferencesProvider';
import {
  REMINDER_INVALID_REPLY_TO,
  REMINDER_OFFLINE_NOTICE,
  REMINDER_REPLY_TO_LABEL,
  REMINDER_SETTINGS_TITLE,
  REMINDER_TIMING_LABEL,
  REMINDER_TIMING_VALUE,
  REMINDER_TOGGLE_LABEL,
  REMINDER_UPDATE_FAILURE,
} from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ReminderSettingsScreen() {
  const router = useRouter();
  const { state: auth } = useAuth();
  const { state, update, refresh } = useCommunicationPreferences();
  const accountEmail = auth.status === 'authenticated' ? auth.user.email : undefined;
  const [replyToDraft, setReplyToDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const preferences = state.preferences;
  const enabled = preferences?.emailRemindersEnabled ?? false;
  const offline = state.status === 'offline';
  const controlsDisabled = busy || state.status === 'loading' || (offline && !preferences);

  // The visible Reply-To: the local draft once touched, otherwise the stored
  // address, otherwise the account email as a starting point.
  const replyToValue = replyToDraft ?? preferences?.replyToEmail ?? accountEmail ?? '';
  const replyToDirty =
    enabled && replyToDraft !== undefined && replyToDraft.trim() !== (preferences?.replyToEmail ?? '');

  const applyUpdate = async (next: {
    readonly emailRemindersEnabled: boolean;
    readonly replyToEmail?: string;
  }) => {
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await update(next);
      if (result.status === 'INVALID_REPLY_TO') {
        setFailure(REMINDER_INVALID_REPLY_TO);
        haptics.warning();
        return;
      }
      setReplyToDraft(undefined);
      haptics.success();
    } catch {
      setFailure(REMINDER_UPDATE_FAILURE);
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) => {
    if (controlsDisabled) return;
    if (!next) {
      void applyUpdate({
        emailRemindersEnabled: false,
        ...(preferences?.replyToEmail !== undefined
          ? { replyToEmail: preferences.replyToEmail }
          : {}),
      });
      return;
    }
    const replyTo = replyToValue.trim();
    if (!isUsableCommunicationEmail(replyTo)) {
      setFailure(REMINDER_INVALID_REPLY_TO);
      haptics.warning();
      return;
    }
    void applyUpdate({ emailRemindersEnabled: true, replyToEmail: replyTo });
  };

  const saveReplyTo = () => {
    const replyTo = replyToValue.trim();
    if (!isUsableCommunicationEmail(replyTo)) {
      setFailure(REMINDER_INVALID_REPLY_TO);
      haptics.warning();
      return;
    }
    void applyUpdate({ emailRemindersEnabled: true, replyToEmail: replyTo });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="reminder-settings-screen">
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

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="screenTitle" accessibilityRole="header">
          {REMINDER_SETTINGS_TITLE}
        </AppText>

        <GroupedSurface testID="reminder-settings-group">
          <SwitchRow
            disabled={controlsDisabled}
            label={REMINDER_TOGGLE_LABEL}
            onValueChange={toggle}
            testID="reminder-toggle"
            value={enabled}
          />
          <GroupedSeparator inset={spacing.base} />
          <GroupedReadRow label={REMINDER_TIMING_LABEL} value={REMINDER_TIMING_VALUE} />
        </GroupedSurface>

        <View style={styles.replyToSection}>
          <TextField
            accessibilityLabel={REMINDER_REPLY_TO_LABEL}
            autoCapitalize="none"
            autoComplete="email"
            editable={!controlsDisabled}
            // The address error belongs to the field; other failures show below.
            error={failure === REMINDER_INVALID_REPLY_TO ? failure : undefined}
            keyboardType="email-address"
            label={REMINDER_REPLY_TO_LABEL}
            onChangeText={(text) => {
              setReplyToDraft(text);
              setFailure(undefined);
            }}
            placeholder="vous@exemple.fr"
            testID="reminder-reply-to-input"
            textContentType="emailAddress"
            value={replyToValue}
          />
          <AppText variant="metadata" style={styles.replyToHint}>
            Les clientes qui répondent à un rappel écrivent à cette adresse.
          </AppText>
          {replyToDirty && (
            <AppButton
              disabled={controlsDisabled}
              onPress={saveReplyTo}
              testID="reminder-save-reply-to"
              title="Enregistrer l’adresse"
              variant="secondary"
            />
          )}
        </View>

        {offline && (
          <View style={styles.offlineNotice}>
            <AppText
              variant="metadata"
              accessibilityLiveRegion="polite"
              style={styles.offlineText}
            >
              {REMINDER_OFFLINE_NOTICE}
            </AppText>
            <AppButton onPress={refresh} title="Réessayer" variant="tertiary" />
          </View>
        )}
        {!offline && failure !== undefined && failure !== REMINDER_INVALID_REPLY_TO && (
          <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.failure}>
            {failure}
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
  replyToSection: { gap: spacing.sm },
  replyToHint: { color: foregroundSoft },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  offlineText: { color: foregroundSoft },
  failure: { color: rose.rose600 },
});
