// BeautIzzy — Horaires (Plus › Gestion)
//
// The weekly working hours of the professional: seven rows, Monday first,
// each reading « 09:00 – 12:00 · 14:00 – 19:00 » or « Fermé ». Tapping a day
// opens its sheet (WorkingDaySheet); « Enregistrer » there saves THAT day to
// the server at once, and the week shown is always the server's answer.
//
// The server is authoritative and nothing here goes through the offline
// sync: the screen needs connectivity to load and to save, a failed save
// changes nothing and keeps the sheet — and the edits — open with the
// reason, and nothing is ever queued for later. Without a server answer the
// week is not shown at all — only the notice and « Réessayer ».
//
// Working hours never constrain the Agenda: they describe when online
// booking may one day propose a slot. Editing them needs no subscription.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { WorkingDay } from '@/domain/online-booking';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { FormScrollView } from '@/shared/ui/FormScrollView';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import {
  foregroundSoft,
  gutter,
  interaction,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { WorkingHours } from '../gateway';
import { useOnlineBookingGateway } from '../session/OnlineBookingGatewayProvider';

import {
  describeWorkingHoursTimeZone,
  formatSpokenWorkingDay,
  formatWeekday,
  formatWorkingDaySummary,
  WORKING_HOURS_INTRO,
  WORKING_HOURS_OFFLINE_NOTICE,
  WORKING_HOURS_SAVE_FAILURE,
  WORKING_HOURS_SAVE_REFUSED,
  WORKING_HOURS_SAVED,
  WORKING_HOURS_TITLE,
} from './presentation';
import { WorkingDaySheet } from './WorkingDaySheet';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface EditedDay {
  readonly day: WorkingDay;
  /** A new opening is a new sheet: its draft starts from the stored day. */
  readonly opening: number;
}

export function WorkingHoursScreen() {
  const router = useRouter();
  const gateway = useOnlineBookingGateway();
  const business = useCurrentBusiness();
  /** The last server-confirmed week; undefined until a read succeeds. */
  const [hours, setHours] = useState<WorkingHours>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [edited, setEdited] = useState<EditedDay>();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [saved, setSaved] = useState(false);
  // Synchronous guard: a second tap in the same frame never starts a second write.
  const writing = useRef(false);
  const openings = useRef(0);

  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    gateway
      .readWorkingHours(business.id)
      .then((next) => {
        if (cancelled) return;
        setHours(next);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [business.id, gateway, reloadToken]);

  const header = (
    <View style={styles.topBar}>
      <GlassIconButton
        accessibilityLabel="Retour"
        icon={glassIcons.back}
        onPress={() => router.back()}
        testID="working-hours-back"
      />
      <AppText variant="eyebrow" style={styles.eyebrow}>
        GESTION
      </AppText>
      <View style={styles.topBarSpacer} />
    </View>
  );

  if (gateway === undefined || hours === undefined) {
    const unavailable = gateway === undefined || loadFailed;
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']} testID="working-hours-screen">
        {header}
        <View style={styles.content}>
          <AppText variant="screenTitle" accessibilityRole="header">
            {WORKING_HOURS_TITLE}
          </AppText>
          {unavailable ? (
            <View style={styles.offlineNotice} testID="working-hours-offline">
              <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.soft}>
                {WORKING_HOURS_OFFLINE_NOTICE}
              </AppText>
              {gateway !== undefined && (
                <AppButton
                  onPress={() => {
                    setLoadFailed(false);
                    setReloadToken((token) => token + 1);
                  }}
                  testID="working-hours-retry"
                  title="Réessayer"
                  variant="tertiary"
                />
              )}
            </View>
          ) : (
            <ActivityIndicator
              accessibilityLabel="Chargement de vos horaires"
              color={semanticColors.accent}
              style={styles.loading}
              testID="working-hours-loading"
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const openDay = (day: WorkingDay) => {
    if (writing.current || sheetVisible) return;
    haptics.selection();
    openings.current += 1;
    setEdited({ day, opening: openings.current });
    setFailure(undefined);
    setSaved(false);
    setSheetVisible(true);
  };

  const closeSheet = () => {
    if (writing.current) return;
    setSheetVisible(false);
  };

  const saveDay = async (day: WorkingDay) => {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    setFailure(undefined);
    try {
      const result = await gateway.saveWorkingDay(business.id, day);
      if (result.status === 'UPDATED') {
        setHours(result.workingHours);
        setSaved(true);
        setSheetVisible(false);
        haptics.success();
        return;
      }
      setFailure(WORKING_HOURS_SAVE_REFUSED);
      haptics.warning();
    } catch {
      setFailure(WORKING_HOURS_SAVE_FAILURE);
      haptics.warning();
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="working-hours-screen">
      {header}
      <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="screenTitle" accessibilityRole="header">
          {WORKING_HOURS_TITLE}
        </AppText>
        <AppText variant="metadata" style={styles.soft}>
          {WORKING_HOURS_INTRO}
        </AppText>

        <GroupedSurface testID="working-hours-week">
          {hours.days.map((day, index) => (
            <View key={day.weekday}>
              {index > 0 && <GroupedSeparator inset={spacing.base} />}
              <Pressable
                accessibilityHint="Modifie les horaires de ce jour"
                accessibilityLabel={formatSpokenWorkingDay(day)}
                accessibilityRole="button"
                onPress={() => openDay(day)}
                style={({ pressed }) => [styles.dayRow, pressed && styles.dayRowPressed]}
                testID={`working-hours-day-${day.weekday}`}
              >
                <View style={styles.dayCopy}>
                  <AppText variant="rowTitle">{formatWeekday(day.weekday)}</AppText>
                  <AppText
                    variant="metadata"
                    style={day.isOpen ? styles.openSummary : styles.soft}
                    testID={`working-hours-day-${day.weekday}-summary`}
                  >
                    {formatWorkingDaySummary(day)}
                  </AppText>
                </View>
                <NavigationChevron />
              </Pressable>
            </View>
          ))}
        </GroupedSurface>

        <AppText variant="metadata" style={styles.soft} testID="working-hours-time-zone">
          {describeWorkingHoursTimeZone(hours.timeZone)}
        </AppText>

        {saved && (
          <AppText
            variant="metadata"
            accessibilityLiveRegion="polite"
            style={styles.soft}
            testID="working-hours-saved"
          >
            {WORKING_HOURS_SAVED}
          </AppText>
        )}
      </FormScrollView>

      {edited !== undefined && (
        <WorkingDaySheet
          day={edited.day}
          failure={failure}
          key={edited.opening}
          onCancel={closeSheet}
          onDismissed={() => setEdited(undefined)}
          onEdit={() => setFailure(undefined)}
          onSave={(day) => void saveDay(day)}
          saving={saving}
          visible={sheetVisible}
          week={hours.days}
        />
      )}
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
  soft: { color: foregroundSoft },
  openSummary: { color: semanticColors.foreground },
  loading: { alignSelf: 'flex-start', marginTop: spacing.base },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  dayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  dayRowPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    opacity: interaction.pressedOpacity,
  },
  dayCopy: { flex: 1, gap: 2, minWidth: 0 },
});
