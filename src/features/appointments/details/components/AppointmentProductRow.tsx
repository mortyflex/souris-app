// BeautIzzy — one Product row of « Produits vendus », swipeable to delete
//
// The Product is the visual unit: snapshot name, aggregated quantity ×
// snapshot unit price, aggregated line total. No permanently visible
// delete control — the shared SwipeToDeleteRow owns the gesture; this row
// owns the Product wording, the commit haptic, and the exit animation.
//
// Once the Appointment received its money (docs/domain/SALES.md §10, §15) a
// sold Product is no longer removable: the row is then a plain button (`onOpen`)
// leading to its Sale, where it is corrected or refunded traceably.

import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeOut,
  LinearTransition,
  SlideOutRight,
  useReducedMotion,
} from 'react-native-reanimated';

import type { AppointmentProductLine } from '@/domain/appointments';
import { formatSaleQuantity } from '@/features/sales/presentation';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents, formatEuros } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SwipeToDeleteRow } from '@/shared/ui/SwipeToDeleteRow';
import { duration, foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentProductRowProps {
  readonly line: AppointmentProductLine;
  /** Performs the deletion; returns whether it was committed. */
  readonly onDelete: () => boolean;
  /** Settled Appointment: the row opens the Sale instead of being swiped away. */
  readonly onOpen?: () => void;
  /** This row plays the one-time swipe discoverability peek. */
  readonly hint?: boolean;
}

export function AppointmentProductRow({ line, onDelete, onOpen, hint = false }: AppointmentProductRowProps) {
  const reduceMotion = useReducedMotion();
  const quantityLabel = formatSaleQuantity(line.quantity);
  const unitLabel = formatEuros(line.unitPrice);
  const totalLabel = formatEuroCents(line.totalCents);

  const deleteWithFeedback = () => {
    const committed = onDelete();
    if (committed) haptics.warning();
    return committed;
  };

  if (onOpen) {
    return (
      <Pressable
        accessibilityHint="Ouvre la vente pour corriger ou rembourser ce produit"
        accessibilityLabel={`${line.productName}, ${quantityLabel} à ${unitLabel}, ${totalLabel}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.line, pressed && styles.linePressed]}
        testID={`appointment-product-${line.productId}`}
      >
        <View style={styles.copy}>
          <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
            {line.productName}
          </AppText>
          <AppText variant="metadata" style={styles.meta}>
            {quantityLabel} · {unitLabel}
          </AppText>
        </View>
        <AppText variant="control" style={styles.lineTotal}>
          {totalLabel}
        </AppText>
        <NavigationChevron />
      </Pressable>
    );
  }

  return (
    <Animated.View
      exiting={reduceMotion ? FadeOut.duration(duration.state) : SlideOutRight.duration(duration.settle)}
      layout={LinearTransition.duration(duration.settle)}
    >
      <SwipeToDeleteRow
        deleteAccessibilityLabel={`Supprimer ${line.productName} des produits vendus`}
        deleteTestID={`delete-appointment-product-${line.productId}`}
        hint={hint}
        onDelete={deleteWithFeedback}
        surfaceColor={semanticColors.surfaceElevated}
        testID={`appointment-product-${line.productId}`}
      >
        <View
          accessible
          accessibilityLabel={`${line.productName}, ${quantityLabel} à ${unitLabel}, ${totalLabel}`}
          style={styles.line}
          testID="appointment-product-line"
        >
          <View style={styles.copy}>
            <AppText variant="rowTitle" numberOfLines={1} style={styles.name}>
              {line.productName}
            </AppText>
            <AppText variant="metadata" style={styles.meta}>
              {quantityLabel} · {unitLabel}
            </AppText>
          </View>
          <AppText variant="control" style={styles.lineTotal}>
            {totalLabel}
          </AppText>
        </View>
      </SwipeToDeleteRow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  linePressed: { backgroundColor: semanticColors.surfaceLavender },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  lineTotal: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
