// Souris — one Product row of « Produits vendus », swipeable to delete
//
// The Product is the visual unit: snapshot name, aggregated quantity ×
// snapshot unit price, aggregated line total. No permanently visible
// delete control — the shared SwipeToDeleteRow owns the gesture; this row
// owns the Product wording, the commit haptic, and the exit animation.

import { StyleSheet, View } from 'react-native';
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
import { SwipeToDeleteRow } from '@/shared/ui/SwipeToDeleteRow';
import { duration, foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentProductRowProps {
  readonly line: AppointmentProductLine;
  /** Performs the deletion; returns whether it was committed. */
  readonly onDelete: () => boolean;
  /** This row plays the one-time swipe discoverability peek. */
  readonly hint?: boolean;
}

export function AppointmentProductRow({ line, onDelete, hint = false }: AppointmentProductRowProps) {
  const reduceMotion = useReducedMotion();
  const quantityLabel = formatSaleQuantity(line.quantity);
  const unitLabel = formatEuros(line.unitPrice);
  const totalLabel = formatEuroCents(line.totalCents);

  const deleteWithFeedback = () => {
    const committed = onDelete();
    if (committed) haptics.warning();
    return committed;
  };

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
        surfaceColor={semanticColors.surfaceLavender}
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
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  lineTotal: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
