// BeautIzzy — « Rappel cliente » status line (Appointment Details)
//
// A discreet metadata line in the family of the birthday mention: the
// server-side reminder state of THIS appointment, read through the narrow
// owner projection (never the queue). The server is authoritative and may
// lag a local offline edit until sync reaches it — the row shows the last
// state the server holds, and simply shows NOTHING while it cannot answer
// (offline, unsynced appointment, unavailable gateway): no scary failure,
// no invented claim. « Envoyé » means the provider accepted the email —
// never a delivery or read claim.

import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import type { AppointmentReminderStatus } from '@/features/communications/gateway';
import {
  APPOINTMENT_REMINDER_ROW_LABEL,
  formatAppointmentReminderStatus,
} from '@/features/communications/presentation';
import { useCommunicationsGateway } from '@/features/communications/session/CommunicationsGatewayProvider';
import { AppText } from '@/shared/ui/AppText';
import { semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentReminderRowProps {
  readonly appointment: Appointment;
}

export function AppointmentReminderRow({ appointment }: AppointmentReminderRowProps) {
  const gateway = useCommunicationsGateway();
  const business = useCurrentBusiness();
  const [status, setStatus] = useState<AppointmentReminderStatus>();

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
    gateway
      .readAppointmentReminderStatus(business.id, appointment.id)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        // Fail safe: no answer, no row — never a technical failure surface.
        if (!cancelled) setStatus(undefined);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, business.id, appointmentFacts]);

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
  text: { color: semanticColors.foregroundSoft, flexShrink: 1 },
});
