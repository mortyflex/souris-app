import type { AppointmentStatus } from '@/domain/appointments';
import { appointmentPastels, colors, foregroundSoft } from '@/shared/ui/theme';

export type AgendaAppointmentPaletteVariant = keyof typeof appointmentPastels;

export interface AgendaAppointmentPalette {
  readonly variant: AgendaAppointmentPaletteVariant;
  /** Flat solid pastel fill — never a gradient, never an overlay. */
  readonly background: string;
  readonly accent: string;
  /** Client name — the family's dark title tone. */
  readonly primaryText: string;
  /** Service line and inline states — the family's subtitle tone. */
  readonly secondaryText: string;
}

export const agendaAppointmentPaletteVariants = Object.keys(
  appointmentPastels,
) as readonly AgendaAppointmentPaletteVariant[];

export const agendaAppointmentPalettes: readonly AgendaAppointmentPalette[] =
  agendaAppointmentPaletteVariants.map((variant) => ({
    variant,
    background: appointmentPastels[variant].background,
    accent: appointmentPastels[variant].accent,
    primaryText: appointmentPastels[variant].title,
    secondaryText: appointmentPastels[variant].subtitle,
  }));

/** The only fields colour assignment reads from an Appointment. */
export interface AppointmentColorSource {
  readonly id: string;
  readonly clientId?: string | null;
}

/**
 * What a card's colour stands for. Colour identifies the CLIENT (stable id,
 * never the mutable name). An appointment without a client id falls back to
 * its own id, so it still resolves to one valid, deterministic family.
 */
export function getAppointmentColorIdentity(appointment: AppointmentColorSource): string {
  const clientId = appointment.clientId?.trim();
  return clientId ? `client:${clientId}` : `appointment:${appointment.id}`;
}

// FNV-1a: spreads similar ids (sequential, shared prefix) across the palette.
function hashIdentity(identity: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Resolves one palette index per identity for the identities visible together.
 *
 * Every identity prefers `hash(identity) % paletteCount`. Identities are
 * visited in sorted order, never in appointment order, so the result only
 * depends on WHO is visible:
 *   1. each preferred index goes to the first identity that asks for it;
 *   2. the others probe forward to the next free index — they never take a
 *      family another visible identity prefers and obtained.
 * Up to `paletteCount` identities therefore all differ. Beyond that every
 * family is taken and the remaining identities reuse their preferred one.
 */
export function resolveClientPaletteIndexes(
  identities: readonly string[],
  paletteCount: number,
): ReadonlyMap<string, number> {
  const indexes = new Map<string, number>();
  if (!Number.isInteger(paletteCount) || paletteCount < 1) return indexes;

  const taken = new Set<number>();
  const displaced: string[] = [];
  for (const identity of [...new Set(identities)].sort()) {
    const preferred = hashIdentity(identity) % paletteCount;
    if (taken.has(preferred)) {
      displaced.push(identity);
    } else {
      taken.add(preferred);
      indexes.set(identity, preferred);
    }
  }
  for (const identity of displaced) {
    let index = hashIdentity(identity) % paletteCount;
    if (taken.size < paletteCount) {
      while (taken.has(index)) index = (index + 1) % paletteCount;
      taken.add(index);
    }
    indexes.set(identity, index);
  }
  return indexes;
}

export type AgendaAppointmentPaletteLookup = (
  appointment: AppointmentColorSource,
) => AgendaAppointmentPalette;

/**
 * Client colours for the appointments shown together (one Agenda day). Every
 * appointment, segment and reprise of one client gets the same family;
 * different clients get different families while the palette allows it.
 */
export function resolveAgendaAppointmentPalettes(
  visibleAppointments: readonly AppointmentColorSource[],
): AgendaAppointmentPaletteLookup {
  const indexes = resolveClientPaletteIndexes(
    visibleAppointments.map(getAppointmentColorIdentity),
    agendaAppointmentPalettes.length,
  );
  return (appointment) => {
    const identity = getAppointmentColorIdentity(appointment);
    const index = indexes.get(identity) ?? hashIdentity(identity) % agendaAppointmentPalettes.length;
    return agendaAppointmentPalettes[index];
  };
}

export interface AgendaAppointmentCardColors {
  readonly background: string;
  readonly accent: string;
  readonly primaryText: string;
  readonly secondaryText: string;
  /** Third-level text (phase, reprise) — stays in the card's family while it is live. */
  readonly tertiaryText: string;
  /** Only live appointments carry the soft card shadow. */
  readonly elevated: boolean;
}

/**
 * Status treatment of one palette: scheduled / confirmed / in-progress write
 * the card in its own family, completed keeps the family fill and accent under
 * soft text, cancelled and no-show lose their colour. Every fill is flat. An
 * active appointment never reads as disabled.
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
      elevated: false,
    };
  }
  if (status === 'COMPLETED') {
    return {
      background: palette.background,
      accent: palette.accent,
      primaryText: foregroundSoft,
      secondaryText: foregroundSoft,
      tertiaryText: foregroundSoft,
      elevated: false,
    };
  }
  return {
    background: palette.background,
    accent: palette.accent,
    primaryText: palette.primaryText,
    secondaryText: palette.secondaryText,
    tertiaryText: palette.secondaryText,
    elevated: true,
  };
}
