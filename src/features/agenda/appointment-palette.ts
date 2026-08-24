import { colors, foregroundSoft, lavender, peach } from '@/shared/ui/theme';

export type AgendaAppointmentPaletteVariant = 'lavender' | 'peach' | 'neutral';

export interface AgendaAppointmentPalette {
  readonly variant: AgendaAppointmentPaletteVariant;
  readonly background: string;
  readonly border: string;
  readonly accent: string;
  readonly primaryText: string;
  readonly secondaryText: string;
}

const appointmentPalettes: readonly AgendaAppointmentPalette[] = [
  {
    variant: 'lavender',
    background: lavender.lav050,
    border: lavender.lav200,
    accent: lavender.lav700,
    primaryText: colors.foreground,
    secondaryText: lavender.lav700,
  },
  {
    variant: 'peach',
    background: peach.peach050,
    border: peach.peach200,
    accent: peach.peach700,
    primaryText: colors.foreground,
    secondaryText: peach.peach700,
  },
  {
    variant: 'neutral',
    background: colors.surface,
    border: colors.border,
    accent: foregroundSoft,
    primaryText: colors.foreground,
    secondaryText: foregroundSoft,
  },
];

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
