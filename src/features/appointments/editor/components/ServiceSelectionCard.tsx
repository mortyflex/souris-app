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
//
// Profession-aware (`getAppointmentWording`): with the unified `CATEGORIES`
// organisation (nails, esthetics) every card takes the one Service palette,
// the type is not spoken, and unattended time reads « dont 30 min d’attente ».
//
// A prestation with a description carries a small « i » button beside the
// price (and the matching VoiceOver action): it opens the description, the
// card tap still selects. Without a description the card is unchanged.

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Service, ServiceType } from '@/domain/appointments';
import {
  getAppointmentWording,
  type CatalogueOrganization,
} from '@/features/services/catalogue-presentation';
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
  /** How the profession's catalogue is organised; the Services / Techniques experience by default. */
  readonly organization?: CatalogueOrganization;
  /** Opens the prestation's description; only offered when it has one. */
  readonly onShowDescription?: () => void;
}

const SHOW_DESCRIPTION_ACTION = 'showDescription';

export function ServiceSelectionCard({
  service,
  selected,
  onPress,
  accessibilityHint,
  organization = 'SERVICE_TYPES',
  onShowDescription,
}: ServiceSelectionCardProps) {
  const wording = getAppointmentWording(organization);
  const duration = formatCreationDuration(getServiceDurationMinutes(service));
  const processing = getServiceProcessingMinutes(service);
  const pose =
    processing > 0
      ? `dont ${formatCreationDuration(processing)} ${wording.waitingTimeSuffix}`
      : undefined;
  const price = formatCreationPrice(service.price);
  const colors = serviceCategoryColors[wording.distinguishesTypes ? service.type : 'SERVICE'];
  const showDescription = service.description !== undefined ? onShowDescription : undefined;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={[
        service.name,
        pose ? `${duration} ${pose}` : duration,
        price,
        ...(wording.distinguishesTypes ? [spokenCategory[service.type]] : []),
      ].join(', ')}
      accessibilityActions={
        showDescription
          ? [{ name: SHOW_DESCRIPTION_ACTION, label: 'Voir la description' }]
          : undefined
      }
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === SHOW_DESCRIPTION_ACTION) showDescription?.();
      }}
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
      <View style={styles.footer}>
        <AppText variant="control" numberOfLines={1} style={styles.price}>
          {price}
        </AppText>
        {showDescription && (
          // Touch only: VoiceOver reaches the description through the card's action.
          <Pressable
            accessibilityElementsHidden
            hitSlop={spacing.sm}
            importantForAccessibility="no-hide-descendants"
            onPress={showDescription}
            style={({ pressed }) => [styles.infoButton, pressed && styles.infoButtonPressed]}
            testID={`service-card-${service.id}-description`}
          >
            <SymbolView
              name={{ ios: 'info.circle', android: 'info' }}
              size={18}
              tintColor={colors.strong}
            />
          </Pressable>
        )}
      </View>
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
  footer: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' },
  price: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  infoButton: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  infoButtonPressed: { opacity: interaction.pressedOpacity },
});
