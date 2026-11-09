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
//
// Quantity mode (appointment creation and editing, and estimations —
// `onDecrement` given): the same Service may be selected several times. A selected card then trades its
// check for a « ×2 » badge and shows two compact [−] [+] controls in its
// lower-right corner; the card tap adds one more, [−] removes one, and at 0
// the card is idle again. The controls' room is reserved on idle cards too,
// so selecting never moves the grid. VoiceOver reaches them as the card's
// « Ajouter une fois de plus » / « Retirer une fois » actions.

import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type Insets } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import type { Service, ServiceType } from '@/domain/appointments';
import {
  getAppointmentWording,
  type CatalogueOrganization,
} from '@/features/services/catalogue-presentation';
import { AppText } from '@/shared/ui/AppText';
import {
  duration as motionDuration,
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
  formatServiceQuantity,
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
  /**
   * Quantity mode: removes one occurrence. Given, a selected card shows its
   * quantity and the [−] [+] controls ([+] calls `onPress`).
   */
  readonly onDecrement?: () => void;
  /** How many times the Service is selected (quantity mode); 1 by default. */
  readonly quantity?: number;
  /** [−] unavailable (e.g. the last prestation of an existing Appointment). */
  readonly decrementDisabled?: boolean;
}

const SHOW_DESCRIPTION_ACTION = 'showDescription';
const INCREMENT_ACTION = 'increment';
const DECREMENT_ACTION = 'decrement';

