// Souris — « Réduction » section (Appointment creation and editing)
//
// The generic AppointmentDiscountEditor, preceded by a birthday reminder when
// the Appointment DATE is the Client birthday (`birthdayReminder`, decided by
// the screen through the one domain rule `isClientBirthdayOnDate`).
//
// The reminder is a SUGGESTION and nothing more: « Appliquer une réduction »
// only opens the existing editor. It never selects a preset, never calls
// `onChange`, and no birthday origin exists anywhere — the professional picks
// a normal % / € discount, or none. Once a discount is set the reminder stops
// prompting and simply states it; the wording never claims the generic
// discount is a « birthday discount », because its origin is not recorded.
// While the editor is open the CTA hides: it would do nothing.

import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AppointmentDiscount, AppointmentServicesTotal } from '@/domain/appointments';
import { BirthdayNotice } from '@/features/clients/birthday/BirthdayNotice';
import { haptics } from '@/shared/lib/haptics';
import { spacing } from '@/shared/ui/theme';

import { AppointmentDiscountEditor } from './AppointmentDiscountEditor';

const TITLE = 'Anniversaire du client';
const SUGGESTION = 'Vous pouvez appliquer une réduction anniversaire.';
const ALREADY_DISCOUNTED = 'Une réduction est déjà appliquée à ce rendez-vous.';

interface AppointmentDiscountSectionProps {
  readonly discount: AppointmentDiscount | undefined;
  /** Gross, applied discount and net of the draft, from the domain. */
  readonly servicesTotal: AppointmentServicesTotal;
  readonly onChange: (discount: AppointmentDiscount | undefined) => void;
  /** True when the Appointment date is the selected Client's birthday. */
  readonly birthdayReminder: boolean;
  /** Surface override passed to the discount editor. */
  readonly editorStyle?: StyleProp<ViewStyle>;
}

export function AppointmentDiscountSection({
  discount,
  servicesTotal,
  onChange,
  birthdayReminder,
  editorStyle,
}: AppointmentDiscountSectionProps) {
  const [expanded, setExpanded] = useState(discount !== undefined);
  const message = discount ? ALREADY_DISCOUNTED : SUGGESTION;

  const openDiscountEditor = () => {
    haptics.selection();
    setExpanded(true);
  };

  return (
    <View style={styles.section}>
      {birthdayReminder && (
        <BirthdayNotice
          accessibilityLabel={`${TITLE}. ${message}`}
          action={
            discount || expanded
              ? undefined
              : {
                  label: 'Appliquer une réduction',
                  onPress: openDiscountEditor,
                  testID: 'apply-birthday-discount',
                }
          }
          messages={[message]}
          testID="appointment-birthday-notice"
          title={TITLE}
        />
      )}
      <AppointmentDiscountEditor
        discount={discount}
        expanded={expanded}
        onChange={onChange}
        onExpandedChange={setExpanded}
        servicesTotal={servicesTotal}
        style={editorStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
