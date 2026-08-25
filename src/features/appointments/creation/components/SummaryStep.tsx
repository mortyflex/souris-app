// Souris — Summary step (Appointment Creation)
//
// Clean review screen. All values come from the draft snapshot
// (adjusted prices and processing durations included), never from stale
// catalog defaults. Editing happens on the Prestations step via Modifier.

import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, peach, radii, spacing } from '@/shared/ui/theme';

import type { AppointmentCreationSummary } from '../presentation';
import {
  formatCreationDate,
  formatCreationDuration,
  formatCreationPrice,
  formatCreationTime,
} from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? 16 : 20;

interface SummaryServiceRow {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly price: number;
}

interface SummaryStepProps {
  readonly clientName: string;
  readonly startAt: Date;
  readonly summary: AppointmentCreationSummary;
  readonly services: readonly SummaryServiceRow[];
  readonly onEditClient: () => void;
  readonly onEditServices: () => void;
}

export function SummaryStep({
  clientName,
  startAt,
  summary,
  services,
  onEditClient,
  onEditServices,
}: SummaryStepProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      showsVerticalScrollIndicator={false}
    >
      <SummaryRow label="Cliente" value={clientName} onEdit={onEditClient} />
      <SummaryRow label="Date" value={formatCreationDate(startAt)} />
      <SummaryRow
        label="Horaire"
        value={`${formatCreationTime(startAt)} – ${formatCreationTime(summary.endAt)}`}
      />

      <View style={styles.sectionHeader}>
        <AppText variant="eyebrow" style={styles.sectionLabel}>
          Prestations
        </AppText>
        <EditAction label="Modifier" onPress={onEditServices} testID="edit-services" />
      </View>
      <View style={styles.serviceList}>
        {services.map((service) => (
          <View key={service.serviceId} style={styles.serviceRow}>
            <AppText variant="rowTitle" numberOfLines={1} style={styles.serviceName}>
              {service.serviceName}
            </AppText>
            <AppText variant="metadata" style={styles.servicePrice}>
              {formatCreationPrice(service.price)}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="eyebrow" style={styles.tempsLabel}>
        Temps
      </AppText>
      <View style={styles.timeSurface}>
        {summary.activeMinutes > 0 && (
          <TimeRow
            accent={lavender.lav700}
            label="Temps actif"
            value={formatCreationDuration(summary.activeMinutes)}
          />
        )}
        {summary.processingMinutes > 0 && (
          <TimeRow
            accent={peach.peach700}
            label="Temps de pose"
            value={formatCreationDuration(summary.processingMinutes)}
          />
        )}
      </View>
      <View style={styles.finalSummary}>
        <View>
          <AppText variant="metadata" style={styles.finalLabel}>
            Durée totale
          </AppText>
          <AppText variant="control" style={styles.finalValue}>
            {formatCreationDuration(summary.elapsedMinutes)}
          </AppText>
        </View>
        <View style={styles.priceColumn}>
          <AppText variant="metadata" style={styles.finalLabel}>
            Total
          </AppText>
          <AppText variant="control" style={styles.totalValue}>
            {formatCreationPrice(summary.totalPrice)}
          </AppText>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onEdit?: () => void;
}) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="metadata" style={styles.summaryLabel}>
        {label}
      </AppText>
      <AppText
        variant="control"
        numberOfLines={1}
        style={styles.summaryValue}
        selectable
      >
        {value}
      </AppText>
      {onEdit && <EditAction label="Modifier" onPress={onEdit} testID="edit-client" />}
    </View>
  );
}

function EditAction({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.editAction, pressed && styles.editActionPressed]}
      testID={testID}
    >
      <AppText variant="metadata" style={styles.editActionText}>
        {label}
      </AppText>
    </Pressable>
  );
}

function TimeRow({
  accent,
  label,
  value,
}: {
  readonly accent: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.timeRow}>
      <View style={[styles.timeAccent, { backgroundColor: accent }]} />
      <AppText variant="metadata" style={styles.timeLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.timeValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  summaryRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
  },
  summaryLabel: { width: 76 },
  summaryValue: { color: colors.foreground, flex: 1, fontVariant: ['tabular-nums'] },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  sectionLabel: { color: foregroundSoft },
  editAction: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  editActionPressed: { opacity: 0.72 },
  editActionText: { color: lavender.lav700 },
  serviceList: {
    borderBottomColor: colors.border,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
  serviceRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
  },
  serviceName: { color: colors.foreground, flex: 1 },
  servicePrice: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  tempsLabel: { color: foregroundSoft, marginTop: spacing.lg },
  timeSurface: {
    backgroundColor: colors.surface,
    borderColor: lavender.lav100,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  timeRow: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  timeAccent: { borderRadius: radii.ios.pill, height: 8, marginRight: spacing.sm, width: 8 },
  timeLabel: { flex: 1 },
  timeValue: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  finalSummary: {
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: colors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end' },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
