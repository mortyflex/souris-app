// BeautIzzy — Appointment Details service accordion
//
// One row of the grouped « Prestations » list: the list owns the white
// surface, each row after the first draws its own inset separator. Collapsed:
// start time (accent), service name, compact total duration, price and a
// chevron — a row that cannot open keeps the chevron slot empty so every
// price stays in the same column. Expanded on an EDITABLE Appointment: the shared per-phase timing
// editor (±5 min steppers, no keyboard) working on a local draft, with one
// compact « Enregistrer » that persists the whole item atomically. Expanded
// on a read-only Appointment: the historical phase rows.
//
// The draft never reaches the session before Enregistrer, and the catalog
// Service is never involved: only this Appointment's snapshot changes.
//
// On an editable Appointment the row also carries the shared reorder handle
// (SortableRowList) LEADING its header, like the grouped rows of « Modifier le
// rendez-vous » and the creation Résumé, and is wrapped by Details in the
// shared SwipeToDeleteRow: tap → timing, drag handle → reorder, swipe → remove.

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import type { AppointmentPhase, AppointmentPhaseDurationUpdate } from '@/domain/appointments';
import { AppointmentPhaseTimingEditor } from '@/features/appointments/editor/components/AppointmentPhaseTimingEditor';
import { LEADING_DRAG_HANDLE_WIDTH } from '@/features/appointments/editor/components/SortableRowList';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import {
  duration,
  easing,
  foregroundSoft,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { AppointmentDetailService } from '../presentation';
import {
  formatAppointmentTime,
  formatDurationMinutes,
  formatPrice,
  isServicePhaseRedundant,
} from '../presentation';
import { AppointmentPhaseRow } from './AppointmentPhaseRow';

const TRANSITION_EASING = Easing.bezier(...easing.out);
/** Width of the start-time column; the separators are inset to the name column. */
const TIME_COLUMN_WIDTH = 44;

interface AppointmentServiceSectionProps {
  readonly service: AppointmentDetailService;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Timing controls appear only while the Appointment is editable. */
  readonly editable?: boolean;
  /** Persists the changed durations of this item; returns whether it succeeded. */
  readonly onSaveTiming?: (updates: readonly AppointmentPhaseDurationUpdate[]) => boolean;
  /** The shared reorder handle, present while the Appointment is editable and has several items. */
  readonly dragHandle?: ReactNode;
  /** Draws the inset separator above the row (every row but the first). */
  readonly separated?: boolean;
}

type DraftDurations = Readonly<Record<string, number>>;

function applyDraft(
  phases: readonly AppointmentPhase[],
  draft: DraftDurations,
): readonly AppointmentPhase[] {
  return phases.map((phase) =>
    draft[phase.id] !== undefined ? { ...phase, durationMinutes: draft[phase.id] } : phase,
  );
}

export function AppointmentServiceSection({
  service,
  expanded,
  onToggle,
  editable = false,
  onSaveTiming,
  dragHandle,
  separated = false,
}: AppointmentServiceSectionProps) {
  const { item, timelineItem } = service;
  const simple = isServicePhaseRedundant(service);
  const expandable = editable || !simple;
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<DraftDurations>({});

  const layoutTransition = useMemo(
    () => LinearTransition.duration(reducedMotion ? 0 : duration.settle).easing(TRANSITION_EASING),
    [reducedMotion],
  );

  const enteringAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeIn.duration(200).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const exitingAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeOut.duration(150).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const draftPhases = applyDraft(item.phases, draft);
  const pendingUpdates: readonly AppointmentPhaseDurationUpdate[] = item.phases.flatMap(
    (phase) => {
      const next = draft[phase.id];
      return next !== undefined && next !== phase.durationMinutes
        ? [{ phaseId: phase.id, durationMinutes: next }]
        : [];
    },
  );
  const isDirty = pendingUpdates.length > 0;
  const draftTotalMinutes = draftPhases.reduce((total, phase) => total + phase.durationMinutes, 0);

  const durationLabel = formatDurationMinutes(timelineItem.durationMinutes);
  const phaseCount = timelineItem.phases.length;
  const metaLabel = simple
    ? durationLabel
    : `${durationLabel} · ${phaseCount} phase${phaseCount > 1 ? 's' : ''}`;

  const saveTiming = () => {
    if (!isDirty || !onSaveTiming) return;
    if (onSaveTiming(pendingUpdates)) setDraft({});
  };

  const headerContent = (
    <>
      <AppText variant="chip" selectable style={styles.time}>
        {formatAppointmentTime(timelineItem.startAt)}
      </AppText>
      <View style={styles.titleBody}>
        <AppText variant="control" numberOfLines={1} selectable style={styles.serviceName}>
          {item.serviceName}
        </AppText>
        <AppText variant="metadata" style={styles.serviceMeta} testID={`service-meta-${item.id}`}>
          {metaLabel}
        </AppText>
      </View>
      <AppText variant="metadata" selectable style={styles.price}>
        {formatPrice(item.price)}
      </AppText>
      {expandable ? (
        <DisclosureChevron expanded={expanded} style={styles.chevron} />
      ) : (
        <View style={styles.chevronSlot} />
      )}
    </>
  );

  return (
    <Animated.View layout={layoutTransition} style={styles.container} testID={`service-section-${item.id}`}>
      {separated && (
        <View
          style={[
            styles.separator,
            {
              marginLeft:
                (dragHandle ? LEADING_DRAG_HANDLE_WIDTH : spacing.base) +
                TIME_COLUMN_WIDTH +
                spacing.sm,
            },
          ]}
        />
      )}
      <View style={styles.headerRow}>
        {dragHandle}
        {expandable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.serviceName}, commence à ${formatAppointmentTime(timelineItem.startAt)}`}
            accessibilityState={{ expanded }}
            onPress={onToggle}
            style={({ pressed }) => [
              styles.header,
              dragHandle !== undefined && styles.headerWithHandle,
              pressed && styles.pressed,
            ]}
          >
            {headerContent}
          </Pressable>
        ) : (
          <View
            accessibilityLabel={item.serviceName}
            style={[styles.header, dragHandle !== undefined && styles.headerWithHandle]}
          >
            {headerContent}
          </View>
        )}
      </View>
      {expandable && expanded && (
        <Animated.View entering={enteringAnimation} exiting={exitingAnimation}>
          {editable ? (
            <View style={styles.timingBody} testID={`service-timing-${item.id}`}>
              <AppointmentPhaseTimingEditor
                onChangePhaseDuration={(phaseId, minutes) =>
                  setDraft((current) => ({ ...current, [phaseId]: minutes }))
                }
                phases={draftPhases}
                serviceName={item.serviceName}
                serviceType={item.serviceType}
              />
              <View style={styles.timingFooter}>
                <AppText
                  variant="metadata"
                  style={styles.draftTotal}
                  testID={`service-draft-total-${item.id}`}
                >
                  {`Durée ${formatDurationMinutes(draftTotalMinutes)}`}
                </AppText>
                <AppButton
                  accessibilityLabel={`Enregistrer les durées de ${item.serviceName}`}
                  disabled={!isDirty}
                  onPress={saveTiming}
                  style={styles.saveAction}
                  testID={`save-service-timing-${item.id}`}
                  title="Enregistrer"
                />
              </View>
            </View>
          ) : (
            <View style={styles.expandedBody}>
              {timelineItem.phases.map((phase, index) => (
                <AppointmentPhaseRow key={phase.phaseId} phase={phase} isFirst={index === 0} />
              ))}
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: semanticColors.surfaceElevated, overflow: 'hidden' },
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row' },
  header: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    minHeight: 60,
    paddingLeft: spacing.base,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  // The leading handle already provides the left inset.
  headerWithHandle: { paddingLeft: 0 },
  pressed: { backgroundColor: semanticColors.surfaceLavender },
  time: {
    color: semanticColors.accent,
    fontVariant: ['tabular-nums'],
    marginRight: spacing.sm,
    width: TIME_COLUMN_WIDTH,
  },
  titleBody: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: semanticColors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
  chevron: { marginLeft: spacing.xs },
  chevronSlot: { marginLeft: spacing.xs, width: 24 },
  expandedBody: { paddingBottom: spacing.sm, paddingHorizontal: spacing.sm },
  timingBody: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  timingFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingLeft: spacing.xs,
  },
  draftTotal: { color: foregroundSoft, flexShrink: 1, fontVariant: ['tabular-nums'] },
  saveAction: { minWidth: 0, paddingHorizontal: spacing.base },
});
