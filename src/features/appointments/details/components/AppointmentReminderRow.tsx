// Souris — « Rappel cliente » status line (Appointment Details)
//
// A discreet metadata line in the family of the birthday mention: the
// server-side reminder state of THIS appointment, read through the narrow
// owner projection (never the queue). The server is authoritative and may
// lag a local offline edit until sync reaches it — the row shows the last
// state the server holds, and simply shows NOTHING while it cannot answer
// (offline, unsynced appointment, unavailable gateway): no scary failure,
// no invented claim. « Envoyé » means the provider accepted the message —
// never a delivery or read claim.
//
// While SMS reminders are globally OFF (every real user in Lot C1), this
// renders EXACTLY the single email line through the legacy projection.
// With SMS enabled (the dedicated test Business), it lists one compact
// line per channel under « Rappels cliente ».

import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import type {
  AppointmentChannelReminderStatus,
  AppointmentReminderStatus,
} from '@/features/communications/gateway';
import {
  APPOINTMENT_REMINDER_ROW_LABEL,
  formatAppointmentChannelReminderStatus,
  formatAppointmentReminderStatus,
  REMINDER_CHANNEL_LABELS,
} from '@/features/communications/presentation';
import { useOptionalCommunicationPreferences } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { useCommunicationsGateway } from '@/features/communications/session/CommunicationsGatewayProvider';
import { AppText } from '@/shared/ui/AppText';
import { semanticColors, spacing } from '@/shared/ui/theme';

const CHANNEL_ROWS_LABEL = 'Rappels cliente';

interface AppointmentReminderRowProps {
  readonly appointment: Appointment;
}

export function AppointmentReminderRow({ appointment }: AppointmentReminderRowProps) {
  const gateway = useCommunicationsGateway();
  const business = useCurrentBusiness();
  const smsEnabled = useOptionalCommunicationPreferences()?.smsRemindersEnabled ?? false;
  const [status, setStatus] = useState<AppointmentReminderStatus>();
  const [channelStatuses, setChannelStatuses] =
    useState<readonly AppointmentChannelReminderStatus[]>();

  // Re-read whenever a communication-relevant fact of the appointment
  // changes locally (a quick edit, a cancellation…): the projection then
  // reflects the reconciled server state once sync carried the change.
  const appointmentFacts = [
    appointment.id,
    appointment.status,
    appointment.startAt.getTime(),
    appointment.clientId,
    appointment.clientReminderEnabled ?? null,
  ]
    .map(String)
    .join('|');

  useEffect(() => {
    if (!gateway) return;
    let cancelled = false;
    if (smsEnabled) {
      gateway
        .readAppointmentReminderStatuses(business.id, appointment.id)
        .then((result) => {
          if (!cancelled) setChannelStatuses(result);
        })
        .catch(() => {
          // Fail safe: no answer, no row — never a technical failure surface.
          if (!cancelled) setChannelStatuses(undefined);
        });
    } else {
      gateway
        .readAppointmentReminderStatus(business.id, appointment.id)
        .then((result) => {
          if (!cancelled) setStatus(result);
        })
        .catch(() => {
          if (!cancelled) setStatus(undefined);
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, business.id, smsEnabled, appointmentFacts]);

  if (smsEnabled) {
    const lines = (channelStatuses ?? [])
      .map((channelStatus) => {
        const label = formatAppointmentChannelReminderStatus(channelStatus);
        return label === undefined
          ? undefined
          : { channel: REMINDER_CHANNEL_LABELS[channelStatus.channel], label };
      })
      .filter((line): line is { channel: string; label: string } => line !== undefined);
    if (lines.length === 0) return null;

    return (
      <View
        accessible
        accessibilityLabel={`${CHANNEL_ROWS_LABEL}, ${lines
          .map((line) => `${line.channel}, ${line.label}`)
          .join(', ')}`}
        style={styles.channelBlock}
        testID="appointment-reminder-status"
      >
        <View style={styles.row}>
          <SymbolView
            name={{ ios: 'bell', android: 'notifications' }}
            size={14}
            tintColor={semanticColors.foregroundSoft}
          />
          <AppText variant="metadata" style={styles.text}>
            {CHANNEL_ROWS_LABEL}
          </AppText>
        </View>
        {lines.map((line) => (
          <AppText
            key={line.channel}
            variant="metadata"
            style={[styles.text, styles.channelLine]}
            numberOfLines={2}
            testID={`appointment-reminder-status-${line.channel}`}
          >
            {`${line.channel} · ${line.label}`}
          </AppText>
        ))}
      </View>
    );
  }

  const label = status === undefined ? undefined : formatAppointmentReminderStatus(status);
  if (label === undefined) return null;

  return (
    <View
      accessible
      accessibilityLabel={`${APPOINTMENT_REMINDER_ROW_LABEL}, ${label}`}
      style={styles.row}
      testID="appointment-reminder-status"
    >
      <SymbolView
        name={{ ios: 'bell', android: 'notifications' }}
        size={14}
        tintColor={semanticColors.foregroundSoft}
      />
      <AppText variant="metadata" style={styles.text} numberOfLines={2}>
        {`${APPOINTMENT_REMINDER_ROW_LABEL} · ${label}`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  channelBlock: { gap: 2 },
  channelLine: { marginLeft: 14 + spacing.xs },
  text: { color: semanticColors.foregroundSoft, flexShrink: 1 },
});
