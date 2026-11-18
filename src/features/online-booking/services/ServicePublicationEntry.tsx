// BeautIzzy — the « Prestations proposées en ligne » entry of Réservation en ligne
//
// One row above the publication switches: how many services are offered
// over how many could be, read from the SERVER (never the device's
// catalogue), and what that means for the page. It opens the dedicated screen;
// it never edits anything itself and never touches the profile form.
//
// Read when the settings screen is (again) focused — back from the list, the
// count is the server's new answer; the previous count stays on screen until
// it arrives. A project without the service-publication migration reads as
// « Bientôt disponible », any other failure as an invitation: the row is
// never a spinner that does not end.

import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { foregroundSoft, interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { OnlineBookingGatewayError, type OnlineBookingGateway } from '../gateway';

import {
  describeServicePublicationEntry,
  SERVICE_PUBLICATION_ROW_HINT,
  SERVICE_PUBLICATION_ROW_TITLE,
  type ServicePublicationEntryState,
} from './presentation';

interface ServicePublicationEntryProps {
  readonly gateway: OnlineBookingGateway;
  readonly businessId: string;
  readonly onOpen: () => void;
}

export function ServicePublicationEntry({ gateway, businessId, onOpen }: ServicePublicationEntryProps) {
  const focused = useIsFocused();
  const [state, setState] = useState<ServicePublicationEntryState>({ status: 'loading' });

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    gateway
      .readServicePublication(businessId)
      .then((publication) => {
        if (!cancelled) setState({ status: 'ready', publication });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(
          error instanceof OnlineBookingGatewayError && error.code === 'UNAVAILABLE'
            ? { status: 'unavailable' }
            : { status: 'failed' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, focused, gateway]);

  const summary = describeServicePublicationEntry(state);

  return (
    <GroupedSurface testID="online-booking-services-entry">
      <Pressable
        accessibilityHint={SERVICE_PUBLICATION_ROW_HINT}
        accessibilityLabel={`${SERVICE_PUBLICATION_ROW_TITLE}, ${summary}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        testID="online-booking-services-open"
      >
        <View style={styles.copy}>
          <AppText variant="rowTitle">{SERVICE_PUBLICATION_ROW_TITLE}</AppText>
          <AppText
            variant="metadata"
            style={state.status === 'ready' ? styles.summary : styles.soft}
            testID="online-booking-services-summary"
          >
            {summary}
          </AppText>
          <AppText variant="metadata" style={styles.soft}>
            {SERVICE_PUBLICATION_ROW_HINT}
          </AppText>
        </View>
        <NavigationChevron />
      </Pressable>
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: semanticColors.surfaceLavender, opacity: interaction.pressedOpacity },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  summary: { color: semanticColors.accent, fontWeight: '600' },
  soft: { color: foregroundSoft },
});
