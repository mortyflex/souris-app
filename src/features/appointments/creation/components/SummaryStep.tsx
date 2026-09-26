// Souris — Summary step (Appointment Creation)
//
// The grouped-row review of the redesigned sheets (DESIGN_OVERRIDES.md §27),
// in the same family as « Modifier le rendez-vous »:
//   1. Cliente          → ONE tappable GroupedDataRow (the row is the action)
//   2. Rendez-vous      → the shared Date / Heure group of the earlier steps:
//                          Date read-only, Heure opens the start-time wheels
//   3. Prestations      → ONE grouped sortable list (drag handle leading,
//                          chevron opens the snapshot-only price and
//                          phase-duration adjustments), « Modifier » returns
//                          to the catalog step
//   4. Options          → the « Réduction » row (preceded by the birthday
//                          suggestion when the Appointment date is the Client
//                          birthday) and, when a discount is set, its breakdown
//   5. Final summary    → Temps actif / Temps de pose only when the
//                          Appointment has pose time (otherwise Temps actif
//                          would repeat Durée totale), then Durée totale and
//                          Total. The CTA lives in the footer.
//
// Every value comes from the draft snapshot (adjusted prices and durations
// included), never from stale catalog defaults.

import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';

import type { AppointmentDiscount } from '@/domain/appointments';
import { formatDiscountAmount, formatDiscountLabel } from '@/features/appointments/presentation';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { GroupedDataRow } from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  peach,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { MissingEmailNotice } from '@/features/communications/components/MissingEmailNotice';
import { MissingPhoneNotice } from '@/features/communications/components/MissingPhoneNotice';
import {
  APPOINTMENT_REMINDER_ROW_LABEL,
  APPOINTMENT_REMINDER_TOGGLE_DESCRIPTION,
} from '@/features/communications/presentation';
import { SwitchRow } from '@/shared/ui/SwitchRow';

import { AppointmentDiscountSection } from '../../editor/components/AppointmentDiscountSection';
import { SortableDraftList, type SortableDraftEntry } from '../../editor/components/SortableDraftList';
import type { StartTimeOfDay } from '../draft-start';
import type { AppointmentCreationSummary } from '../presentation';
import { formatCreationDuration, formatCreationPrice } from '../presentation';
import { AppointmentScheduleSection } from './AppointmentScheduleSection';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const clientIcon: SymbolViewProps['name'] = { ios: 'person', android: 'person' };
/** Time rows: row padding + accent dot + gap, so separators start under the labels. */
const TIME_ROW_SEPARATOR_INSET = spacing.base + 8 + spacing.sm;

interface SummaryStepProps {
  readonly clientName: string;
  readonly startAt: Date;
  readonly summary: AppointmentCreationSummary;
  readonly discount: AppointmentDiscount | undefined;
  readonly onDiscountChange: (discount: AppointmentDiscount | undefined) => void;
  /** True when the Appointment date is the selected Client's birthday. */
  readonly birthdayReminder: boolean;
  /**
   * Per-appointment client reminder control (Lot B). Undefined while the
   * GLOBAL preference is off: the row would toggle nothing and stays away.
   */
  readonly reminder?: {
    readonly enabled: boolean;
    readonly onChange: (enabled: boolean) => void;
    /** True when the selected Client has no usable email address. */
    readonly missingClientEmail: boolean;
    readonly onAddEmail: () => void;
    /**
     * The SMS destination problem to surface (Lot C1), or undefined while
     * SMS is globally off — every real user in C1 — or the number is usable.
     */
    readonly phoneNotice?: 'missing' | 'invalid';
  };
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
  readonly minHour: number;
  readonly maxHour: number;
}

