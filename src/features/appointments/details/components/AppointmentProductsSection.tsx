// BeautIzzy — « Produits vendus » of one Appointment
//
// The Products sold during the Appointment (Sales carrying its id), read
// from Sale snapshots only: catalog edits or deletion never change what is
// shown. The PRODUCT is the visual unit — one compact row per sold Product
// snapshot, quantities aggregated across every Revente (domain derivation,
// the underlying Sales are never rewritten). No Sale container, no
// subtotal, no visible delete button: each row is swiped to delete. The
// screen owns the ONE swipe hint of its instance and names the row that
// plays it (`hintKey`), so Services and Products never hint at once.
// Once the Appointment received its money (`onOpenLine`), rows are no longer
// swiped away: each opens its Sale, where it is corrected or refunded.

import { StyleSheet, View } from 'react-native';

import {
  getAppointmentProductUnitCount,
  type AppointmentProductLine,
} from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { AppointmentProductRow } from './AppointmentProductRow';

interface AppointmentProductsSectionProps {
  readonly lines: readonly AppointmentProductLine[];
  /** Deletes the displayed Product row; returns whether the deletion was committed. */
  readonly onDeleteLine: (line: AppointmentProductLine) => boolean;
  /** Key of the Product row designated by the screen to play the swipe hint, if any. */
  readonly hintKey?: string;
  /** Settled Appointment: a row opens its Sale (correction / refund) instead of being deleted. */
  readonly onOpenLine?: (line: AppointmentProductLine) => void;
}

export const SETTLED_PRODUCTS_NOTE = 'Rendez-vous encaissé : touchez un produit pour le corriger ou le rembourser.';

export function AppointmentProductsSection({
  lines,
  onDeleteLine,
  hintKey,
  onOpenLine,
}: AppointmentProductsSectionProps) {
  if (lines.length === 0) return null;

  return (
    <View style={styles.section} testID="appointment-products">
      <SectionHeader count={getAppointmentProductUnitCount(lines)} title="Produits vendus" />
      <View style={styles.surface}>
        {lines.map((line) => (
          <AppointmentProductRow
            key={line.key}
            hint={onOpenLine === undefined && line.key === hintKey}
            line={line}
            onDelete={() => onDeleteLine(line)}
            onOpen={onOpenLine ? () => onOpenLine(line) : undefined}
          />
        ))}
      </View>
      {onOpenLine && (
        <AppText variant="metadata" style={styles.note} testID="appointment-products-settled-note">
          {SETTLED_PRODUCTS_NOTE}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.xl },
  note: { color: foregroundSoft },
  surface: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
});
