// BeautIzzy — Client appointment history
//
// The complete BeautIzzy Appointment history of one Client, pushed from the
// profile « Voir les N rendez-vous ». Same source as the profile preview
// (the profile's upcoming / historical selections over the Appointment session): nothing is
// copied. `Tous | À venir | Passés` only picks the existing upcoming /
// historical derivation. A virtualized grouped list keeps hundreds of rows
// cheap; every row opens the existing Appointment Details.

import { useState } from 'react';
import { Platform, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { getClientDisplayName } from '@/domain/clients';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import { bottomClearance, foregroundSoft, gutter, semanticColors, spacing } from '@/shared/ui/theme';

import {
  getHistoricalClientAppointments,
  getUpcomingClientAppointments,
  type ClientAppointmentFilter,
} from '../profile/presentation';
import { ClientAppointmentRow } from './ClientAppointmentRow';
import { ClientHistoryHeader } from './ClientHistoryHeader';
import { ClientHistoryNotFound } from './ClientHistoryNotFound';
import { groupedListItemStyle } from './grouped-list';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const FILTER_OPTIONS: readonly SegmentedControlOption<ClientAppointmentFilter>[] = [
  { value: 'ALL', label: 'Tous', testID: 'appointment-history-filter-all' },
  { value: 'UPCOMING', label: 'À venir', testID: 'appointment-history-filter-upcoming' },
  { value: 'PAST', label: 'Passés', testID: 'appointment-history-filter-past' },
];

const EMPTY_MESSAGES: Record<ClientAppointmentFilter, string> = {
  ALL: 'Aucun rendez-vous enregistré.',
  UPCOMING: 'Aucun rendez-vous à venir.',
  PAST: 'Aucun rendez-vous passé.',
};

interface HistorySection {
  readonly key: 'upcoming' | 'past';
  readonly title?: string;
  readonly data: readonly AppointmentSessionEntry[];
}

interface ClientAppointmentHistoryScreenProps {
  readonly clientId?: string;
}

export function ClientAppointmentHistoryScreen({ clientId }: ClientAppointmentHistoryScreenProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { appointments } = useAppointmentSession();
  const [filter, setFilter] = useState<ClientAppointmentFilter>('ALL');
  const client = getClientById(clientId);

  if (!client) return <ClientHistoryNotFound title="Rendez-vous" />;

  // Only the two lists: no activity figure is derived here.
  const now = new Date();
  const upcomingAppointments = getUpcomingClientAppointments(appointments, client.id, now);
  const historicalAppointments = getHistoricalClientAppointments(appointments, client.id, now);
  // Section labels only when both groups share the list.
  const labelled = filter === 'ALL' && upcomingAppointments.length > 0 && historicalAppointments.length > 0;
  const sections: HistorySection[] = [
    ...(filter !== 'PAST' && upcomingAppointments.length > 0
      ? [{ key: 'upcoming' as const, title: labelled ? 'À VENIR' : undefined, data: upcomingAppointments }]
      : []),
    ...(filter !== 'UPCOMING' && historicalAppointments.length > 0
      ? [{ key: 'past' as const, title: labelled ? 'PASSÉS' : undefined, data: historicalAppointments }]
      : []),
  ];

  const openAppointment = (appointmentId: string) => {
    router.push({ pathname: '/appointments/[appointmentId]', params: { appointmentId } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ClientHistoryHeader clientName={getClientDisplayName(client)} title="Rendez-vous" />
      <SectionList
        contentContainerStyle={styles.content}
        initialNumToRender={20}
        keyExtractor={({ appointment }) => appointment.id}
        ListEmptyComponent={
          <AppText variant="metadata" style={styles.empty}>
            {EMPTY_MESSAGES[filter]}
          </AppText>
        }
        ListHeaderComponent={
          <View style={styles.filters}>
            <SegmentedControl
              onChange={setFilter}
              options={FILTER_OPTIONS}
              stretch
              testID="appointment-history-filter"
              value={filter}
            />
          </View>
        }
        renderItem={({ item, index, section }) => (
          <View style={groupedListItemStyle(index, section.data.length)}>
            {index > 0 && <GroupedSeparator inset={spacing.base} />}
            <ClientAppointmentRow
              appointment={item.appointment}
              onPress={() => openAppointment(item.appointment.id)}
            />
          </View>
        )}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <AppText variant="eyebrow" style={styles.sectionLabel}>
              {section.title}
            </AppText>
          ) : null
        }
        sections={sections}
        SectionSeparatorComponent={SectionGap}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        testID="client-appointment-history"
      />
    </SafeAreaView>
  );
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: {
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: horizontalGutter,
  },
  filters: { paddingBottom: spacing.sm, paddingTop: spacing.base },
  sectionLabel: { color: foregroundSoft, paddingTop: spacing.sm },
  sectionGap: { height: spacing.sm },
  empty: { color: foregroundSoft, paddingTop: spacing.xl, textAlign: 'center' },
});
