// BeautIzzy — Prestation description sheet (shared prestation catalogue)
//
// Opened from the « i » of a picker card: what the professional wrote about a
// catalogue prestation (what is included, how the client prepares). Read
// only — it is catalogue information, never the Appointment's own data: it is
// titled as the prestation's description, so it can not be mistaken for a
// client note, and nothing here is copied into the Appointment snapshot.
// Selecting stays the card's tap; the sheet only closes.

import { StyleSheet, View } from 'react-native';

import type { Service } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
} from '../presentation';

interface ServiceDescriptionSheetProps {
  /** Kept while the sheet slides down, so its content never blanks out. */
  readonly service: Service | undefined;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onDismissed?: () => void;
}

export function ServiceDescriptionSheet({
  service,
  visible,
  onClose,
  onDismissed,
}: ServiceDescriptionSheetProps) {
  return (
    <BottomSheet
      backdropLabel="Fermer la description"
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: onClose, testID: 'service-description-close' }}
          eyebrow="DESCRIPTION DE LA PRESTATION"
          title={service?.name ?? ''}
          titleNumberOfLines={2}
        />
      }
      onClose={onClose}
      onDismissed={onDismissed}
      scrollable
      testID="service-description-sheet"
      visible={visible && service !== undefined}
    >
      {service && (
        <View style={styles.body}>
          <AppText variant="metadata" style={styles.meta}>
            {`${formatCreationDuration(getServiceDurationMinutes(service))} · ${formatCreationPrice(service.price)}`}
          </AppText>
          <AppText selectable variant="body" style={styles.description} testID="service-description-text">
            {service.description}
          </AppText>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingBottom: spacing.lg },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  description: { color: semanticColors.foreground },
});
