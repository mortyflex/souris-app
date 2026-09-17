import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import {
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from "@/features/appointments/presentation";
import { gloss, interaction, nativeShadows, radii } from "@/shared/ui/theme";

import {
  getAgendaAppointmentCardColors,
  type AgendaAppointmentPalette,
} from "../appointment-palette";
import type { AgendaStaffSegment } from "../layout/agenda-staff-segments";
import {
  getAgendaSegmentContent,
  getAgendaSegmentDensity,
} from "../segment-content";

interface AppointmentBlockProps {
  readonly clientName: string;
  readonly segment: AgendaStaffSegment;
  readonly height: number;
  readonly palette: AgendaAppointmentPalette;
  readonly onPress: () => void;
}

export function AppointmentBlock({
  clientName,
  segment,
  height,
  palette,
  onPress,
}: AppointmentBlockProps) {
  const content = getAgendaSegmentContent(
    segment,
    clientName,
    getAgendaSegmentDensity(height),
  );
  const statusLabel = isTerminalAppointmentStatus(segment.status)
    ? getAppointmentStatusLabel(segment.status)
    : undefined;
  const cardColors = getAgendaAppointmentCardColors(palette, segment.status);
  // A quarter-hour block is barely taller than two small radii: the corner
  // follows the height so short cards stay planning cards, never pills.
  const borderRadius = Math.min(radii.small, Math.max(3, Math.round(height / 4)));
  const accessibilityLabel = [
    clientName,
    segment.serviceName,
    segment.phaseNames.join(", "),
    statusLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: cardColors.background,
          borderLeftColor: cardColors.accent,
          borderRadius,
        },
        cardColors.glossy && nativeShadows.card,
        pressed && styles.pressed,
      ]}
    >
      {cardColors.glossy && (
        <View pointerEvents="none" style={styles.sheen} testID="appointment-block-gloss">
          <View style={styles.sheenEdge} />
        </View>
      )}
      {content.mode === "lines" && (
        <>
          <AppText
            variant="rowTitle"
            numberOfLines={1}
            style={[styles.clientName, { color: cardColors.primaryText }]}
          >
            {content.clientLabel}
          </AppText>
          <AppText
            variant="metadata"
            numberOfLines={1}
            style={[styles.serviceName, { color: cardColors.secondaryText }]}
          >
            {content.serviceLabel}
            {content.showReprise && (
              <AppText
                variant="metadata"
                style={[styles.inlineState, { color: cardColors.tertiaryText }]}
              >
                {" · Reprise"}
              </AppText>
            )}
            {content.phaseLabel && !content.phaseOnSeparateLine && (
              <AppText
                variant="metadata"
                style={{ color: cardColors.tertiaryText }}
              >
                {" · "}
                {content.phaseLabel}
              </AppText>
            )}
          </AppText>
          {content.phaseLabel && content.phaseOnSeparateLine && (
            <AppText
              variant="metadata"
              numberOfLines={1}
              style={[styles.phaseName, { color: cardColors.tertiaryText }]}
            >
              {content.phaseLabel}
            </AppText>
          )}
        </>
      )}
      {content.mode === "compact" && (
        <AppText
          variant="chip"
          numberOfLines={1}
          style={[styles.compactLine, { color: cardColors.primaryText }]}
        >
          {content.compactClientLabel}
          <AppText
            variant="metadata"
            style={{ color: cardColors.tertiaryText }}
          >
            {" · "}
            {content.compactSecondaryLabel}
          </AppText>
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  // Polished finish: a light vertical sheen under the text, closed by a
  // one-pixel top highlight. Decorative only — never intercepts touches.
  sheen: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gloss.card.sheen,
  },
  sheenEdge: { backgroundColor: gloss.card.edge, height: 1 },
  clientName: { lineHeight: 16 },
  serviceName: { lineHeight: 15 },
  inlineState: { lineHeight: 15 },
  phaseName: { lineHeight: 14 },
  compactLine: { lineHeight: 14 },
  pressed: {
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
