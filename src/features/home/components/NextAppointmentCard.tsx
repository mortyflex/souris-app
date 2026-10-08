// BeautIzzy — Accueil « Prochain rendez-vous »
//
// The hero card of Accueil, and the only tinted surface of the page: the
// strong BeautIzzy lavender, an accent eyebrow, WHEN the Appointment starts
// on a line of its own (so a dated « Jeu. 18 mars · 09:30 » always fits),
// then a row — the client's portrait (the shared ClientAvatar — photo from
// the shared media cache, initials otherwise) in a white ring, WHO it is for
// as the strongest text, and its prestation summary. The chevron closes the
// line of the time, which leaves the row its whole width.
//
// It is built for the wide column of the Accueil top row — about 210 pt on
// an iPhone SE — so the name may take two lines; only the prestation is ever
// cut. The whole card opens the existing Appointment Details. Everything is
// read from the Appointment snapshot and the Client already in the sessions.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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

const AVATAR_SIZE = 44;
/** White ring that lifts the lavender initials frame off the lavender card. */
const AVATAR_RING = 2;

interface NextAppointmentCardProps {
  readonly appointment: Appointment;
  /** Absent when the Client no longer exists: the card keeps its text. */
  readonly client: Client | undefined;
  readonly now: Date;
  readonly onPress: () => void;
  /** Layout only: how the card sits in the top area of Accueil. */
  readonly style?: StyleProp<ViewStyle>;
}

export function NextAppointmentCard({
  appointment,
  client,
  now,
  onPress,
  style,
}: NextAppointmentCardProps) {
  const photoUri = useClientPhotoUri(client?.photoPath);
  const clientName = getResolvedClientDisplayName(client);
  const when = formatNextAppointmentWhen(appointment.startAt, now);
  const summary = formatAppointmentServiceSummary(appointment);

  return (
    <Pressable
      accessibilityLabel={`Prochain rendez-vous, ${when}, ${clientName}, ${summary}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
      testID="home-next-appointment"
    >
      <View style={styles.heading}>
        <AppText variant="eyebrow" numberOfLines={1} style={styles.eyebrow}>
          Prochain rendez-vous
        </AppText>
        <View style={styles.whenRow}>
          <AppText variant="control" numberOfLines={1} style={styles.when}>
            {when}
          </AppText>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={14}
            tintColor={semanticColors.accent}
          />
        </View>
      </View>
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
          <AppText variant="sheetTitle" numberOfLines={2} style={styles.client}>
            {clientName}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.summary}>
            {summary}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    // The row is centred in whatever height the pair of cards shares.
    justifyContent: 'center',
    minWidth: 0,
    padding: spacing.md,
  },
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  heading: { gap: spacing.xs },
  eyebrow: { color: semanticColors.accent },
  body: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  avatarRing: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    // The portrait frame's own corner (a quarter of its side) plus the ring.
    borderRadius: AVATAR_SIZE / 4 + AVATAR_RING,
    padding: AVATAR_RING,
  },
  copy: { flex: 1, minWidth: 0 },
  // The chevron closes the line of the time: the row below keeps its whole
  // width for the name and the prestation.
  whenRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  when: { color: foregroundSoft, flex: 1, fontVariant: ['tabular-nums'] },
  client: { color: semanticColors.foreground },
  summary: { color: foregroundSoft },
});
