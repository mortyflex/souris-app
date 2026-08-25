// Souris — Catalog service row (Appointment Creation)
//
// Compact catalog row: service name primary, duration/processing metadata
// secondary, price aligned for scanning. SERVICE/TECHNIQUE internals are
// never exposed to the professional.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, spacing } from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? 16 : 20;

interface CatalogServiceRowProps {
  readonly service: Service;
  readonly selected: boolean;
  readonly onPress: () => void;
}

export function CatalogServiceRow({ service, selected, onPress }: CatalogServiceRowProps) {
  const duration = getServiceDurationMinutes(service);
  const processingMinutes = getServiceProcessingMinutes(service);
  const meta =
    processingMinutes > 0
      ? `${formatCreationDuration(duration)} · ${formatCreationDuration(processingMinutes)} de pose`
      : formatCreationDuration(duration);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceRow,
        selected && styles.selectedServiceRow,
        pressed && styles.pressedRow,
      ]}
    >
      <View style={styles.serviceCopy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.serviceName}>
          {service.name}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.serviceMeta}>
          {meta}
        </AppText>
      </View>
      <AppText variant="metadata" style={styles.price}>
        {formatCreationPrice(service.price)}
      </AppText>
      <View style={[styles.selectionMark, selected && styles.selectedSelectionMark]}>
        {selected && (
          <AppText variant="chip" style={styles.selectionCheck}>
            ✓
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  serviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: horizontalGutter,
    minHeight: 60,
    paddingVertical: spacing.sm,
  },
  selectedServiceRow: { backgroundColor: lavender.lav025 },
  pressedRow: { opacity: 0.76 },
  serviceCopy: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: colors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: {
    color: foregroundSoft,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.md,
  },
  selectionMark: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.md,
    width: 24,
  },
  selectedSelectionMark: {
    backgroundColor: lavender.lav700,
    borderColor: lavender.lav700,
  },
  selectionCheck: { color: colors.background, fontSize: 11, lineHeight: 13 },
});
