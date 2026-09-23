// Souris — Client avatar
//
// The ONE identity frame of a Client. Two states, one frame:
//
// - photo: a portrait fills the frame (`cover`: cropped, never distorted);
// - initials: up to two initials on the quiet lavender of Souris.
//
// Two shapes of the same square: a `circle` for compact uses, and the
// softly rounded `portrait` of the Client Profile, large enough for a real
// photo (its corners scale with the size, like a continuous-curve card).
//
// Client photos do not exist yet, so every caller renders the initials today.
// `photoUri` is the seam for that later feature: once a portrait has a stable
// reference, passing it swaps the content inside the SAME frame — no caller
// layout changes. A portrait that fails to load falls back to the initials.
// Nothing here picks, stores or uploads an image, and nothing suggests the
// user can add one: an edit affordance belongs to the future photo feature.
//
// Spoken as the Client's name, never as a decorative « image ».

import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { getClientDisplayName, getClientInitials, type Client } from '@/domain/clients';
import { AppText } from '@/shared/ui/AppText';
import { semanticColors } from '@/shared/ui/theme';

export type ClientAvatarShape = 'circle' | 'portrait';

/** Corner radius of the `portrait` frame, relative to its side (24 at 96). */
const PORTRAIT_CORNER_RATIO = 0.25;

interface ClientAvatarProps {
  readonly client: Pick<Client, 'firstName' | 'lastName'>;
  /** A displayable portrait, once client photos exist. Absent → initials. */
  readonly photoUri?: string;
  /** Side of the square frame in dp; the initials and corners scale with it. */
  readonly size?: number;
  readonly shape?: ClientAvatarShape;
  readonly testID?: string;
}

export function ClientAvatar({
  client,
  photoUri,
  size = 72,
  shape = 'circle',
  testID = 'client-avatar',
}: ClientAvatarProps) {
  // The failed URI, not a flag: a new portrait gets its own chance to load.
  const [failedPhotoUri, setFailedPhotoUri] = useState<string>();
  const showsPhoto = photoUri !== undefined && photoUri !== failedPhotoUri;
  const displayName = getClientDisplayName(client);

  return (
    <View
      accessible
      accessibilityLabel={showsPhoto ? `Photo de ${displayName}` : displayName}
      accessibilityRole="image"
      style={[
        styles.frame,
        {
          borderRadius: shape === 'circle' ? size / 2 : size * PORTRAIT_CORNER_RATIO,
          height: size,
          width: size,
        },
      ]}
      testID={testID}
    >
      {showsPhoto ? (
        <Image
          accessible={false}
          contentFit="cover"
          onError={() => setFailedPhotoUri(photoUri)}
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-photo`}
          transition={120}
        />
      ) : (
        <AppText
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={[styles.initials, { fontSize: size * 0.32, lineHeight: size * 0.4 }]}
          testID={`${testID}-initials`}
          variant="screenTitle"
        >
          {getClientInitials(client)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    borderCurve: 'continuous',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { color: semanticColors.accent, letterSpacing: 0.5 },
});
