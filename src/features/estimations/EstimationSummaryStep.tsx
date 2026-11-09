// BeautIzzy — Estimation Résumé step
//
// The accessible review of an « Estimation tarifaire » before it is generated,
// in the grouped-row family of the Appointment creation Résumé
// (DESIGN_OVERRIDES.md §27):
//   1. Date         → the generation date, read-only (document metadata only)
//   2. Prestations  → one « name — current catalog price » row per Service
//                     (« Coupe femme ×3 — 75 € » when selected several times;
//                     the header counts every occurrence, like the footer),
//                     « Modifier » returns to the catalog step
//   3. Total estimé → the lavender final summary
//
// It shows the document model the paper will print, so the review and the
// generated image can never disagree. No recipient, no validity, no tax wording, no
// discount, no schedule: this is a lightweight pricing aid.

import type { SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GroupedDataRow } from '@/shared/ui/GroupedDataRow';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { EstimationDocumentModel } from './estimation-document';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const dateIcon: SymbolViewProps['name'] = { ios: 'calendar', android: 'calendar_today' };

interface EstimationSummaryStepProps {
  readonly model: EstimationDocumentModel;
  readonly onEditServices: () => void;
}

export function EstimationSummaryStep({
  model,
  onEditServices,
}: EstimationSummaryStepProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
      showsVerticalScrollIndicator={false}
      testID="estimation-summary"
    >
      <View style={styles.section}>
        <AppText variant="eyebrow" style={styles.eyebrow}>
          ESTIMATION
        </AppText>
        <GroupedSurface testID="estimation-summary-context">
          <GroupedDataRow
            icon={dateIcon}
            label="Date"
            testID="estimation-date"
            value={model.dateLabel}
          />
        </GroupedSurface>
      </View>

      <View style={styles.section}>
        <SectionHeader
          count={model.lines.reduce((count, line) => count + line.quantity, 0)}
          title="Prestations sélectionnées"
        >
          <Pressable
            accessibilityLabel="Modifier les prestations"
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={onEditServices}
            style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
            testID="estimation-edit-services"
          >
            <AppText variant="metadata" style={styles.headerActionText}>
              Modifier
            </AppText>
          </Pressable>
        </SectionHeader>
        <GroupedSurface testID="estimation-summary-services">
          {model.lines.map((line, index) => (
            <View key={line.key}>
              {index > 0 && <GroupedSeparator inset={spacing.base} />}
              <View
                accessible
                accessibilityLabel={line.accessibilityLabel}
                style={styles.serviceRow}
                testID={`estimation-summary-line-${index}`}
              >
                <AppText style={styles.serviceName} variant="body">
                  {line.label}
                </AppText>
                <AppText style={styles.servicePrice} variant="control">
                  {line.price}
                </AppText>
              </View>
            </View>
          ))}
        </GroupedSurface>
      </View>

      <View
        accessible
        accessibilityLabel={`${model.totalLabel}, ${model.total}`}
        style={styles.finalSummary}
        testID="estimation-summary-total"
      >
        <AppText variant="metadata" style={styles.finalLabel}>
          {model.totalLabel}
        </AppText>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          numberOfLines={1}
          style={styles.totalValue}
          variant="summaryValue"
        >
          {model.total}
        </AppText>
      </View>
    </ScrollView>
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
  serviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  serviceName: { color: semanticColors.foreground, flex: 1 },
  servicePrice: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  finalSummary: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.base,
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  finalLabel: { color: foregroundSoft },
  totalValue: { color: lavender.lav700, flexShrink: 1, fontVariant: ['tabular-nums'] },
});
