// Souris — Selected service draft card (Appointment Creation)
//
// Richer than a catalog row: shows the appointment-specific draft values
// and hosts the price and processing-duration editors. Editing here only
// affects the AppointmentItem snapshot being created — the catalog Service
// is never modified.

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, peach, radii, rose, spacing } from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import {
  formatPriceInput,
  getProcessingPhases,
  parsePriceInput,
  stepPhaseDuration,
  type SelectedServiceDraft,
} from '../draft';
import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
} from '../presentation';

interface SelectedServiceCardProps {
  readonly draft: SelectedServiceDraft;
  readonly service: Service;
  readonly onUpdatePrice: (price: number) => void;
  readonly onUpdatePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly onRemove: () => void;
}

export function SelectedServiceCard({
  draft,
  service,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
}: SelectedServiceCardProps) {
  const [priceText, setPriceText] = useState(() => formatPriceInput(draft.price));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const processingPhases = getProcessingPhases(service);

  const handlePriceChange = (text: string) => {
    setPriceText(text);
    const parsed = parsePriceInput(text);
    if (parsed === undefined) {
      setPriceInvalid(text.trim().length > 0);
      return;
    }
    setPriceInvalid(false);
    onUpdatePrice(parsed);
  };

  const handlePriceBlur = () => {
    if (priceInvalid) {
      setPriceText(formatPriceInput(draft.price));
      setPriceInvalid(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardCopy}>
          <AppText variant="control" numberOfLines={1} style={styles.serviceName}>
            {service.name}
          </AppText>
          <AppText variant="metadata" style={styles.serviceMeta}>
            {formatCreationDuration(getServiceDurationMinutes(service))}
          </AppText>
        </View>
        <AppText variant="metadata" style={styles.cardPrice}>
          {formatCreationPrice(draft.price)}
        </AppText>
      </View>

      <View style={styles.customization}>
        <View style={styles.priceRow}>
          <AppText variant="metadata" style={styles.fieldLabel}>
            Prix
          </AppText>
          <View style={styles.priceField}>
            <TextInput
              accessibilityLabel={`Prix de ${service.name}`}
              keyboardType="decimal-pad"
              onBlur={handlePriceBlur}
              onChangeText={handlePriceChange}
              selectTextOnFocus
              style={[styles.priceInput, priceInvalid && styles.priceInputInvalid]}
              value={priceText}
            />
            <AppText variant="metadata" style={styles.currencySuffix}>
              €
            </AppText>
          </View>
        </View>
        {priceInvalid && (
          <AppText variant="metadata" style={styles.priceError}>
            Prix invalide
          </AppText>
        )}

        {processingPhases.map((phase) => {
          const value = draft.phaseDurationOverrides[phase.id] ?? phase.durationMinutes;
          const atMinimum = value <= 0;
          return (
            <View key={phase.id} style={styles.processingRow}>
              <AppText variant="metadata" style={styles.fieldLabel}>
                {phase.name}
              </AppText>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Réduire ${phase.name}`}
                  accessibilityState={{ disabled: atMinimum }}
                  disabled={atMinimum}
                  onPress={() =>
                    onUpdatePhaseDuration(phase.id, stepPhaseDuration(value, -5))
                  }
                  style={({ pressed }) => [
                    styles.stepperButton,
                    atMinimum && styles.stepperButtonDisabled,
                    pressed && !atMinimum && styles.stepperButtonPressed,
                  ]}
                >
                  <AppText
                    variant="control"
                    style={[styles.stepperGlyph, atMinimum && styles.stepperGlyphDisabled]}
                  >
                    −
                  </AppText>
                </Pressable>
                <AppText variant="control" style={styles.stepperValue} testID={`phase-value-${phase.id}`}>
                  {formatCreationDuration(value)}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Augmenter ${phase.name}`}
                  onPress={() =>
                    onUpdatePhaseDuration(phase.id, stepPhaseDuration(value, 5))
                  }
                  style={({ pressed }) => [
                    styles.stepperButton,
                    pressed && styles.stepperButtonPressed,
                  ]}
                >
                  <AppText variant="control" style={styles.stepperGlyph}>
                    +
                  </AppText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.removeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${service.name}`}
          hitSlop={spacing.sm}
          onPress={onRemove}
          style={({ pressed }) => [styles.removeAction, pressed && styles.removeActionPressed]}
          testID={`remove-${draft.serviceId}`}
        >
          <AppText variant="metadata" style={styles.removeText}>
            Retirer
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lavender.lav050,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardCopy: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: colors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  cardPrice: {
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  customization: {
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldLabel: { color: foregroundSoft },
  priceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  priceField: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
  },
  priceInput: {
    color: colors.foreground,
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    minHeight: 36,
    minWidth: 72,
    paddingVertical: 0,
    textAlign: 'right',
  },
  priceInputInvalid: { color: rose.rose600 },
  currencySuffix: {
    color: foregroundSoft,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.xs,
  },
  priceError: { color: rose.rose600 },
  processingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: peach.peach050,
    borderRadius: radii.ios.default,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: peach.peach200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonPressed: { backgroundColor: peach.peach100 },
  stepperButtonDisabled: { backgroundColor: colors.surface, borderColor: colors.border },
  stepperGlyph: { color: peach.peach700, fontSize: 17, lineHeight: 20 },
  stepperGlyphDisabled: { color: colors.muted },
  stepperValue: {
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'center',
  },
  removeRow: {
    alignItems: 'flex-end',
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  removeAction: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  removeActionPressed: { opacity: 0.72 },
  removeText: { color: rose.rose600 },
});
