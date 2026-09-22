// Souris — Client Profile history switcher
//
// ONE content area for the two histories of a Client: a full-width
// segmented control `Rendez-vous [n] | Produits achetés [n]` replaces only the
// preview below it. Each preview shows at most CLIENT_HISTORY_PREVIEW_LIMIT
// records in one grouped surface; « Voir les N … » pushes the complete
// history screen — nothing ever expands inline, so the profile keeps the
// same height with 3 or 300 records. The selected tab is plain local state.

import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Sale } from '@/domain/sales';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { ClientAppointmentRow } from '../../history/ClientAppointmentRow';
import { ClientSaleRow } from '../../history/ClientSaleRow';
import { getClientHistoryPreview, hasMoreClientHistory } from '../presentation';

type ClientHistoryTab = 'appointments' | 'purchases';

interface ClientHistorySectionProps {
  /** The client's appointments in reading order (upcoming, then history). */
  readonly appointments: readonly AppointmentSessionEntry[];
  /** The client's Sales, newest first. */
  readonly purchases: readonly Sale[];
  readonly onOpenAppointment: (appointmentId: string) => void;
  readonly onOpenAppointmentHistory: () => void;
  readonly onOpenPurchaseHistory: () => void;
}

export function ClientHistorySection({
  appointments,
  purchases,
  onOpenAppointment,
  onOpenAppointmentHistory,
  onOpenPurchaseHistory,
}: ClientHistorySectionProps) {
  const [tab, setTab] = useState<ClientHistoryTab>('appointments');
  const options: readonly SegmentedControlOption<ClientHistoryTab>[] = [
    {
      value: 'appointments',
      label: 'Rendez-vous',
      count: appointments.length,
      testID: 'client-history-tab-appointments',
    },
    {
      value: 'purchases',
      label: 'Produits achetés',
      count: purchases.length,
      testID: 'client-history-tab-purchases',
    },
  ];

  return (
    <View style={styles.section}>
      <SegmentedControl
        onChange={setTab}
        options={options}
        stretch
        testID="client-history-tabs"
        value={tab}
      />
      {tab === 'appointments' ? (
        appointments.length === 0 ? (
          <EmptyHistory text="Aucun rendez-vous enregistré." />
        ) : (
          <GroupedSurface testID="client-appointments-preview">
            {getClientHistoryPreview(appointments).map(({ appointment }, index) => (
              <Fragment key={appointment.id}>
                {index > 0 && <GroupedSeparator inset={spacing.base} />}
                <ClientAppointmentRow
                  appointment={appointment}
                  onPress={() => onOpenAppointment(appointment.id)}
                />
              </Fragment>
            ))}
            {hasMoreClientHistory(appointments.length) && (
              <HistoryLink
                label={`Voir les ${appointments.length} rendez-vous`}
                onPress={onOpenAppointmentHistory}
                testID="open-client-appointment-history"
              />
            )}
          </GroupedSurface>
        )
      ) : purchases.length === 0 ? (
        <EmptyHistory text="Aucun achat enregistré." />
      ) : (
        <GroupedSurface testID="client-purchases">
          {getClientHistoryPreview(purchases).map((sale, index) => (
            <Fragment key={sale.id}>
              {index > 0 && <GroupedSeparator inset={spacing.base} />}
              <ClientSaleRow sale={sale} />
            </Fragment>
          ))}
          {hasMoreClientHistory(purchases.length) && (
            <HistoryLink
              label={`Voir les ${purchases.length} achats`}
              onPress={onOpenPurchaseHistory}
              testID="open-client-purchase-history"
            />
          )}
        </GroupedSurface>
      )}
    </View>
  );
}

function EmptyHistory({ text }: { readonly text: string }) {
  return (
    <AppText variant="metadata" style={styles.empty}>
      {text}
    </AppText>
  );
}

interface HistoryLinkProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}

function HistoryLink({ label, onPress, testID }: HistoryLinkProps) {
  return (
    <>
      <GroupedSeparator inset={spacing.base} />
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
        testID={testID}
      >
        <AppText variant="control" style={styles.linkText}>
          {label}
        </AppText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={13}
          tintColor={semanticColors.accent}
        />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  empty: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.large,
    color: foregroundSoft,
    padding: spacing.base,
  },
  link: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
    minHeight: 48,
    paddingHorizontal: spacing.base,
  },
  linkPressed: { backgroundColor: semanticColors.surfaceLavender },
  linkText: { color: semanticColors.accent },
});
