// BeautIzzy — status pill of Appointment Details
//
// ONE pill for every status: a small dot and the label on a light fill of
// the same family. The status arrives as data (label + tone); only colours
// change between Planifié, En cours, Terminé, Annulé and Absence. The label
// is always written, so the status never relies on colour alone.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { lavender, mint, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import type { AppointmentDisplayStatus, AppointmentStatusTone } from '../presentation';

const toneColors: Record<AppointmentStatusTone, { fill: string; dot: string; text: string }> = {
  scheduled: { fill: lavender.lav100, dot: semanticColors.accent, text: lavender.lav700 },
  current: { fill: mint.mint050, dot: mint.mint600, text: mint.mint650 },
  completed: { fill: semanticColors.surface, dot: semanticColors.foregroundMuted, text: semanticColors.foregroundSoft },
  exception: { fill: rose.rose050, dot: rose.rose600, text: rose.rose700 },
};

interface AppointmentStatusPillProps {
  readonly status: AppointmentDisplayStatus;
}

export function AppointmentStatusPill({ status }: AppointmentStatusPillProps) {
  const colors = toneColors[status.tone];

  return (
    <View
      accessible
      accessibilityLabel={`Statut : ${status.label}`}
      style={[styles.pill, { backgroundColor: colors.fill }]}
      testID="appointment-status-pill"
    >
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <AppText variant="chip" numberOfLines={1} style={{ color: colors.text }}>
        {status.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: 28,
    paddingHorizontal: spacing.md,
  },
  dot: { borderRadius: radii.pill, height: 6, width: 6 },
});
