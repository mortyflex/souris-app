// Souris — Catalog service row (Appointment service editor)
//
// Compact catalog row: service name primary, duration/processing metadata
// secondary, price aligned for scanning. SERVICE/TECHNIQUE internals are
// never exposed to the professional.

import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  gutter,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

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
        <AppText variant="control" numberOfLines={1} style={styles.serviceName}>
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
          <SymbolView
            name={{ ios: 'checkmark', android: 'check' }}
            size={12}
            tintColor={semanticColors.surfaceElevated}
          />
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
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  selectedServiceRow: {
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.medium,
  },
  pressedRow: { backgroundColor: semanticColors.surface },
  serviceCopy: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: semanticColors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: {
    color: foregroundSoft,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.md,
  },
  selectionMark: {
    alignItems: 'center',
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.md,
    width: 24,
  },
  selectedSelectionMark: {
    backgroundColor: semanticColors.accent,
    borderColor: semanticColors.accent,
  },
});