export function ServiceSelectionCard({
  service,
  selected,
  onPress,
  accessibilityHint,
  organization = 'SERVICE_TYPES',
  onShowDescription,
  onDecrement,
  quantity = 1,
  decrementDisabled = false,
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
  const quantityMode = onDecrement !== undefined;
  const showQuantity = quantityMode && selected;
  const canDecrement = showQuantity && !decrementDisabled;
  const accessibilityActions = [
    ...(showQuantity
      ? [
          { name: INCREMENT_ACTION, label: 'Ajouter une fois de plus' },
          ...(canDecrement ? [{ name: DECREMENT_ACTION, label: 'Retirer une fois' }] : []),
        ]
      : []),
    ...(showDescription ? [{ name: SHOW_DESCRIPTION_ACTION, label: 'Voir la description' }] : []),
  ];

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={[
        service.name,
        pose ? `${duration} ${pose}` : duration,
        price,
        ...(wording.distinguishesTypes ? [spokenCategory[service.type]] : []),
        ...(showQuantity ? [`quantité ${quantity}`] : []),
      ].join(', ')}
      accessibilityActions={accessibilityActions.length > 0 ? accessibilityActions : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onAccessibilityAction={(event) => {
        switch (event.nativeEvent.actionName) {
          case SHOW_DESCRIPTION_ACTION:
            showDescription?.();
            break;
          case INCREMENT_ACTION:
            if (showQuantity) onPress();
            break;
          case DECREMENT_ACTION:
            if (canDecrement) onDecrement?.();
            break;
        }
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
      {showQuantity ? (
        <QuantityBadge
          color={colors.accent}
          quantity={quantity}
          testID={`service-card-${service.id}-quantity`}
        />
      ) : selected && (
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
      <View style={[styles.copy, quantityMode && styles.copyQuantity]}>
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
        <View style={styles.trailing}>
          {showDescription && (
            // Touch only: VoiceOver reaches the description through the card's action.
            <Pressable
              accessibilityElementsHidden
              // In quantity mode the [−] area starts right after it: no overlap.
              hitSlop={quantityMode ? infoHitSlopBeforeStepper : spacing.sm}
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
          {quantityMode &&
            (showQuantity ? (
              <View style={[styles.stepper, showDescription && styles.stepperAfterInfo]}>
                <StepButton
                  accessibilityLabel={`Retirer une fois ${service.name}`}
                  color={colors.strong}
                  disabled={!canDecrement}
                  hitSlop={decrementHitSlop}
                  icon={{ ios: 'minus', android: 'remove' }}
                  onPress={() => onDecrement?.()}
                  testID={`service-card-${service.id}-decrement`}
                />
                <StepButton
                  accessibilityLabel={`Ajouter une fois de plus ${service.name}`}
                  color={colors.strong}
                  hitSlop={incrementHitSlop}
                  icon={{ ios: 'plus', android: 'add' }}
                  onPress={onPress}
                  testID={`service-card-${service.id}-increment`}
                />
              </View>
            ) : (
              // The controls' room, kept on idle cards: selecting never jumps.
              <View
                style={[styles.stepper, styles.stepperPlaceholder, showDescription && styles.stepperAfterInfo]}
              />
            ))}
        </View>
      </View>
    </Pressable>
  );
}

/** The « ×2 » badge; a short, subtle pulse on every quantity change. */
function QuantityBadge({
  quantity,
  color,
  testID,
}: {
  readonly quantity: number;
  readonly color: string;
  readonly testID: string;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const previous = useRef(quantity);

  useEffect(() => {
    if (previous.current === quantity) return;
    previous.current = quantity;
    if (reducedMotion) return;
    scale.set(
      withSequence(
        withTiming(1.18, { duration: motionDuration.tap }),
        withTiming(1, { duration: motionDuration.state }),
      ),
    );
  }, [quantity, reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View
      style={[styles.quantityBadge, { backgroundColor: color }, animatedStyle]}
      testID={testID}
    >
      <AppText variant="metadata" numberOfLines={1} style={styles.quantityText}>
        {formatServiceQuantity(quantity)}
      </AppText>
    </Animated.View>
  );
}

/**
 * One compact [−] / [+]: a small round glyph, a 44 × 44 pt touch area (its
 * `hitSlop`, see the geometry below). Its own Pressable, so a press never
 * reaches the card underneath. A disabled button
 * still takes the touch (and ignores it): a disabled Pressable would let the
 * tap fall through to the card, which adds one more.
 */
function StepButton({
  icon,
  color,
  disabled = false,
  hitSlop,
  onPress,
  accessibilityLabel,
  testID,
}: {
  readonly icon: { readonly ios: 'minus' | 'plus'; readonly android: 'remove' | 'add' };
  readonly color: string;
  readonly disabled?: boolean;
  readonly hitSlop: Insets;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={hitSlop}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={({ pressed }) => [
        styles.stepButton,
        disabled && styles.stepButtonDisabled,
        pressed && !disabled && styles.stepButtonPressed,
      ]}
      testID={testID}
    >
      <SymbolView
        name={icon}
        size={12}
        tintColor={disabled ? semanticColors.foregroundMuted : color}
        weight="semibold"
      />
    </Pressable>
  );
}

// The border sits INSIDE the card box: padding and badge offsets give it
// back, so idle and selected cards keep the exact same geometry.
const cardBorderWidth = 1.5;
const checkSize = 20;
// The quantity badge may read « ×12 »: the name keeps clear of its widest form.
const quantityBadgeRoom = 30;
const cardPadding = spacing.md - cardBorderWidth;

// [−] [+] geometry. Each button is visually 28 pt, 8 pt apart, and answers a
// 44 × 44 pt area through its hitSlop alone, so the layout never grows:
//   - vertically 8 pt each side (inside the card's 10.5 pt bottom padding);
//   - between the two, 4 pt each: the areas meet, they never overlap;
//   - outward 12 pt: [+] reaches exactly the card's inner border (the
//     stepper sits `stepperInset` from the content edge for that), [−] ends
//     exactly where the « i » button's own area stops.
const stepGeometry = {
  size: 28,
  target: 44,
  gap: spacing.sm,
} as const;
const stepInner = stepGeometry.gap / 2;
const stepOuter = stepGeometry.target - stepGeometry.size - stepInner;
const stepVertical = (stepGeometry.target - stepGeometry.size) / 2;
const stepperInset = stepOuter - cardPadding;
const decrementHitSlop: Insets = {
  top: stepVertical,
  bottom: stepVertical,
  left: stepOuter,
  right: stepInner,
};
const incrementHitSlop: Insets = {
  top: stepVertical,
  bottom: stepVertical,
  left: stepInner,
  right: stepOuter,
};
// The « i » keeps its 8 pt area, except toward the [−] it is followed by.
const infoHitSlopBeforeStepper: Insets = {
  top: spacing.sm,
  bottom: spacing.sm,
  left: spacing.sm,
  right: 0,
};

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: cardBorderWidth,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 96,
    padding: cardPadding,
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
  quantityBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: checkSize,
    justifyContent: 'center',
    minWidth: checkSize,
    paddingHorizontal: 6,
    position: 'absolute',
    right: spacing.sm - cardBorderWidth,
    top: spacing.sm - cardBorderWidth,
  },
  quantityText: {
    color: semanticColors.onAccent,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  // Room for the check badge: a long name never runs under it.
  copy: { gap: 2, paddingRight: checkSize },
  copyQuantity: { paddingRight: quantityBadgeRoom },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  // A wide price on a narrow card lets the controls wrap under it, right-aligned.
  footer: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.xs,
  },
  trailing: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginLeft: 'auto' },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: stepGeometry.gap,
    marginRight: stepperInset,
  },
  // After the « i » (4 pt trailing gap): room for the [−] outward area.
  stepperAfterInfo: { marginLeft: stepOuter - spacing.xs },
  stepperPlaceholder: { height: stepGeometry.size, width: stepGeometry.size * 2 + stepGeometry.gap },
  stepButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    height: stepGeometry.size,
    justifyContent: 'center',
    width: stepGeometry.size,
  },
  stepButtonDisabled: { opacity: 0.5 },
  stepButtonPressed: { opacity: interaction.pressedOpacity, transform: [{ scale: 0.92 }] },
  price: { color: semanticColors.foreground, flexShrink: 1, fontVariant: ['tabular-nums'] },
  infoButton: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  infoButtonPressed: { opacity: interaction.pressedOpacity },
});
