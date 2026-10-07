// BeautIzzy — Service selection card (shared prestation catalogue)
//
// ONE selectable card for « Nouveau rendez-vous » and « Modifier le
// rendez-vous » (DESIGN_OVERRIDES.md §22, §27): name (two lines at most),
// duration — « 1 h · dont 30 min de pose » for a Technique with pose time —
// and price. The category colour comes from `serviceCategoryColors`, keyed by
// the domain ServiceType: violet for Services, azure for Techniques.
//
//   idle      neutral white surface, the category hairline
//   selected  the category tint, a 1.5 pt accent border, an accent check badge
//
// Selection is never colour alone: the check badge, the thicker border, the
// spoken category and `accessibilityState.selected` go with it.

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Service, ServiceType } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';

import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

const spokenCategory: Readonly<Record<ServiceType, string>> = {
  SERVICE: 'Service',
  TECHNIQUE: 'Technique',
};

interface ServiceSelectionCardProps {
  readonly service: Service;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly accessibilityHint?: string;
}

export function ServiceSelectionCard({
  service,
  selected,
  onPress,
  accessibilityHint,
}: ServiceSelectionCardProps) {
  const duration = formatCreationDuration(getServiceDurationMinutes(service));
  const processing = getServiceProcessingMinutes(service);
  const pose = processing > 0 ? `dont ${formatCreationDuration(processing)} de pose` : undefined;
  const price = formatCreationPrice(service.price);
  const colors = serviceCategoryColors[service.type];

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={[
        service.name,
        pose ? `${duration} ${pose}` : duration,
        price,
        spokenCategory[service.type],
      ].join(', ')}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected
          ? { backgroundColor: colors.tint, borderColor: colors.accent }
          : { backgroundColor: semanticColors.surfaceElevated, borderColor: colors.border },
        pressed && styles.cardPressed,
      ]}
      testID={`service-card-${service.id}`}
    >
      {selected && (
        <View
          style={[styles.checkBadge, { backgroundColor: colors.accent }]}
          testID={`service-card-${service.id}-check`}
        >
          <SymbolView
            name={{ ios: 'checkmark', android: 'check' }}
            size={11}
            tintColor={semanticColors.onAccent}
          />
        </View>
      )}
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={2} style={styles.name}>
          {service.name}
        </AppText>
        <AppText variant="metadata" numberOfLines={2} style={styles.meta}>
          {pose ? `${duration} · ${pose}` : duration}
        </AppText>
      </View>
      <AppText variant="control" numberOfLines={1} style={styles.price}>
        {price}
      </AppText>
    </Pressable>
  );
}

// The border sits INSIDE the card box: padding and badge offsets give it
// back, so idle and selected cards keep the exact same geometry.
const cardBorderWidth = 1.5;
const checkSize = 20;

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: cardBorderWidth,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 96,
    padding: spacing.md - cardBorderWidth,
  },
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  checkBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: checkSize,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm - cardBorderWidth,
    top: spacing.sm - cardBorderWidth,
    width: checkSize,
  },
  // Room for the check badge: a long name never runs under it.
  copy: { gap: 2, paddingRight: checkSize },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
