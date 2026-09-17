// Souris — Appointment context row
//
// Compact appointment-context surface used on creation steps and the
// appointment editing screen. Keeps "who + when" visible without a large
// date/profile card.
//
// The time is the creation draft start time: tapping Changer l'horaire gives
// one selection haptic and reveals the shared start-time wheels. The calendar
// date never changes here.

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import {
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { StartTimeOfDay } from '../draft-start';
import { formatCreationDateShort, formatCreationTime } from '../presentation';
import { StartTimePicker } from './StartTimePicker';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface AppointmentContextRowProps {
  readonly startAt: Date;
  readonly clientName?: string;
  /** Called with the time of day chosen on the wheels. */
  readonly onStartAtChange?: (time: StartTimeOfDay) => void;
  /** Hours offered by the wheels, both inclusive. */
  readonly minHour?: number;
  readonly maxHour?: number;
}

export function AppointmentContextRow({
  startAt,
  clientName,
  onStartAtChange,
  minHour,
  maxHour,
}: AppointmentContextRowProps) {
  const [editing, setEditing] = useState(false);
  const editable = onStartAtChange !== undefined;

  return (
    <View style={styles.contextRow}>
      {clientName && (
        <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
          {clientName}
        </AppText>
      )}
      {editing ? (
        <>
          <AppText variant="metadata" numberOfLines={1} style={styles.editDate}>
            {formatCreationDateShort(startAt)}
          </AppText>
          <StartTimePicker
            maxHour={maxHour}
            minHour={minHour}
            onChange={(time) => onStartAtChange?.(time)}
            onDone={() => setEditing(false)}
            startAt={startAt}
          />
        </>
      ) : (
        <View style={styles.normalRow}>
          <AppText variant={clientName ? 'metadata' : 'control'} style={styles.timeLine}>
            {`${formatCreationDateShort(startAt)} · ${formatCreationTime(startAt)}`}
          </AppText>
          {editable && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Changer l'horaire"
              hitSlop={spacing.sm}
              onPress={() => {
                haptics.selection();
                setEditing(true);
              }}
              style={({ pressed }) => [styles.editAction, pressed && styles.editActionPressed]}
              testID="time-modifier"
            >
              <AppText variant="metadata" style={styles.editActionText}>
                Changer l&apos;horaire
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contextRow: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    marginHorizontal: horizontalGutter,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  clientName: { color: semanticColors.foreground },
  normalRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  timeLine: { color: semanticColors.foregroundSoft, flex: 1, fontVariant: ['tabular-nums'] },
  editDate: { color: semanticColors.foregroundSoft, fontVariant: ['tabular-nums'] },
  editAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  editActionPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.pressedScale }],
  },
  editActionText: { color: semanticColors.accent },
});
