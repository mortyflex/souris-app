import { appointmentPastels, colors, foregroundSoft } from '@/shared/ui/theme';

import {
  agendaAppointmentPaletteVariants,
  getAgendaAppointmentCardColors,
  getAgendaAppointmentPalette,
  getAgendaAppointmentPaletteVariant,
  type AgendaAppointmentPaletteVariant,
} from '../appointment-palette';

const approvedVariants: readonly AgendaAppointmentPaletteVariant[] = [
  'lavender',
  'blush',
  'peach',
  'mint',
  'powderBlue',
  'butter',
  'coral',
  'lilac',
];

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
  it('keeps the same appointment identity on one stable variant', () => {
    expect(getAgendaAppointmentPaletteVariant('agenda-sofia')).toBe(
      getAgendaAppointmentPaletteVariant('agenda-sofia'),
    );
    expect(getAgendaAppointmentPalette('agenda-sofia')).toBe(
      getAgendaAppointmentPalette('agenda-sofia'),
    );
  });

  it('does not depend on the order in which appointments are rendered', () => {
    const ids = ['agenda-lea', 'agenda-camille', 'agenda-sofia', 'agenda-nadia'];
    const forward = Object.fromEntries(
      ids.map((id) => [id, getAgendaAppointmentPaletteVariant(id)]),
    );
    const reverse = Object.fromEntries(
      [...ids].reverse().map((id) => [id, getAgendaAppointmentPaletteVariant(id)]),
    );

    expect(reverse).toEqual(forward);
  });

  it('returns only approved pastel variants', () => {
    expect([...agendaAppointmentPaletteVariants].sort()).toEqual([...approvedVariants].sort());

    const variants = ['agenda-lea', 'agenda-camille', 'agenda-sofia', 'agenda-nadia'].map(
      getAgendaAppointmentPaletteVariant,
    );

    expect(variants.every((variant) => approvedVariants.includes(variant))).toBe(true);
  });

  it('spreads appointments across the pastel families', () => {
    const variants = new Set(
      Array.from({ length: 64 }, (_, index) => getAgendaAppointmentPaletteVariant(`appointment-${index}`)),
    );

    expect(variants.size).toBe(approvedVariants.length);
  });

  it('never gives an active appointment a grey, disabled-looking fill', () => {
    for (const variant of approvedVariants) {
      expect(appointmentPastels[variant].fill).not.toBe(colors.surface);
      expect(appointmentPastels[variant].fill).not.toBe(colors.background);
    }
  });

  it('keeps every text level readable on every pastel fill', () => {
    for (const variant of approvedVariants) {
      const { calm, fill, deep } = appointmentPastels[variant];
      expect(contrast(colors.foreground, fill)).toBeGreaterThanOrEqual(7);
      expect(contrast(deep, fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foregroundSoft, fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foregroundSoft, calm)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(foregroundSoft, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Agenda appointment card colors', () => {
  const palette = getAgendaAppointmentPalette('agenda-sofia');

  it.each(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const)(
    'gives a %s appointment the vivid glossy pastel',
    (status) => {
      expect(getAgendaAppointmentCardColors(palette, status)).toMatchObject({
        background: palette.background,
        accent: palette.accent,
        primaryText: colors.foreground,
        glossy: true,
      });
    },
  );

  it('calms a completed appointment within its own family', () => {
    expect(getAgendaAppointmentCardColors(palette, 'COMPLETED')).toMatchObject({
      background: palette.calmBackground,
      accent: palette.accent,
      primaryText: foregroundSoft,
      glossy: false,
    });
  });

  it.each(['CANCELLED', 'NO_SHOW'] as const)('desaturates a %s appointment', (status) => {
    expect(getAgendaAppointmentCardColors(palette, status)).toMatchObject({
      background: colors.surface,
      accent: colors.muted,
      glossy: false,
    });
  });
});
