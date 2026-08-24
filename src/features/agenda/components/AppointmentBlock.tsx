import { Platform, StyleSheet, View } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import { radii } from "@/shared/ui/theme";

import type { AgendaAppointmentPalette } from "../appointment-palette";
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
}

export function AppointmentBlock({
  clientName,
  segment,
  height,
  palette,
}: AppointmentBlockProps) {
  const content = getAgendaSegmentContent(
    segment,
    clientName,
    getAgendaSegmentDensity(height),
  );
  const accessibilityLabel = `${clientName}, ${segment.serviceName}, ${segment.phaseNames.join(", ")}`;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderLeftColor: palette.accent,
        },
      ]}
    >
      {content.mode === "lines" && (
        <>
          <AppText
            variant="rowTitle"
            numberOfLines={1}
            style={[styles.clientName, { color: palette.primaryText }]}
          >
            {content.clientLabel}
          </AppText>
          <AppText
            variant="metadata"
            numberOfLines={1}
            style={[styles.serviceName, { color: palette.secondaryText }]}
          >
            {content.serviceLabel}
            {content.showReprise && (
              <AppText
                variant="chip"
                style={[styles.inlineState, { color: palette.primaryText }]}
              >
                {" · Reprise"}
              </AppText>
            )}
            {content.phaseLabel && !content.phaseOnSeparateLine && (
              <AppText
                variant="metadata"
                style={{ color: palette.secondaryText }}
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
              style={[styles.phaseName, { color: palette.secondaryText }]}
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
          style={[styles.compactLine, { color: palette.primaryText }]}
        >
          {content.compactClientLabel}
          <AppText
            variant={content.compactSecondaryIsReprise ? "chip" : "metadata"}
            style={{ color: palette.secondaryText }}
          >
            {" · "}
            {content.compactSecondaryLabel}
          </AppText>
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radii[Platform.OS === "android" ? "android" : "ios"].default,
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
});
