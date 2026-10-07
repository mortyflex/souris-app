// BeautIzzy — Accueil « Prochain rendez-vous »
//
// The hero card of Accueil, and the only tinted surface of the page: the
// strong BeautIzzy lavender, an accent eyebrow, then the client's portrait (the
// shared ClientAvatar — photo from the shared media cache, initials
// otherwise) in a white ring, when the Appointment starts as a supporting
// line, WHO it is for as the strongest text, and its prestation summary. The whole card opens the existing
// Appointment Details. Everything is read from the Appointment snapshot and
// the Client already in the sessions.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import { formatAppointmentServiceSummary } from '@/features/appointments/presentation';
import { ClientAvatar } from '@/features/clients/avatar/ClientAvatar';
import { useClientPhotoUri } from '@/features/clients/photo/use-client-photo-uri';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { formatNextAppointmentWhen } from '../presentation';

const AVATAR_SIZE = 56;
/** White ring that lifts the lavender initials frame off the lavender card. */
const AVATAR_RING = 2;

interface NextAppointmentCardProps {
  readonly appointment: Appointment;
  /** Absent when the Client no longer exists: the card keeps its text. */
  readonly client: Client | undefined;
  readonly now: Date;
  readonly onPress: () => void;
}

export function NextAppointmentCard({ appointment, client, now, onPress }: NextAppointmentCardProps) {
  const photoUri = useClientPhotoUri(client?.photoPath);
  const clientName = getResolvedClientDisplayName(client);
  const when = formatNextAppointmentWhen(appointment.startAt, now);
  const summary = formatAppointmentServiceSummary(appointment);

  return (
    <Pressable
      accessibilityLabel={`Prochain rendez-vous, ${when}, ${clientName}, ${summary}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID="home-next-appointment"
    >
      <AppText variant="eyebrow" numberOfLines={1} style={styles.eyebrow}>
        Prochain rendez-vous
      </AppText>
      <View style={styles.body}>
        {client !== undefined && (
          <View style={styles.avatarRing}>
            <ClientAvatar
              accessible={false}
              client={client}
              photoUri={photoUri}
              shape="portrait"
              size={AVATAR_SIZE}
            />
          </View>
        )}
        <View style={styles.copy}>
          <AppText variant="control" numberOfLines={1} style={styles.when}>
            {when}
          </AppText>
          <AppText variant="sheetTitle" numberOfLines={1} style={styles.client}>
            {clientName}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.summary}>
            {summary}
          </AppText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={15}
          tintColor={semanticColors.accent}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.md,
    padding: spacing.base,
  },
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  eyebrow: { color: semanticColors.accent },
  body: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatarRing: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    // The portrait frame's own corner (a quarter of its side) plus the ring.
    borderRadius: AVATAR_SIZE / 4 + AVATAR_RING,
    padding: AVATAR_RING,
  },
  copy: { flex: 1, minWidth: 0 },
  when: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  client: { color: semanticColors.foreground },
  summary: { color: foregroundSoft },
});
