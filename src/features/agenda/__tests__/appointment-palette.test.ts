import {
  getAgendaAppointmentPaletteVariant,
  type AgendaAppointmentPaletteVariant,
} from '../appointment-palette';

const approvedVariants: readonly AgendaAppointmentPaletteVariant[] = [
  'lavender',
  'peach',
  'neutral',
];

describe('Agenda appointment palette', () => {
  it('keeps the same appointment identity on one stable variant', () => {
    expect(getAgendaAppointmentPaletteVariant('agenda-sofia')).toBe(
      getAgendaAppointmentPaletteVariant('agenda-sofia'),
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

  it('returns only approved palette variants', () => {
    const variants = ['agenda-lea', 'agenda-camille', 'agenda-sofia', 'agenda-nadia'].map(
      getAgendaAppointmentPaletteVariant,
    );

    expect(variants.every((variant) => approvedVariants.includes(variant))).toBe(true);
  });
});
