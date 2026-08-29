import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import {
  foregroundSoft,
  gutter,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { AppointmentServiceSection } from './components/AppointmentServiceSection';
import { AppointmentSummary } from './components/AppointmentSummary';
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
  const router = useRouter();
  const [expandedItemIds, setExpandedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const { getAppointmentById } = useAppointmentSession();
  const { getClientById } = useClientSession();
  const entry = getAppointmentById(appointmentId);

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

  if (!entry) {
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

  const { appointment } = entry;
  const clientDisplayName = getResolvedClientDisplayName(getClientById(appointment.clientId));
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
                {clientDisplayName}
              </AppText>
            </View>
            <AppButton
              accessibilityLabel="Modifier le rendez-vous"
              onPress={() =>
                router.push({
                  pathname: '/appointments/edit/[appointmentId]',
                  params: { appointmentId: appointment.id },
                })
              }
              style={styles.modifyAction}
              testID="modify-appointment"
              title="Modifier"
              variant="tertiary"
            />
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

        <SectionHeader count={services.length} style={styles.sectionHeader} title="Prestations" />
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
  safeArea: { backgroundColor: semanticColors.screenWarm },
  content: { paddingBottom: spacing['3xl'], paddingTop: spacing.base },
  appointmentHeader: { paddingBottom: spacing.xl },
  identityHeader: { alignItems: 'stretch', flexDirection: 'row', marginBottom: spacing.base },
  identityAccent: {
    alignSelf: 'stretch',
    backgroundColor: rose.rose600,
    borderRadius: radii.pill,
    width: 4,
  },
  identityCopy: { flex: 1, gap: spacing.xs, justifyContent: 'center', marginLeft: spacing.md, minWidth: 0 },
  modifyAction: { alignSelf: 'center', paddingHorizontal: spacing.md },
  identityEyebrow: { color: rose.rose600 },
  clientName: { color: semanticColors.foreground },
  metaSurface: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose200,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
  },
  dateLine: { color: semanticColors.foreground },
  metaBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  timeLine: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  statusRow: { alignItems: 'center', flexDirection: 'row', marginLeft: spacing.sm },
  statusDot: {
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: 6,
    marginRight: spacing.xs,
    width: 6,
  },
  statusText: { color: semanticColors.accent },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  notes: {
    marginTop: spacing.xl,
  },
  noteLabel: { color: semanticColors.foreground, marginBottom: spacing.sm },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
