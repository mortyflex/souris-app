import { Pressable, StyleSheet } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import {
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from "@/features/appointments/presentation";
import { interaction, nativeShadows, radii } from "@/shared/ui/theme";

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
        cardColors.elevated && nativeShadows.card,
        pressed && styles.pressed,
      ]}
    >
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
  clientName: { lineHeight: 16 },
  serviceName: { lineHeight: 15 },
  inlineState: { lineHeight: 15 },
  phaseName: { lineHeight: 14 },
  compactLine: { lineHeight: 14 },
  pressed: {
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