export function SummaryStep({
  clientName,
  startAt,
  summary,
  discount,
  onDiscountChange,
  birthdayReminder,
  reminder,
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
  const hasPoseTime = summary.processingMinutes > 0;
  const durationLabel = formatCreationDuration(summary.elapsedMinutes);
  const totalLabel = formatCreationPrice(summary.servicesTotal.netCents / 100);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <AppText variant="eyebrow" style={styles.eyebrow}>
          CLIENTE
        </AppText>
        <GroupedSurface testID="summary-client">
          <GroupedDataRow
            accessibilityHint="Modifier la cliente"
            icon={clientIcon}
            label="Cliente"
            onPress={onEditClient}
            testID="edit-client"
            value={clientName}
          />
        </GroupedSurface>
      </View>

      <AppointmentScheduleSection
        endAt={summary.endAt}
        maxHour={maxHour}
        minHour={minHour}
        onStartTimeChange={onStartAtChange}
        startAt={startAt}
      />

      <View style={styles.section}>
        <SectionHeader count={entries.length} title="Prestations sélectionnées">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Modifier les prestations"
            hitSlop={spacing.sm}
            onPress={onEditServices}
            style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
            testID="edit-services"
          >
            <AppText variant="metadata" style={styles.headerActionText}>
              Modifier
            </AppText>
          </Pressable>
        </SectionHeader>
        <GroupedSurface testID="summary-selected-services">
          <SortableDraftList
            canRemove={false}
            entries={entries}
            expandedDraftId={expandedDraftId}
            grouped
            onRemove={() => {}}
            onReorder={onReorder}
            onToggleExpanded={onToggleExpanded}
            onUpdatePhaseDuration={onUpdatePhaseDuration}
            onUpdatePrice={onUpdatePrice}
          />
        </GroupedSurface>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Options" />
        <AppointmentDiscountSection
          birthdayReminder={birthdayReminder}
          discount={discount}
          editorStyle={styles.discountRow}
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
        {reminder && (
          <GroupedSurface testID="summary-reminder">
            <SwitchRow
              description={APPOINTMENT_REMINDER_TOGGLE_DESCRIPTION}
              label={APPOINTMENT_REMINDER_ROW_LABEL}
              onValueChange={reminder.onChange}
              testID="appointment-reminder-toggle"
              value={reminder.enabled}
            />
          </GroupedSurface>
        )}
        {reminder?.enabled === true && reminder.missingClientEmail && (
          <MissingEmailNotice
            onAddEmail={reminder.onAddEmail}
            testID="creation-missing-email-notice"
          />
        )}
        {reminder?.enabled === true && reminder.phoneNotice !== undefined && (
          <MissingPhoneNotice
            onEditPhone={reminder.onAddEmail}
            testID="creation-missing-phone-notice"
            variant={reminder.phoneNotice}
          />
        )}
      </View>

      <View style={styles.section}>
        {/* Active / pose split only when it says more than Durée totale. */}
        {hasPoseTime && (
          <GroupedSurface testID="creation-time-breakdown">
            {summary.activeMinutes > 0 && (
              <>
                <TimeRow
                  accent={lavender.lav700}
                  label="Temps actif"
                  value={formatCreationDuration(summary.activeMinutes)}
                />
                <GroupedSeparator inset={TIME_ROW_SEPARATOR_INSET} />
              </>
            )}
            <TimeRow
              accent={peach.peach700}
              label="Temps de pose"
              value={formatCreationDuration(summary.processingMinutes)}
            />
          </GroupedSurface>
        )}
        <View
          accessible
          accessibilityLabel={`Durée totale ${durationLabel}, total ${totalLabel}`}
          style={styles.finalSummary}
          testID="creation-final-summary"
        >
          <View style={styles.durationColumn}>
            <AppText variant="metadata" style={styles.finalLabel}>
              Durée totale
            </AppText>
            <AppText variant="summaryValue" style={styles.finalValue}>
              {durationLabel}
            </AppText>
          </View>
          <View style={styles.finalDivider} />
          <View style={styles.priceColumn}>
            <AppText variant="metadata" style={styles.finalLabel}>
              Total
            </AppText>
            <AppText
              variant="summaryValue"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              numberOfLines={1}
              style={styles.totalValue}
              testID="creation-total"
            >
              {totalLabel}
            </AppText>
          </View>
        </View>
      </View>
    </ScrollView>
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
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.timeRow}>
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
  content: { gap: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.base },
  section: { gap: spacing.sm },
  eyebrow: { color: foregroundSoft },
  headerAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  headerActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  headerActionText: { color: semanticColors.accent },
  // The discount block as a white grouped row, like the lists around it.
  discountRow: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.base,
  },
  timeAccent: { borderRadius: radii.pill, height: 8, marginRight: spacing.sm, width: 8 },
  timeLabel: { flex: 1 },
  timeValue: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  finalSummary: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.base,
    padding: spacing.base,
  },
  durationColumn: { flex: 1 },
  finalDivider: {
    alignSelf: 'stretch',
    backgroundColor: semanticColors.borderSubtle,
    width: StyleSheet.hairlineWidth,
  },
  discountBreakdown: { paddingHorizontal: spacing.base },
  breakdownRow: { alignItems: 'center', flexDirection: 'row', minHeight: 28 },
  finalLabel: { color: foregroundSoft },
  finalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  priceColumn: { alignItems: 'flex-end', flex: 1 },
  totalValue: {
    color: lavender.lav700,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});
