// Souris — metadata of Appointment Details
//
// No card: two quiet lines (calendar glyph + date, clock glyph + time range)
// and the status pill on the right, closed by a hairline. The same layout
// for every status — only the pill's data changes. The birthday mention and
// the cancellation outcome, when they exist, sit under the time line.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AppointmentCancellation } from '@/domain/appointments';
import { birthdayIcon } from '@/shared/icons/birthday-icon';
import { AppText } from '@/shared/ui/AppText';
import { rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatCancellationActorLabel, type AppointmentDisplayStatus } from '../presentation';
import { AppointmentStatusPill } from './AppointmentStatusPill';

const dateIcon: SymbolViewProps['name'] = { ios: 'calendar', android: 'calendar_today' };
const timeIcon: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule' };

interface AppointmentMetaProps {
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly status: AppointmentDisplayStatus;
  readonly isBirthday: boolean;
  readonly cancellation?: AppointmentCancellation;
}

export function AppointmentMeta({
  dateLabel,
  timeLabel,
  status,
  isBirthday,
  cancellation,
}: AppointmentMetaProps) {
  return (
    <View style={styles.section} testID="appointment-meta">
      <View style={styles.topRow}>
        <View style={styles.lines}>
          <MetaLine icon={dateIcon}>{dateLabel}</MetaLine>
          <MetaLine icon={timeIcon}>{timeLabel}</MetaLine>
        </View>
        <AppointmentStatusPill status={status} />
      </View>
      {isBirthday && (
        <View
          accessible
          accessibilityLabel="Anniversaire de la cliente"
          style={styles.birthdayLine}
          testID="appointment-birthday-indication"
        >
          <SymbolView name={birthdayIcon} size={14} tintColor={rose.rose700} />
          <AppText variant="metadata" style={styles.birthdayText}>
            Anniversaire de la cliente
          </AppText>
        </View>
      )}
      {cancellation && (
        <View style={styles.outcome}>
          <AppText variant="metadata" style={styles.outcomeActor}>
            {formatCancellationActorLabel(cancellation.cancelledBy)}
          </AppText>
          {cancellation.reason && (
            <AppText variant="metadata" selectable style={styles.outcomeReason}>
              {cancellation.reason}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

function MetaLine({ icon, children }: { readonly icon: SymbolViewProps['name']; readonly children: ReactNode }) {
  return (
    <View style={styles.line}>
      <SymbolView name={icon} size={17} tintColor={semanticColors.foregroundSoft} />
      <AppText variant="body" selectable style={styles.lineText}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  lines: { flex: 1, gap: spacing.sm, minWidth: 0 },
  line: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  lineText: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  birthdayLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  birthdayText: { color: rose.rose700 },
  outcome: { gap: spacing.xs },
  outcomeActor: { color: rose.rose600 },
  outcomeReason: { color: semanticColors.foregroundSoft },
});
