// Souris — « Produits vendus » of one Appointment
//
// The Products sold during the Appointment (Sales carrying its id), read
// from Sale snapshots only: catalog edits or deletion never change what is
// shown. The PRODUCT is the visual unit — one compact row per sold Product
// snapshot, quantities aggregated across every Revente (domain derivation,
// the underlying Sales are never rewritten). No Sale container, no
// subtotal, no visible delete button: each row is swiped to delete. The
// screen owns the ONE swipe hint of its instance and names the row that
// plays it (`hintKey`), so Services and Products never hint at once.

import { StyleSheet, View } from 'react-native';

import {
  getAppointmentProductUnitCount,
  type AppointmentProductLine,
} from '@/domain/appointments';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { AppointmentProductRow } from './AppointmentProductRow';

interface AppointmentProductsSectionProps {
  readonly lines: readonly AppointmentProductLine[];
  /** Deletes the displayed Product row; returns whether the deletion was committed. */
  readonly onDeleteLine: (line: AppointmentProductLine) => boolean;
  /** Key of the Product row designated by the screen to play the swipe hint, if any. */
  readonly hintKey?: string;
}

export function AppointmentProductsSection({
  lines,
  onDeleteLine,
  hintKey,
}: AppointmentProductsSectionProps) {
  if (lines.length === 0) return null;

  return (
    <View style={styles.section} testID="appointment-products">
      <SectionHeader count={getAppointmentProductUnitCount(lines)} title="Produits vendus" />
      <View style={styles.surface}>
        {lines.map((line) => (
          <AppointmentProductRow
            key={line.key}
            hint={line.key === hintKey}
            line={line}
            onDelete={() => onDeleteLine(line)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.xl },
  surface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
});
