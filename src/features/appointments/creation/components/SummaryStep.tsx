// Souris — Summary step (Appointment Creation)
//
// Editorial review screen organized in four distinct blocks, each owning a
// single concern and a single explicit edit action:
//   1. Cliente          → Changer la cliente
//   2. Rendez-vous      → Changer l'horaire (inline ±5 minute control)
//   3. Prestations      → stacked sortable accordion editor (snapshot-only
//                          price and phase-duration adjustments)
//   4. Total            → the optional « Réduction » control (preceded by the
//                          birthday suggestion when the Appointment date is
//                          the Client birthday) and the read-only
//                          final summary (Prestations / Réduction / Total when
//                          a discount is set), CTA lives in the footer
//
// Every value comes from the draft snapshot (adjusted prices and durations
// included), never from stale catalog defaults. No data point is repeated
// across blocks.

import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

import type { AppointmentDiscount } from '@/domain/appointments';
import { formatDiscountAmount, formatDiscountLabel } from '@/features/appointments/presentation';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
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

import { AppointmentDiscountSection } from '../../editor/components/AppointmentDiscountSection';
import { SortableDraftList, type SortableDraftEntry } from '../../editor/components/SortableDraftList';
import type { StartTimeOfDay } from '../draft-start';
import type { AppointmentCreationSummary } from '../presentation';
import {
  formatCreationDate,
  formatCreationDuration,
  formatCreationPrice,
  formatCreationTime,
} from '../presentation';
import { StartTimePicker } from './StartTimePicker';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface SummaryStepProps {
  readonly clientName: string;
  readonly startAt: Date;
  readonly summary: AppointmentCreationSummary;
  readonly discount: AppointmentDiscount | undefined;
  readonly onDiscountChange: (discount: AppointmentDiscount | undefined) => void;
  /** True when the Appointment date is the selected Client's birthday. */
  readonly birthdayReminder: boolean;
  readonly entries: readonly SortableDraftEntry[];
  readonly expandedDraftId: string | null;
  readonly onToggleExpanded: (draftKey: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onUpdatePrice: (draftKey: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    draftKey: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
  readonly onEditClient: () => void;
  readonly onEditServices: () => void;
  readonly onStartAtChange: (time: StartTimeOfDay) => void;
  /** Hours offered by the start-time wheels, both inclusive. */
  readonly minHour?: number;
  readonly maxHour?: number;
}

export function SummaryStep({
  clientName,
  startAt,
  summary,
  discount,
  onDiscountChange,
  birthdayReminder,
  entries,
  expandedDraftId,
  onToggleExpanded,
  onReorder,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onEditClient,
  onEditServices,
  onStartAtChange,
  minHour,
  maxHour,
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
              onPress={() => {
                haptics.selection();
                setEditingTime(true);
              }}
              testID="time-modifier"
            />
          )}
        </View>
        <AppText variant="control" selectable style={styles.dateLine}>
          {formatCreationDate(startAt)}
        </AppText>
        {editingTime ? (
          <Animated.View entering={timeEntering} exiting={timeExiting}>
            <StartTimePicker
              maxHour={maxHour}
              minHour={minHour}
              onChange={onStartAtChange}
              onDone={() => setEditingTime(false)}
              startAt={startAt}
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
        <SectionHeader count={entries.length} title="Sélectionnées">
          <BlockAction
            accessibilityLabel="Modifier les prestations"
            label="Modifier les prestations"
            onPress={onEditServices}
            testID="edit-services"
          />
        </SectionHeader>
        <SortableDraftList
          canRemove={false}
          entries={entries}
          expandedDraftId={expandedDraftId}
          onRemove={() => {}}
          onReorder={onReorder}
          onToggleExpanded={onToggleExpanded}
          onUpdatePhaseDuration={onUpdatePhaseDuration}
          onUpdatePrice={onUpdatePrice}
        />
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
        <AppointmentDiscountSection
          birthdayReminder={birthdayReminder}
          discount={discount}
          onChange={onDiscountChange}
          servicesTotal={summary.servicesTotal}
        />
        {discount && (
          <View style={styles.discountBreakdown} testID="creation-discount-breakdown">
            <BreakdownRow
              label="Prestations"
              value={formatEuroCents(summary.servicesTotal.grossCents)}
            />
            <BreakdownRow
              label={formatDiscountLabel(discount)}
              value={formatDiscountAmount(summary.servicesTotal.discountCents)}
            />
          </View>
        )}
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
            <AppText
              variant="summaryValue"
              style={styles.totalValue}
              testID="creation-total"
            >
              {formatCreationPrice(summary.servicesTotal.netCents / 100)}
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

/** One restrained « label — amount » line of the discount breakdown. */
function BreakdownRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.breakdownRow}>
      <AppText variant="metadata" style={styles.timeLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.timeValue}>
        {value}
      </AppText>
    </View>
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
  discountBreakdown: { paddingHorizontal: spacing.base },
  breakdownRow: { alignItems: 'center', flexDirection: 'row', minHeight: 28 },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end' },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
