import { appointmentPastels, colors, foregroundSoft } from '@/shared/ui/theme';

import {
  agendaAppointmentPalettes,
  agendaAppointmentPaletteVariants,
  getAgendaAppointmentCardColors,
  getAppointmentColorIdentity,
  resolveAgendaAppointmentPalettes,
  resolveClientPaletteIndexes,
  type AgendaAppointmentPaletteVariant,
} from '../appointment-palette';

// The approved "Appointment Card Color Palette" reference, in palette order.
const approvedFamilies = {
  mint: { background: '#DDF5E7', accent: '#14875B', title: '#0C5B3D', subtitle: '#14875B' },
  powderBlue: { background: '#E7EEFF', accent: '#5B72D6', title: '#394A99', subtitle: '#5B72D6' },
  softRose: { background: '#FCE8F1', accent: '#D65C8B', title: '#963C61', subtitle: '#D65C8B' },
  sand: { background: '#F4EBDD', accent: '#B48A55', title: '#7E5D38', subtitle: '#B48A55' },
  sage: { background: '#E7F1DC', accent: '#6C9A47', title: '#476C2D', subtitle: '#6C9A47' },
  softIndigo: { background: '#E9E9FF', accent: '#6565CF', title: '#41418E', subtitle: '#6565CF' },
  coral: { background: '#FDE8E1', accent: '#E46F4F', title: '#9C3E29', subtitle: '#E46F4F' },
  softYellow: { background: '#FFF6D6', accent: '#D0A526', title: '#8A6A09', subtitle: '#D0A526' },
  aqua: { background: '#DFF4F1', accent: '#2B9D90', title: '#17665E', subtitle: '#2B9D90' },
  lilac: { background: '#EEE7FF', accent: '#7B5BD6', title: '#513A99', subtitle: '#7B5BD6' },
  peach: { background: '#FCEAD8', accent: '#D96A16', title: '#9B4209', subtitle: '#D96A16' },
  pistachio: { background: '#EEF3D9', accent: '#8DAA35', title: '#5E7420', subtitle: '#8DAA35' },
  skyBlue: { background: '#E2F1FF', accent: '#2785C7', title: '#155B8A', subtitle: '#2785C7' },
  lavender: { background: '#F2E8FF', accent: '#9A5BC8', title: '#65378A', subtitle: '#9A5BC8' },
  apricot: { background: '#FBE6CC', accent: '#C77717', title: '#8A4D0A', subtitle: '#C77717' },
} as const satisfies Record<AgendaAppointmentPaletteVariant, Record<string, string>>;

const approvedVariants = Object.keys(approvedFamilies) as AgendaAppointmentPaletteVariant[];

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

