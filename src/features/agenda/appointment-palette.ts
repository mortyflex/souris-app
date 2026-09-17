import type { AppointmentStatus } from '@/domain/appointments';
import { appointmentPastels, colors, foregroundSoft } from '@/shared/ui/theme';

export type AgendaAppointmentPaletteVariant = keyof typeof appointmentPastels;

export interface AgendaAppointmentPalette {
  readonly variant: AgendaAppointmentPaletteVariant;
  /** Vivid pastel fill of an active appointment. */
  readonly background: string;
  /** Calmer tone of the same family, for a completed appointment. */
  readonly calmBackground: string;
  readonly accent: string;
  readonly primaryText: string;
  readonly secondaryText: string;
}

export const agendaAppointmentPaletteVariants = Object.keys(
  appointmentPastels,
) as readonly AgendaAppointmentPaletteVariant[];

const appointmentPalettes: readonly AgendaAppointmentPalette[] =
  agendaAppointmentPaletteVariants.map((variant) => ({
    variant,
    background: appointmentPastels[variant].fill,
    calmBackground: appointmentPastels[variant].calm,
    accent: appointmentPastels[variant].deep,
    primaryText: colors.foreground,
    secondaryText: appointmentPastels[variant].deep,
  }));

/** Stable identity-based palette selection, independent of render order. */
export function getAgendaAppointmentPalette(
  appointmentId: string,
): AgendaAppointmentPalette {
  let hash = 0;
  for (const character of appointmentId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return appointmentPalettes[hash % appointmentPalettes.length];
}

export function getAgendaAppointmentPaletteVariant(
  appointmentId: string,
): AgendaAppointmentPaletteVariant {
  return getAgendaAppointmentPalette(appointmentId).variant;
}

export interface AgendaAppointmentCardColors {
  readonly background: string;
  readonly accent: string;
  readonly primaryText: string;
  readonly secondaryText: string;
  /** Third-level text (phase, reprise) — readable on every fill. */
  readonly tertiaryText: string;
  /** Only live appointments carry the polished finish. */
  readonly glossy: boolean;
}

/**
 * Status treatment of one palette: scheduled / confirmed / in-progress keep the
 * vivid pastel, completed calms down within its own family, cancelled and
 * no-show lose their colour. An active appointment never reads as disabled.
 */
export function getAgendaAppointmentCardColors(
  palette: AgendaAppointmentPalette,
  status: AppointmentStatus,
): AgendaAppointmentCardColors {
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    return {
      background: colors.surface,
      accent: colors.muted,
      primaryText: foregroundSoft,
      secondaryText: foregroundSoft,
      tertiaryText: foregroundSoft,
      glossy: false,
    };
  }
  if (status === 'COMPLETED') {
    return {
      background: palette.calmBackground,
      accent: palette.accent,
      primaryText: foregroundSoft,
      secondaryText: foregroundSoft,
      tertiaryText: foregroundSoft,
      glossy: false,
    };
  }
  return {
    background: palette.background,
    accent: palette.accent,
    primaryText: palette.primaryText,
    secondaryText: palette.secondaryText,
    tertiaryText: foregroundSoft,
    glossy: true,
  };
}
