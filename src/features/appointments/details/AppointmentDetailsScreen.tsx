import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import {
  colors,
  foregroundSoft,
  gutter,
  lavender,
  radii,
  rose,
  spacing,
} from '@/shared/ui/theme';

import { AppointmentServiceSection } from './components/AppointmentServiceSection';
import { AppointmentSummary } from './components/AppointmentSummary';
import { getAgendaFixtureAppointmentById } from './fixture-lookup';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  getAppointmentDetailServices,
  getAppointmentDetailSummary,
  getAppointmentEnd,
  getAppointmentStatusLabel,
} from './presentation';

interface AppointmentDetailsScreenProps {
  readonly appointmentId?: string;
}

export function AppointmentDetailsScreen({ appointmentId }: AppointmentDetailsScreenProps) {
  const [expandedItemIds, setExpandedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const fixture = getAgendaFixtureAppointmentById(appointmentId, new Date());

  const toggleItem = (itemId: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  if (!fixture) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Rendez-vous introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous n&apos;est plus disponible.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const { appointment, clientName } = fixture;
  const services = getAppointmentDetailServices(appointment);
  const summary = getAppointmentDetailSummary(appointment);
  const endAt = getAppointmentEnd(appointment);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      >
        <View style={styles.appointmentHeader}>
          <View style={styles.identityHeader}>
            <View style={styles.identityAccent} />
            <View style={styles.identityCopy}>
              <AppText variant="eyebrow" style={styles.identityEyebrow}>
                RENDEZ-VOUS
              </AppText>
              <AppText
                variant="sheetTitle"
                accessibilityRole="header"
                selectable
                style={styles.clientName}
              >
                {clientName}
              </AppText>
            </View>
          </View>
          <View style={styles.metaSurface}>
            <AppText variant="control" selectable style={styles.dateLine}>
              {formatAppointmentDate(appointment.startAt)}
            </AppText>
            <View style={styles.metaBottomRow}>
              <AppText variant="control" selectable style={styles.timeLine}>
                {formatAppointmentTime(appointment.startAt)} – {formatAppointmentTime(endAt)}
              </AppText>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <AppText variant="chip" style={styles.statusText}>
                  {getAppointmentStatusLabel(appointment.status)}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <AppText variant="control" style={styles.sectionTitle}>
            Prestations
          </AppText>
          <AppText variant="chip" style={styles.serviceCount}>
            {services.length}
          </AppText>
        </View>
        {services.map((service) => (
          <AppointmentServiceSection
            key={service.item.id}
            expanded={expandedItemIds.has(service.item.id)}
            service={service}
            onToggle={() => toggleItem(service.item.id)}
          />
        ))}

        <AppointmentSummary summary={summary} />

        {appointment.notes && (
          <View style={styles.notes}>
            <AppText variant="control" style={styles.noteLabel}>
              Note
            </AppText>
            <AppText variant="body" selectable>
              {appointment.notes}
            </AppText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.md },
  appointmentHeader: { paddingBottom: spacing.xl },
  identityHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.md },
  identityAccent: {
    alignSelf: 'stretch',
    backgroundColor: rose.rose600,
    borderRadius: radii.ios.pill,
    width: 4,
  },
  identityCopy: { flex: 1, gap: spacing.xs, marginLeft: spacing.sm, minWidth: 0 },
  identityEyebrow: { color: rose.rose600 },
  clientName: { color: colors.foreground },
  metaSurface: {
    backgroundColor: colors.surface,
    borderColor: lavender.lav100,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
  },
  dateLine: { color: colors.foreground },
  metaBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  timeLine: { color: colors.foreground, flexShrink: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', marginLeft: spacing.sm },
  statusDot: {
    backgroundColor: lavender.lav700,
    borderRadius: radii.ios.pill,
    height: 6,
    marginRight: spacing.xs,
    width: 6,
  },
  statusText: { color: lavender.lav700 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.foreground },
  serviceCount: {
    backgroundColor: lavender.lav100,
    borderRadius: radii.ios.default,
    color: lavender.lav700,
    minWidth: 24,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    textAlign: 'center',
  },
  notes: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  noteLabel: { color: colors.foreground, marginBottom: spacing.sm },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
