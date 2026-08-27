// Souris — Summary step (Appointment Creation)
//
// Editorial review screen organized in four distinct blocks, each owning a
// single concern and a single explicit edit action:
//   1. Cliente          → Changer la cliente
//   2. Rendez-vous      → Changer l'horaire (inline ±5 minute control)
//   3. Prestations      → Modifier les prestations
//   4. Total            → read-only final summary, CTA lives in the footer
//
// Every value comes from the draft snapshot (adjusted prices and processing
// durations included), never from stale catalog defaults. No data point is
// repeated across blocks.

import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  easing,
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  peach,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { AppointmentCreationSummary } from '../presentation';
import {
  formatCreationDate,
  formatCreationDuration,
  formatCreationPrice,
  formatCreationTime,
} from '../presentation';
import { TimeStepper } from './TimeStepper';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

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
  readonly onStartAtChange: (deltaMinutes: number) => void;
}

export function SummaryStep({
  clientName,
  startAt,
  summary,
  services,
  onEditClient,
  onEditServices,
  onStartAtChange,
}: SummaryStepProps) {
  const [editingTime, setEditingTime] = useState(false);
  const reducedMotion = useReducedMotion();
  const timeEntering = useMemo(
    () =>
      reducedMotion
        ? undefined
        : FadeIn.duration(160).easing(Easing.bezier(...easing.out)),
    [reducedMotion],
  );
  const timeExiting = useMemo(
    () => (reducedMotion ? undefined : FadeOut.duration(120)),
    [reducedMotion],
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <AppText variant="eyebrow" style={styles.blockEyebrow}>
            Cliente
          </AppText>
          <BlockAction
            accessibilityLabel="Changer la cliente"
            label="Changer la cliente"
            onPress={onEditClient}
            testID="edit-client"
          />
        </View>
        <AppText variant="sheetTitle" accessibilityRole="header" selectable style={styles.clientName}>
          {clientName}
        </AppText>
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <AppText variant="eyebrow" style={styles.blockEyebrow}>
            Rendez-vous
          </AppText>
          {!editingTime && (
            <BlockAction
              accessibilityLabel="Changer l'horaire"
              label="Changer l'horaire"
              onPress={() => setEditingTime(true)}
              testID="time-modifier"
            />
          )}
        </View>
        <AppText variant="control" selectable style={styles.dateLine}>
          {formatCreationDate(startAt)}
        </AppText>
        {editingTime ? (
          <Animated.View entering={timeEntering} exiting={timeExiting}>
            <TimeStepper
              startAt={startAt}
              onStep={onStartAtChange}
              onDone={() => setEditingTime(false)}
            />
          </Animated.View>
        ) : (
          <Animated.View entering={timeEntering} exiting={timeExiting}>
            <AppText variant="summaryValue" selectable style={styles.timeRange}>
              {`${formatCreationTime(startAt)} – ${formatCreationTime(summary.endAt)}`}
            </AppText>
          </Animated.View>
        )}
      </View>

      <View style={styles.block}>
        <SectionHeader count={services.length} title="Prestations">
          <BlockAction
            accessibilityLabel="Modifier les prestations"
            label="Modifier les prestations"
            onPress={onEditServices}
            testID="edit-services"
          />
        </SectionHeader>
        <View style={styles.serviceList}>
          {services.map((service) => (
            <View key={service.serviceId} style={styles.serviceRow}>
              <AppText variant="control" numberOfLines={1} style={styles.serviceName}>
                {service.serviceName}
              </AppText>
              <AppText variant="metadata" style={styles.servicePrice}>
                {formatCreationPrice(service.price)}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <AppText variant="eyebrow" style={styles.blockEyebrow}>
          Total
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
            <AppText variant="summaryValue" style={styles.finalValue}>
              {formatCreationDuration(summary.elapsedMinutes)}
            </AppText>
          </View>
          <View style={styles.priceColumn}>
            <AppText variant="metadata" style={styles.finalLabel}>
              Total
            </AppText>
            <AppText variant="summaryValue" style={styles.totalValue}>
              {formatCreationPrice(summary.totalPrice)}
            </AppText>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function BlockAction({
  accessibilityLabel,
  label,
  onPress,
  testID,
}: {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.blockAction, pressed && styles.blockActionPressed]}
      testID={testID}
    >
      <AppText variant="metadata" style={styles.blockActionText}>
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
  content: { paddingBottom: spacing.xl, paddingTop: spacing.base },
  block: { gap: spacing.sm, marginBottom: spacing.xl },
  blockHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  blockEyebrow: { color: foregroundSoft },
  blockAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  blockActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  blockActionText: { color: semanticColors.accent },
  clientName: { color: semanticColors.foreground },
  dateLine: { color: semanticColors.foregroundSoft, fontVariant: ['tabular-nums'] },
  timeRange: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
  },
  serviceList: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  serviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  serviceName: { color: semanticColors.foreground, flex: 1 },
  servicePrice: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  timeSurface: {
    backgroundColor: semanticColors.surface,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  timeRow: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  timeAccent: { borderRadius: radii.pill, height: 8, marginRight: spacing.sm, width: 8 },
  timeLabel: { flex: 1 },
  timeValue: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  finalSummary: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end' },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