describe('Agenda appointment palette', () => {
  it('offers exactly the fifteen approved families with their approved values', () => {
    expect(approvedVariants).toHaveLength(15);
    expect(appointmentPastels).toEqual(approvedFamilies);
    expect(agendaAppointmentPaletteVariants).toEqual(approvedVariants);
    expect(
      agendaAppointmentPalettes.map(({ variant, background, accent, primaryText, secondaryText }) => [
        variant,
        { background, accent, title: primaryText, subtitle: secondaryText },
      ]),
    ).toEqual(Object.entries(approvedFamilies));
  });

  it('keeps every family distinct from the others', () => {
    for (const tone of ['background', 'accent', 'title', 'subtitle'] as const) {
      expect(new Set(approvedVariants.map((variant) => appointmentPastels[variant][tone])).size).toBe(
        approvedVariants.length,
      );
    }
  });

  it('only uses flat solid colours', () => {
    for (const variant of approvedVariants) {
      for (const value of Object.values(appointmentPastels[variant])) {
        expect(value).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it('never gives an active appointment a grey, disabled-looking fill', () => {
    for (const variant of approvedVariants) {
      expect(appointmentPastels[variant].background).not.toBe(colors.surface);
      expect(appointmentPastels[variant].background).not.toBe(colors.background);
    }
  });

  it('keeps the client name and the status text readable on every fill', () => {
    // The approved subtitle equals the accent (2.1–4.1:1): a recorded design
    // decision (DESIGN_OVERRIDES.md §19), so only its ordering is asserted below.
    for (const variant of approvedVariants) {
      const { background, title } = appointmentPastels[variant];
      expect(contrast(title, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foregroundSoft, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(foregroundSoft, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Agenda appointment text colors', () => {
  const byVariant = new Map(agendaAppointmentPalettes.map((palette) => [palette.variant, palette]));

  it('resolves every family to its own title and subtitle tones', () => {
    expect(byVariant.size).toBe(approvedVariants.length);
    for (const [variant, palette] of byVariant) {
      expect(palette.primaryText).toBe(appointmentPastels[variant].title);
      expect(palette.secondaryText).toBe(appointmentPastels[variant].subtitle);
    }
    expect(new Set([...byVariant.values()].map((palette) => palette.primaryText)).size).toBe(
      approvedVariants.length,
    );
    expect(new Set([...byVariant.values()].map((palette) => palette.secondaryText)).size).toBe(
      approvedVariants.length,
    );
  });

  it('never falls back to the generic navy or soft grey on a live card', () => {
    for (const palette of byVariant.values()) {
      const live = getAgendaAppointmentCardColors(palette, 'SCHEDULED');
      for (const text of [live.primaryText, live.secondaryText, live.tertiaryText]) {
        expect(text).not.toBe(colors.foreground);
        expect(text).not.toBe(foregroundSoft);
      }
    }
  });

  it('keeps the client name darker than the service line, both darker than the fill', () => {
    for (const palette of byVariant.values()) {
      expect(relativeLuminance(palette.primaryText)).toBeLessThan(
        relativeLuminance(palette.secondaryText),
      );
      expect(relativeLuminance(palette.secondaryText)).toBeLessThan(
        relativeLuminance(palette.background),
      );
    }
  });
});

describe('Agenda appointment card colors', () => {
  const palette = resolveAgendaAppointmentPalettes([])({ id: 'agenda-sofia', clientId: 'client-sofia' });

  it.each(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const)(
    'writes a %s appointment in its own family on a flat fill',
    (status) => {
      expect(getAgendaAppointmentCardColors(palette, status)).toMatchObject({
        background: palette.background,
        accent: palette.accent,
        primaryText: palette.primaryText,
        secondaryText: palette.secondaryText,
        tertiaryText: palette.secondaryText,
        elevated: true,
      });
    },
  );

  it('keeps a completed appointment in its own family under soft text', () => {
    expect(getAgendaAppointmentCardColors(palette, 'COMPLETED')).toEqual({
      background: palette.background,
      accent: palette.accent,
      primaryText: foregroundSoft,
      secondaryText: foregroundSoft,
      tertiaryText: foregroundSoft,
      elevated: false,
    });
  });

  it.each(['CANCELLED', 'NO_SHOW'] as const)('desaturates a %s appointment', (status) => {
    expect(getAgendaAppointmentCardColors(palette, status)).toMatchObject({
      background: colors.surface,
      accent: colors.muted,
      elevated: false,
    });
  });
});

describe('Client-based colour assignment', () => {
  const clients = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `appointment-${index}`,
      clientId: `client-${index}`,
    }));

  it('gives every appointment of one client the same palette', () => {
    const main = { id: 'appointment-main', clientId: 'client-amel' };
    const reprise = { id: 'appointment-reprise', clientId: 'client-amel' };
    const other = { id: 'appointment-nora', clientId: 'client-nora' };
    const paletteOf = resolveAgendaAppointmentPalettes([main, other, reprise]);

    expect(paletteOf(reprise)).toBe(paletteOf(main));
    expect(paletteOf(other)).not.toBe(paletteOf(main));
  });

  it('gives up to fifteen visible clients fifteen different families', () => {
    for (let count = 2; count <= approvedVariants.length; count += 1) {
      const day = clients(count);
      const paletteOf = resolveAgendaAppointmentPalettes(day);

      expect(new Set(day.map((appointment) => paletteOf(appointment).variant)).size).toBe(count);
    }
  });

  it('resolves collisions even when every client prefers the same family', () => {
    // Search ids that all hash to the preferred family of the first one.
    const preferredOf = (clientId: string) =>
      resolveAgendaAppointmentPalettes([])({ id: 'unused', clientId }).variant;
    const target = preferredOf('client-0');
    const colliding: string[] = [];
    for (let index = 0; colliding.length < 5; index += 1) {
      if (preferredOf(`client-${index}`) === target) colliding.push(`client-${index}`);
    }
    const day = colliding.map((clientId) => ({ id: `appointment-${clientId}`, clientId }));
    const paletteOf = resolveAgendaAppointmentPalettes(day);

    expect(new Set(day.map((appointment) => paletteOf(appointment).variant)).size).toBe(5);
    expect(day.filter((appointment) => paletteOf(appointment).variant === target)).toHaveLength(1);
  });

  it('never moves a client off its preferred family for a displaced neighbour', () => {
    const identities = clients(10).map(getAppointmentColorIdentity);
    const alone = (identity: string) => resolveClientPaletteIndexes([identity], 15).get(identity);
    const together = resolveClientPaletteIndexes(identities, 15);
    const keptPreferred = identities.filter((identity) => together.get(identity) === alone(identity));
    const preferredFamilies = new Set(identities.map(alone));

    // One winner per preferred family keeps it; only the colliding others move.
    expect(keptPreferred).toHaveLength(preferredFamilies.size);
  });

  it('does not spend several families on one client', () => {
    const day = [
      ...Array.from({ length: 6 }, (_, index) => ({ id: `amel-${index}`, clientId: 'client-amel' })),
      ...clients(14),
    ];
    const paletteOf = resolveAgendaAppointmentPalettes(day);

    // 15 clients, 20 appointments: still one family per client, none shared.
    expect(new Set(day.map((appointment) => paletteOf(appointment).variant)).size).toBe(15);
  });

  it('is deterministic across repeated calls', () => {
    const day = clients(12);
    const first = day.map((appointment) => resolveAgendaAppointmentPalettes(day)(appointment));
    const second = day.map((appointment) => resolveAgendaAppointmentPalettes(day)(appointment));

    expect(second).toEqual(first);
  });

  it('does not depend on appointment order', () => {
    const day = clients(12);
    const shuffled = [...day.slice(5), ...day.slice(0, 5)].reverse();
    const forward = resolveAgendaAppointmentPalettes(day);
    const reordered = resolveAgendaAppointmentPalettes(shuffled);

    for (const appointment of day) {
      expect(reordered(appointment)).toBe(forward(appointment));
    }
  });

  it('reuses families gracefully beyond fifteen clients', () => {
    const day = clients(40);
    const paletteOf = resolveAgendaAppointmentPalettes(day);
    const variants = day.map((appointment) => paletteOf(appointment).variant);

    expect(variants.every((variant) => approvedVariants.includes(variant))).toBe(true);
    expect(new Set(variants).size).toBe(approvedVariants.length);
    expect(day.map((appointment) => resolveAgendaAppointmentPalettes(day)(appointment).variant)).toEqual(
      variants,
    );
  });

  it('only ever returns valid palette indexes', () => {
    const identities = clients(40).map(getAppointmentColorIdentity);

    for (const index of resolveClientPaletteIndexes(identities, 15).values()) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(15);
    }
    expect(resolveClientPaletteIndexes(identities, 0).size).toBe(0);
  });

  it('falls back to the appointment id when there is no client id', () => {
    const orphanA = { id: 'appointment-orphan-a', clientId: '' };
    const orphanB = { id: 'appointment-orphan-b', clientId: null };
    const orphanC = { id: 'appointment-orphan-c' };

    expect(getAppointmentColorIdentity(orphanA)).toBe('appointment:appointment-orphan-a');
    expect(getAppointmentColorIdentity(orphanB)).toBe('appointment:appointment-orphan-b');
    expect(getAppointmentColorIdentity({ id: 'a', clientId: 'client-amel' })).toBe('client:client-amel');

    const day = [orphanA, orphanB, orphanC, ...clients(5)];
    const paletteOf = resolveAgendaAppointmentPalettes(day);
    // Orphans are separate identities: distinct from each other and from the clients.
    expect(new Set(day.map((appointment) => paletteOf(appointment).variant)).size).toBe(day.length);
    expect(resolveAgendaAppointmentPalettes(day)(orphanA)).toBe(paletteOf(orphanA));
  });

  it('still colours an appointment that was not part of the resolved day', () => {
    const paletteOf = resolveAgendaAppointmentPalettes([]);

    expect(agendaAppointmentPalettes).toContain(paletteOf({ id: 'late', clientId: 'client-late' }));
  });
});
